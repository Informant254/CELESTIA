"""NOVAHEX Media Engine: guarded media downloads for chat bots."""
import ipaddress
import json
import logging
import os
import re
import shutil
import socket
import subprocess
import tempfile
import threading
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask

app = FastAPI(title="NOVAHEX Media Engine", version="0.1.0")
logger = logging.getLogger("novahex")
MAX_BYTES = min(max(int(os.getenv("MAX_MEDIA_MB", "35")), 1), 100) * 1024 * 1024
SLOTS = threading.BoundedSemaphore(2)
DOMAINS = (
    "youtube.com", "youtu.be", "youtube-nocookie.com", "vimeo.com",
    "tiktok.com", "instagram.com", "facebook.com", "fb.watch",
    "reddit.com", "redd.it", "soundcloud.com", "twitter.com", "x.com"
)
EXTENSIONS = {
    ".mp4", ".m4v", ".mov", ".webm", ".mp3", ".m4a", ".wav",
    ".ogg", ".opus", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"
}

class MediaRequest(BaseModel):
    url: str = Field(min_length=12, max_length=2048)
    kind: str = Field(default="auto", pattern="^(auto|direct|platform)$")
    quality: str = Field(default="best", pattern="^(best|720p|1080p|audio)$")

def fail(status: int, code: str, message: str):
    raise HTTPException(status_code=status, detail={"code": code, "message": message})

def auth(x_api_key: str | None = Header(default=None)):
    import secrets
    secret = os.getenv("NOVAHEX_API_KEY", "")
    if not secret:
        fail(503, "NOT_CONFIGURED", "Server API key not configured")
    if not x_api_key or not secrets.compare_digest(x_api_key, secret):
        fail(401, "UNAUTHORIZED", "Valid X-API-Key header required")

def validate_url(raw: str) -> tuple[str, str]:
    try:
        p = urlsplit(raw)
        host = (p.hostname or "").lower().rstrip(".")
        port = p.port
    except ValueError:
        fail(422, "BAD_URL", "Invalid URL")
    if p.scheme != "https" or not host or p.username or p.password or port not in (None, 443):
        fail(422, "BAD_URL", "Only public HTTPS URLs on port 443 are accepted")
    if any(x in raw for x in ("\r", "\n", "\t")):
        fail(422, "BAD_URL", "Malformed URL")
    try:
        addrs = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except OSError:
        fail(422, "DNS_FAILURE", "Source hostname could not be resolved")
    if not addrs:
        fail(422, "DNS_FAILURE", "Source hostname has no public IP")
    for addr in addrs:
        if not ipaddress.ip_address(addr[4][0]).is_global:
            fail(422, "UNSAFE_URL", "Source resolves to a private or reserved IP")
    return raw, host

def platform(host: str) -> bool:
    return any(host == x or host.endswith("." + x) for x in DOMAINS)

def classify(kind: str, host: str) -> str:
    if kind == "platform" and not platform(host):
        fail(422, "UNSUPPORTED_PLATFORM", "Platform mode requires an approved public media platform")
    return ("platform" if platform(host) else "direct") if kind == "auto" else kind

def source_error(stderr: str):
    msg = stderr.lower()
    if any(x in msg for x in ("http error 403", "http error 429", "sign in", "login required", "verify you are human", "not available in your country")):
        fail(424, "SOURCE_RESTRICTED", "Media source requires authorization or is blocking this host")
    fail(424, "SOURCE_UNAVAILABLE", "Source is unavailable; try an authorized direct-media URL")

def command(url: str, directory: Path, quality: str, info: bool = False) -> list[str]:
    args = [
        "yt-dlp", "--ignore-config", "--no-playlist", "--no-cache-dir",
        "--no-progress", "--socket-timeout", "12", "--retries", "2",
        "--fragment-retries", "2", "--max-filesize", str(MAX_BYTES),
        "--no-overwrites"
    ]
    if info:
        return args + ["--skip-download", "--dump-single-json", "--", url]
    if quality == "audio":
        args += ["-f", "bestaudio/best", "-x", "--audio-format", "mp3", "--audio-quality", "0"]
    elif quality in ("720p", "1080p"):
        limit = "720" if quality == "720p" else "1080"
        args += ["-f", "bv*[height<=" + limit + "]+ba/b[height<=" + limit + "]/best", "--merge-output-format", "mp4"]
    else:
        args += ["-f", "bv*+ba/best", "--merge-output-format", "mp4"]
    return args + ["-o", str(directory / "media.%(ext)s"), "--", url]

def download_platform(request: MediaRequest, tmp: Path) -> Path:
    try:
        result = subprocess.run(command(request.url, tmp, request.quality),
                                cwd=tmp, capture_output=True, text=True, timeout=150)
    except subprocess.TimeoutExpired:
        fail(504, "SOURCE_TIMEOUT", "Media source timed out")
    except FileNotFoundError:
        fail(503, "EXTRACTOR_MISSING", "Media extractor not installed")
    if result.returncode:
        logger.warning("Extractor exit code: %s", result.returncode)
        source_error(result.stderr[-3000:])
    files = [p for p in tmp.iterdir() if p.is_file() and p.suffix.lower() in EXTENSIONS]
    if not files:
        fail(424, "EMPTY_DOWNLOAD", "No downloadable media was produced")
    media = max(files, key=lambda p: p.stat().st_size)
    if media.stat().st_size > MAX_BYTES:
        fail(413, "MEDIA_TOO_LARGE", "Media exceeds size limit")
    return media

