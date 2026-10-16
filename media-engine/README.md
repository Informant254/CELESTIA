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


## Render manual deployment (when API repository resolution fails)

Use Render Dashboard > New > Web Service > **Git Provider**. Select the **Informant254/CELESTIA** repository and then:

| Setting | Value |
| --- | --- |
| Name | novahex-media-engine |
| Branch | feature/novahex-media-engine-v1 |
| Runtime | Docker |
| Dockerfile Path | media-engine/Dockerfile |
| Docker Context | media-engine |
| Plan | Free for testing (sleeps when idle) |
| Region | Frankfurt |
| Health Check Path | /health |

Under Environment add `NOVAHEX_API_KEY` with your secret key and `MAX_MEDIA_MB=35`. Keep the API key out of Git and bot chat messages. After a successful deploy check `/health` and `/docs`. The source repo's root Render Blueprint is reserved for CELESTIA and must not be used for this standalone service.

**Important:** Connect the repository in Render's Git Deployment Credentials, not only in ChatGPT's separate GitHub plugin. Do not merge this feature branch into CELESTIA's main branch to deploy the media engine.
