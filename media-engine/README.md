# NOVAHEX Media Engine (v0.1)

Standalone media API for bots. Public direct HTTPS media is the reliable baseline. Supported social sites use yt-dlp on a best-effort basis, with clear errors for 403/429/access challenges. Never attempts DRM bypass or authentication circumvention.

## API
- GET /health - public health check
- POST /v1/inspect - inspect supported media
- POST /v1/download - returns original/converted media file
- GET /docs - OpenAPI documentation

POST JSON: {"url":"https://example.com/video.mp4","kind":"auto","quality":"720p"}. Valid kinds: auto, direct, platform. Valid quality: best, 720p, 1080p, audio.

Protect POST endpoints with X-API-Key (matches the server's NOVAHEX_API_KEY environment variable). MAX_MEDIA_MB defaults to 35.

Bot integration (Node.js):

const response = await fetch(process.env.MEDIA_API_URL + '/v1/download', {
  method: 'POST',
  headers: { 'X-API-Key': process.env.MEDIA_API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: mediaUrl, kind: 'auto', quality: '720p' })
});
if (!response.ok) throw new Error('Media download failed: ' + await response.text());
const bytes = Buffer.from(await response.arrayBuffer());
// Supply bytes to your bot and obey platform upload-size limits.

This is an MVP, not a 24/7 uptime SLA. Free Render services can idle/sleep and use ephemeral disks. For production, use an always-on worker, a rate limiter, outbound network isolation to guard against DNS rebinding, and bot-side user access control.
