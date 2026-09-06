# CELESTIA - DEPLOY GUIDE ✨🐺

> 🐺 *Inspired by WolfTech* — Forged in the Wolf's Den, Crowned in Celestial Heaven
> Howl of the Wolf → Light of the Stars — `utils/wolfTech.js` | `GET /wolftech`

## Option A: Direct VPS (Ubuntu) - Docker (Recommended)

### 1. Push CELESTIA to GitHub
```bash
cd "whatsapp bot"
git init
git add .
git commit -m "CELESTIA heavenly"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/CELESTIA.git
git push -u origin main
```

### 2. On VPS (Ubuntu 22.04/24.04)
```bash
ssh root@YOUR_VPS_IP
apt update && apt install -y git docker.io docker-compose nodejs npm
git clone https://github.com/YOUR_USERNAME/CELESTIA.git
cd CELESTIA

cp .env.example .env
nano .env # set OWNER_NUMBER=254... BOT_NAME=CELESTIA

docker compose up -d --build
docker logs -f celestia
# Scan QR from logs, then .menu on WhatsApp
# Health: curl http://localhost:3000/health
```

## Option B: Direct VPS - PM2 (No Docker)
```bash
ssh root@YOUR_VPS_IP
apt update && apt install -y git nodejs npm
git clone https://github.com/YOUR_USERNAME/CELESTIA.git
cd CELESTIA
cp .env.example .env && nano .env

npm install --production --ignore-scripts
npm install -g pm2
pm2 start index.js --name celestia
pm2 save
pm2 startup
pm2 logs celestia
```

## Option C: Deploy VIA nodeX Platform (host.xwolf.space)
1. Go https://host.xwolf.space → Login (Google/GitHub)
2. Submit Bot → Fill:
   - Name: CELESTIA
   - Repo: https://github.com/YOUR_USERNAME/CELESTIA
   - Description: The Most Beautiful WhatsApp Bot
   - Env: OWNER_NUMBER, SESSION_ID (CELESTIA:~...)
3. If Developer Program asks fee → Pay coins → Submit
4. Admin approves → 1-click Deploy → nodeX handles PM2/Pterodactyl

## Env Required
```
BOT_NAME=CELESTIA
OWNER_NUMBER=254754574642
SESSION_ID=CELESTIA:~... (after first QR scan, bot DMs you backup)
PORT=3000
OPENAI_API_KEY=... (optional for .ai)
```

## Verify
```bash
curl http://YOUR_VPS_IP:3000/health
# {"ok":true,"bot":"CELESTIA"}
# WhatsApp: .menu .ping .spam 5 hello
```

## Logs
```bash
docker logs -f celestia
# or pm2 logs celestia
# 414 heavenly aliases loaded
```
