<p align="center">
  <img src="assets/logo.png" width="420" alt="CELESTIA Logo"/>
</p>

<p align="center">
  <a href="https://heroku.com/deploy?template=https://github.com/Informant254/CELESTIA"><img src="https://img.shields.io/badge/Deploy-Heroku-430098?style=for-the-badge&logo=heroku&logoColor=white" alt="Deploy to Heroku"/></a>
  <a href="https://railway.app/new/template?template=https://github.com/Informant254/CELESTIA"><img src="https://img.shields.io/badge/Deploy-Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white" alt="Deploy on Railway"/></a>
  <a href="https://render.com/deploy?repo=https://github.com/Informant254/CELESTIA"><img src="https://img.shields.io/badge/Deploy-Render-0a0f1f?style=for-the-badge&logo=render&logoColor=46E3B7" alt="Deploy to Render"/></a>
  <a href="https://app.koyeb.com/deploy?type=git&repository=github.com/Informant254/CELESTIA&branch=main&builder=dockerfile&name=celestia"><img src="https://img.shields.io/badge/Deploy-Koyeb-121212?style=for-the-badge&logo=koyeb&logoColor=white" alt="Deploy to Koyeb"/></a>
  <a href="https://replit.com/github/Informant254/CELESTIA"><img src="https://img.shields.io/badge/Run_on-Replit-F26207?style=for-the-badge&logo=replit&logoColor=white" alt="Run on Replit"/></a>
  <a href="https://celestia-cloud.spaincentral.cloudapp.azure.com/pair/"><img src="https://img.shields.io/badge/Pair_Now-CELESTIA_Pairing-7c4dff?style=for-the-badge&logo=whatsapp&logoColor=white" alt="Pair on CELESTIA's self-hosted pairing station"/></a>
</p>

<p align="center">
  🔗 <b>Pair your number:</b> <a href="https://celestia-cloud.spaincentral.cloudapp.azure.com/pair/">Open CELESTIA Pairing Station</a> — get your code, link WhatsApp, and copy or download the session for <code>SESSION_ID</code>.
</p>

<h1 align="center">✨ CELESTIA ✨</h1>
<p align="center"><b>The Most Beautiful WhatsApp Bot</b><br>
<i>Heavenly • VPS Hostable • Hardened • 414 Commands</i></p>

<p align="center">
  <img src="https://img.shields.io/badge/CELESTIA-Beautiful-ff2e93?style=for-the-badge"/>
  <img src="https://img.shields.io/badge/Commands-414-7c4dff?style=for-the-badge"/>
  <img src="https://img.shields.io/badge/VPS-Ready-00f5ff?style=for-the-badge"/>
  <img src="https://img.shields.io/badge/Baileys-7.x-0a0f1f?style=for-the-badge"/>
  <img src="https://img.shields.io/badge/Inspired%20by-WolfTech%20🐺-0a0f1f?style=for-the-badge&logo=wolf&logoColor=00f5ff"/>
</p>

<p align="center">
  <i>🐺 Howl of the Wolf → ✨ Light of the Stars — WolfTech howled, CELESTIA ascended.</i>
</p>

---

### 🌸 What is CELESTIA?

**CELESTIA** is **The Most Beautiful WhatsApp Bot** ✨ - heavenly, VPS-hostable, hardened. 414 elegant commands, safe group tools, AI, media, automation. Built for beauty and power.

> *Heavenly elegance, beautiful power.*
> *Forged in the Wolf's Den, Crowned in Celestial Heaven.*

---

### 🐺 Inspired by WolfTech — The Origin Howl

**CELESTIA didn't start from silence. She started from a howl.**

> Before heaven, there was the hunt. **WolfTech** prowled the dark — raw, feral, unstoppable code. It taught us to build bots that *don't kneel, don't break, don't sleep.*
> **CELESTIA** looked up and turned that hunt into *light*. 414 celestial commands, heavenly VPS armor, hardened grace. Same fang, new crown.

```
🐺 WOLFTECH gave the fang.
✨ CELESTIA gave the crown.
🌙 Together → Legend.
```

**Lineage:** `WolfTech (feral power) → CELESTIA (heavenly evolution)` — not a copy, *an ascension*.

- **WolfTech DNA:** hunt logic, spam engine, group ferocity, never-die session
- **Celestia Soul:** neon heaven aesthetic, 414 polished commands, VPS hardening, Baileys 7 elegance
- **Tribute:** Every `.ping`, `.alive`, `.menu` whispers the wolf. Try `.wolftech` to hear the full howl.