def download_direct(request: MediaRequest, tmp: Path) -> Path:
    url = request.url
    try:
        with httpx.Client(
            timeout=httpx.Timeout(12.0, read=30.0), follow_redirects=False,
            trust_env=False, headers={"User-Agent": "NOVAHEX-Media-Engine/0.1"}
        ) as client:
            for _ in range(6):
                validate_url(url)
                with client.stream("GET", url) as resp:
                    if resp.status_code in (301, 302, 303, 307, 308):
                        new = resp.headers.get("location")
                        if not new:
                            fail(424, "BROKEN_REDIRECT", "Redirect was missing target")
                        url = urljoin(url, new)
                        continue
                    if resp.status_code in (401, 403, 429):
                        fail(424, "SOURCE_RESTRICTED", "Media source rejected access")
                    if resp.status_code >= 400:
                        fail(424, "SOURCE_UNAVAILABLE", "Source HTTP error " + str(resp.status_code))
                    mime = resp.headers.get("content-type", "").split(";")[0].lower().strip()
                    if not mime.startswith(("video/", "audio/", "image/")) and mime != "application/octet-stream":
                        fail(415, "NOT_MEDIA", "URL did not return media content")
                    length = resp.headers.get("content-length", "")
                    if length.isdigit() and int(length) > MAX_BYTES:
                        fail(413, "MEDIA_TOO_LARGE", "Media exceeds size limit")
                    ext = Path(urlsplit(url).path).suffix.lower()
                    if ext not in EXTENSIONS:
                        ext = {
                            "image/jpeg": ".jpg", "image/png": ".png",
                            "image/webp": ".webp", "image/gif": ".gif",
                            "video/mp4": ".mp4", "video/webm": ".webm",
                            "audio/mpeg": ".mp3", "audio/mp4": ".m4a"
                        }.get(mime, "")
                    if not ext:
                        fail(415, "UNKNOWN_MEDIA", "Media type is not supported")
                    target = tmp / ("media" + ext)
                    size = 0
                    with target.open("wb") as fp:
                        for chunk in resp.iter_bytes(chunk_size=65536):
                            size += len(chunk)
                            if size > MAX_BYTES:
                                fail(413, "MEDIA_TOO_LARGE", "Media exceeds size limit")
                            fp.write(chunk)
                    if not size:
                        fail(424, "EMPTY_DOWNLOAD", "The source returned an empty file")
                    return target
            fail(424, "TOO_MANY_REDIRECTS", "Too many media redirects")
    except (httpx.TimeoutException, httpx.TransportError):
        fail(424, "SOURCE_NETWORK_ERROR", "Network error reaching media source")

@app.get("/")
def root():
    return {"name": "NOVAHEX Media Engine", "status": "online", "docs": "/docs"}

@app.get("/health")
def health():
    return {"status": "ok", "configured": bool(os.getenv("NOVAHEX_API_KEY"))}

@app.post("/v1/inspect", dependencies=[Depends(auth)])
def inspect(request: MediaRequest):
    _, host = validate_url(request.url)
    kind = classify(request.kind, host)
    if kind == "direct":
        return {"type": "direct", "source": host, "formats": ["original"], "limit_bytes": MAX_BYTES}
    try:
        proc = subprocess.run(command(request.url, Path("."), request.quality, True),
                              capture_output=True, text=True, timeout=35)
    except subprocess.TimeoutExpired:
        fail(504, "SOURCE_TIMEOUT", "Inspection timed out")
    except FileNotFoundError:
        fail(503, "EXTRACTOR_MISSING", "Media extractor not installed")
    if proc.returncode:
        source_error(proc.stderr[-3000:])
    try:
        info = json.loads(proc.stdout)
    except ValueError:
        fail(424, "INVALID_METADATA", "Media metadata was invalid")
    return {
        "type": "platform", "source": host,
        "title": str(info.get("title") or "")[:250],
        "duration_seconds": info.get("duration"),
        "qualities": ["best", "1080p", "720p", "audio"],
        "limit_bytes": MAX_BYTES
    }

@app.post("/v1/download", dependencies=[Depends(auth)])
def download(request: MediaRequest):
    _, host = validate_url(request.url)
    kind = classify(request.kind, host)
    if not SLOTS.acquire(blocking=False):
        fail(429, "BUSY", "Download capacity reached; retry shortly")
    tmp = Path(tempfile.mkdtemp(prefix="novahex_"))
    try:
        path = download_platform(request, tmp) if kind == "platform" else download_direct(request, tmp)
        name = re.sub(r"[^a-zA-Z0-9._-]", "_", path.name)[:120]
        return FileResponse(
            str(path), filename=name, media_type="application/octet-stream",
            background=BackgroundTask(lambda: (shutil.rmtree(tmp, ignore_errors=True), SLOTS.release()))
        )
    except Exception:
        shutil.rmtree(tmp, ignore_errors=True)
        SLOTS.release()
        raise
