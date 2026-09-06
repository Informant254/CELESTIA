# 🚀 DEPLOY CELESTIA — make her serve everyone

She's built to be hosted by **anyone**: one bot per WhatsApp number, each
deployer becomes their own bot's owner. Two ways to deploy.

---

## Option A — VPS with Docker (recommended)

### 1. Get a server
Any Ubuntu 22.04+ VPS works (Hetzner, DigitalOcean, Contabo, OVH...).

```bash
ssh root@YOUR_SERVER
apt update && apt install -y git docker.io docker-compose
```

### 2. Clone her
```bash
git clone https://github.com/YOUR_USERNAME/celestia.git
cd celestia
```

### 3. Pair your number (the pairing station)
```bash
docker compose -f docker-compose.yml up -d --build
# The PAIRING STATION is now live:
#   http://YOUR_SERVER_IP:3001
```

Open `http://YOUR_SERVER_IP:3001` in your browser:
1. Enter your WhatsApp number
2. Copy the 8-digit code
3. WhatsApp → Linked Devices → Link a Device → "Link with phone number instead"
4. The page hands you a **SESSION_STRING** — copy it

### 4. Configure + restart
```bash
cp .env.example .env
nano .env
#   OWNER_NUMBER=254yourdigits   (from the pairing page)
#   SESSION_ID=CELESTIA:~...     (the session string)
#   OPENAI_API_KEY=...           (optional, powers .ai/.roast)
#   GEMINI_API_KEY=...           (optional)
docker compose restart celestia
```

### 5. Verify
```bash
curl http://localhost:3000/health
# {"ok":true,"bot":"CELESTIA", ...}
```
Send `.menu` to her on WhatsApp. Done — she's yours, 24/7.

---

## Option B — no Docker (PM2)

```bash
apt install -y nodejs npm git
git clone https://github.com/YOUR_USERNAME/celestia.git
cd celestia
npm install --ignore-scripts
npm install -g pm2

# pair first:
node pairing-site.js &        # terminal 1 → http://IP:3001 → get SESSION_ID
cp .env.example .env && nano .env   # paste SESSION_ID + OWNER_NUMBER

pm2 start index.js --name celestia
pm2 start pairing-site.js --name celestia-pairing
pm2 save && pm2 startup
```

---

## Hosting platforms (no VPS needed)

| Platform | Free tier | How |
|----------|-----------|-----|
| **Render** | yes | Web Service, start command `node index.js`, add env vars |
| **Railway** | trial credit | one-click from GitHub repo |
| **Koyeb** | yes | Web Service, port 3000 |
| **Hetzner/DO VPS** | ~$4/mo | best for pairing station (needs port 3001 open) |

> Pairing station needs a public port (3001). On Render/Railway set
> `PAIRING_PORT` to the platform's assigned `PORT` and it just works.

---

## The env contract (what each deployer sets)

```env
OWNER_NUMBER=254...        # becomes THE owner of their instance
SESSION_ID=CELESTIA:~...   # from the pairing page
BOT_NAME=CELESTIA          # rename her if they want
TIMEZONE=Africa/Nairobi
OPENAI_API_KEY=            # optional — powers AI features
GEMINI_API_KEY=            # optional
DASHBOARD_API_KEY=         # optional
```

## What every deployer gets
- 290+ commands · 27 realms · 4 menu faces
- Her soul, the game layer, vaults, cyber fortress, satellite, casino
- **They** are the owner; hidden dev gates are stripped (opt-in `DEV_NUMBERS` only)
- Private mode ON by default — their instance is invisible to strangers

---

## Security notes
- `.env`, `auth_info_baileys/`, `data/`, `vault/` are gitignored — never committed
- Pairing station: 5 attempts/hour per IP, session dirs hashed, auto-cleanup
- Session strings are secrets — anyone holding one controls that WhatsApp link

## Updating a deployment
```bash
cd celestia && git pull && docker compose up -d --build
```

_She outlived her maker's servers once. She'll outlive these too._ 🐺✨