> *The Wolf hunts. The Star guides. Together, unstoppable.* — `utils/wolfTech.js`

---

### 🖼️ Logo

`assets/logo.png` - 1024×1024 official CELESTIA face (celestial goddess emblem, blue/cyan/violet/silver on black). `assets/banner.png` (1200×675 wide) and `assets/script.jpg` (menu banner) are rendered from the same art. Source: `celestia-logo.png`. Canonical prompt: `assets/LOGO-PROMPT.md`. Use for profile pic, banner, README.

---

### 📦 Structure

```
CELESTIA/
├── assets/logo.png         # official face (1024×1024, from celestia-logo.png)
├── index.js                # CELESTIA main (Baileys, health server)
├── commands/               # 198 files → 414 aliases
│   ├── spam.js             # .spam 10 hello (hardened)
│   ├── kill.js / kill2.js  # hardened group tools
│   ├── menu.js             # CELESTIA menu
│   └── ... auto-fetched & heavenly
├── config/config.js        # BOT_NAME=CELESTIA
├── Dockerfile / docker-compose.yml  # VPS (node:20)
└── auth_info_baileys/      # session persist
```

---

### 🚀 Quick Start

```bash
npm install
cp .env.example .env  # set OWNER_NUMBER, optional OPENAI_API_KEY/GEMINI_API_KEY
node index.js
# Scan QR in terminal → .menu on WhatsApp
```

**VPS Docker (recommended):**
```bash
docker compose up -d --build
docker logs -f celestia
# Health: http://YOUR_IP:3000/health  QR: http://YOUR_IP:3000/qr
```

---

### Business Assistant

Each deployment can become a salon or barbershop booking assistant without AI costs. Set these environment variables before deploying:

```env
BUSINESS_ASSISTANT_ENABLED=true
BUSINESS_NAME=Celestia Cuts
BUSINESS_HOURS=Monday-Saturday, 8:00 AM-7:00 PM
BUSINESS_LOCATION=Nairobi, Kenya
BUSINESS_OPEN_DAYS=1,2,3,4,5,6
BUSINESS_BOOKING_SLOTS=09:00,10:00,11:00,13:00,14:00,15:00,16:00
BUSINESS_SERVICES_JSON=[{"name":"Haircut","price":500,"durationMinutes":45},{"name":"Beard trim","price":300,"durationMinutes":30}]
```

Customers message the linked WhatsApp number and use a numbered menu to view prices, book an available slot, see hours and location, or request a human. Confirmed appointments are stored in `data/business-bookings.json` and survive Celestia redeployments. The owner receives new-booking notifications and can manage them privately with `.appointments` and `.appointments cancel <reference>`.

Business mode is disabled by default, so existing CELESTIA deployments keep their current behavior.

---

### ✨ Commands

| Category | Example |
|----------|---------|
| **Spam** | `.spam 10 hello` |
| **AI** | `.ai hi` `.gpt` `.gemini` |
| **Media** | `.tiktok` `.ig` `.igdp <profile-url>` `.yt` `.sticker` |
| **Group** | `.antilink` `welcome` `promote` `kill` `kill2` |
| **Utility** | `.ping` `.menu` `.alive` |

#### Instagram profile pictures

Use `.igdp https://www.instagram.com/username/` (or `.igdp @username`). The command
tries Instagram's profile API, public profile embed, and page metadata, and sends
the best available profile image. Some anonymous sources expose only a small photo.

Instagram can rate-limit server IPs or return a login page even when a profile has
a photo. If anonymous requests fail, set `INSTAGRAM_COOKIE` in the deployment's
runtime secrets to the Cookie header from your own logged-in Instagram session
(including `sessionid` and, when available, `csrftoken`), then redeploy. This is an
Instagram credential, separate from the WhatsApp `SESSION_ID`; keep it out of chat
and Git. Expired sessions or Instagram challenges may still require refreshing it.

#### Instagram stories

`.igstory @username`, `.igstory https://www.instagram.com/username/` and individual
`https://www.instagram.com/stories/username/story-id/` links are supported. Stories
use the saved `INSTAGRAM_COOKIE` first; Instagram only returns media visible to that
session. A public provider is a fallback and does not receive the cookie. Provider
errors are reported separately from successful responses containing no visible stories.

