# Self-hosted CELESTIA pairing station

Public URL on the existing CELESTIA server:

https://celestia-cloud.spaincentral.cloudapp.azure.com/pair/

Build and run from the repository root:

```sh
docker compose -f deploy/pairing/compose.yml up -d --build
```

The service connects to the private `celestia-cloud_control` Docker network.
It listens on port 3001 without publishing a host port. Caddy handles HTTPS:

```caddyfile
redir /pair /pair/ 308
handle_path /pair/* {
    reverse_proxy celestia-pairing:3001
}
```

Keep the existing console/API routes in their own `handle` blocks after this
route. Pairing returns an authenticated `CELESTIA:~...` session export only
after WhatsApp accepts the code and the linked socket connects. The station
closes that socket before handing off credentials to the bot deployment.

Enter your WhatsApp number with its country code, request a code, and enter it
under **WhatsApp → Linked Devices → Link a Device → Link with phone number
instead**. Copy or download the resulting session ID and store it as the
bot's `SESSION_ID`. Pairing itself does not launch another bot worker.

## Background music

Tap **Play background music** for the original **Starlight** ambient loop.
The browser generates it locally using Web Audio, so there is no external
music provider or audio download. A volume slider and pause control are
available. Playback pauses when you switch away to WhatsApp.