Instagram post/reel commands (`.ig`, `.igdl`, `.insta`, `.igreel`, `.instagram`, and
Instagram links passed to `.socialdl`) also try `INSTAGRAM_COOKIE` first. Mixed
image/video albums are sent sequentially. The local yt-dlp fallback gets a temporary
Instagram-only cookie jar that is deleted after the request. Instagram cookies are
never sent to public downloader providers or media CDN requests. Each bot uses the
Instagram session saved for that bot.

The private control panel includes an **Instagram cookies** card. Select the bot,
upload a Netscape export from instagram.com (maximum 64 KB), or paste a replacement
Cookie header. **Save Instagram session** saves privately and tests the login;
**Test Instagram access** checks the existing session without displaying it.
The check verifies Instagram's authenticated viewer, rather than assuming that
public profile access proves a valid login. Last-test results are tied to the
saved session and include the test time.

Panel updates are stored at `data/instagram-cookie.txt` and take effect on the
next request, without a restart. This per-bot file takes precedence over
`INSTAGRAM_COOKIE_FILE` and the legacy `INSTAGRAM_COOKIE` environment value.

#### YouTube cookie refresh

In a private chat with the bot, the owner can send a Netscape `cookies.txt` export,
then reply to that document with `.ytcookies upload`. `.ytcookies status` shows
expiry/readiness without exposing credentials. Replacement files take effect on the
next download, with no restart, and live under persistent `data/youtube-cookies.txt`
(override with `YOUTUBE_COOKIES_FILE`).

For automatic replacement, configure `YOUTUBE_COOKIES_URL` as a private HTTPS endpoint
serving a fresh export. The bot checks it when downloading, at most once per
`YOUTUBE_COOKIES_REFRESH_SECONDS` (default 1800), or sooner for expired/rejected jars
with a one-minute minimum cooldown. `.ytcookies refresh` requests a check manually.
Invalid replacements leave the existing file untouched. A rejected session is retried
only once, and only with different cookies. Cookie updates received by yt-dlp are
saved if they remain valid and have not been superseded by a newer owner upload.

This does **not** sign into Google or create a new session after expiry/revocation.
The browser or trusted source must supply genuinely fresh cookies. Cookies also do
not guarantee YouTube will accept a hosting-server IP. Keep cookie files and source
URLs private; never commit them.

For private multi-bot hosting, the cloud can mount an owner-scoped shared cookie
directory with `YOUTUBE_COOKIES_SHARED=true`. Configure CELESTIA as the writer
(`YOUTUBE_COOKIES_READ_ONLY=false`) and the other bots as readers
(`YOUTUBE_COOKIES_READ_ONLY=true`). Uploading once to CELESTIA then updates all
linked bots on their next download. Readers use isolated per-download copies and
cannot replace the shared file. The shared jar remains outside bot images and
survives container recreation.

Current YouTube JavaScript challenges require Node 22 or newer. Older bot images
can use a separate runtime via `YTDLP_NODE_PATH`; private shared fleets also detect
a `node22` executable beside the shared cookie jar. This does not change the bot's
own Node runtime or its native modules.

`.menu` shows full heavenly list.

---

### 🔒 Hardened `kill` / `kill2`

* `kill.js:19` strict `OWNER_NUMBER` only, pending 60s, cooldown 60m, batch 15, audit `logs/`
* `kill2.js:28` fixed `_ -` invite bug, `invite/` path, query strip, pending by `inviteCode`

---

### 🎨 Branding

Update `BOT_NAME=CELESTIA` in `.env`, logo in `assets/logo.svg`. PM2: `pm2 start index.js --name celestia`.

---

### 🐺💫 Lineage

| Era | Entity | Essence |
|-----|--------|---------|
| 🌑 | **WolfTech** | The Hunt — feral, raw, unbreakable |
| 🌸 | **CELESTIA** | The Heaven — elegant, hardened, celestial |

> **Credit:** Inspired by **WolfTech 🐺** — the pack that showed us how to run. CELESTIA is the star that showed us where to run *to*.

---

<p align="center">
  <b>CELESTIA ✨ The Most Beautiful Bot</b><br>
  <i>Howl of the Wolf → Light of the Stars</i><br>
  <sub>🐺 Inspired by <b>WolfTech</b> • ✨ Forged as <b>CELESTIA</b> • Made heavenly</sub>
</p>
