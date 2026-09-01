"""
Hostable WhatsApp Bot for VPS (Personal Number - Option B)
- Headless Chrome via Selenium (no pyautogui / no desktop needed)
- Session persists in ./session (survives restarts, no QR every time)
- Flask API for health checks + remote control
- Works on Ubuntu/Debian VPS
"""
import os
import time
import logging
import threading
import urllib.parse
from pathlib import Path

from flask import Flask, request, jsonify, send_file
from dotenv import load_dotenv

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager

load_dotenv()

# ---- Config ----
PORT = int(os.getenv("PORT", "3000"))
SESSION_DIR = os.path.abspath(os.getenv("SESSION_DIR", "./session"))
QR_PATH = os.path.abspath(os.getenv("QR_PATH", "./qr.png"))
WHATSAPP_URL = "https://web.whatsapp.com"

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("wabot")

app = Flask(__name__)

driver = None
driver_ready = False
last_qr = None

# ---- Selenium Setup (VPS-friendly) ----
def create_driver():
    global driver, driver_ready
    Path(SESSION_DIR).mkdir(parents=True, exist_ok=True)

    opts = Options()
    # VPS headless flags
    opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--window-size=1920,1080")
    opts.add_argument("--disable-extensions")
    opts.add_argument("--remote-debugging-port=9222")
    opts.add_argument(f"--user-data-dir={SESSION_DIR}")
    opts.add_argument("--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    # keep alive
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option('useAutomationExtension', False)

    log.info(f"Starting Chrome headless | session: {SESSION_DIR}")
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=opts)
    driver.get(WHATSAPP_URL)
    log.info(f"Opened {WHATSAPP_URL} | waiting for login...")
    wait_for_login()
    driver_ready = True

def wait_for_login(timeout=90):
    """Wait until QR is scanned or chats load. Saves QR screenshot to QR_PATH for /qr endpoint."""
    global last_qr
    try:
        # Wait for either QR canvas or chat list
        WebDriverWait(driver, timeout).until(
            lambda d: len(d.find_elements(By.CSS_SELECTOR, "canvas[aria-label='Scan me!']")) > 0
            or len(d.find_elements(By.CSS_SELECTOR, "div#pane-side")) > 0
            or len(d.find_elements(By.XPATH, "//div[@contenteditable='true'][@data-tab='3']")) > 0
        )
        time.sleep(3)
        # Try to capture QR if present
        qr_elements = driver.find_elements(By.CSS_SELECTOR, "canvas[aria-label='Scan me!']")
        if qr_elements:
            log.info("QR code found - saving to qr.png | scan via /qr endpoint")
            driver.save_screenshot(QR_PATH)
            last_qr = QR_PATH
            # wait until logged in (pane-side appears)
            log.info("Waiting for QR scan...")
            WebDriverWait(driver, 90).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "div#pane-side"))
            )
            log.info("Login successful! Session saved.")
        else:
            log.info("Already logged in - session restored.")

        # final check: chat list loaded
        WebDriverWait(driver, 30).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "div#pane-side"))
        )
        time.sleep(2)
    except Exception as e:
        log.warning(f"Login wait timeout / error: {e}")
        # save screenshot for debugging
        try:
            driver.save_screenshot(QR_PATH)
            last_qr = QR_PATH
        except:
            pass
        raise

def send_message(phone_or_name: str, msg: str, count: int = 1, delay: float = 1.0, is_phone: bool = True):
    """
    Sends msg to phone_or_name x times.
    If is_phone=True, uses https://web.whatsapp.com/send?phone=E164&text=...
    else searches by chat name.
    """
    if not driver_ready or driver is None:
        raise RuntimeError("Driver not ready - not logged in yet. Scan QR at /qr")

    for n in range(count):
        try:
            if is_phone:
                # phone must be digits with country code, no + or spaces: e.g. 919876543210
                clean_phone = "".join(filter(str.isdigit, phone_or_name))
                url = f"{WHATSAPP_URL}/send?phone={clean_phone}&text={urllib.parse.quote(msg)}"
                driver.get(url)
                # wait for message box
                box = WebDriverWait(driver, 30).until(
                    EC.presence_of_element_located((By.XPATH, "//div[@contenteditable='true'][@data-tab='10']"))
                )
                time.sleep(1.5)
                box.send_keys(Keys.ENTER)
                log.info(f"Sent {n+1}/{count} to {clean_phone}")
            else:
                # search by name
                search_box = WebDriverWait(driver, 20).until(
                    EC.presence_of_element_located((By.XPATH, "//div[@contenteditable='true'][@data-tab='3']"))
                )
                search_box.clear()
                search_box.send_keys(phone_or_name)
                time.sleep(1)
                search_box.send_keys(Keys.ENTER)
                time.sleep(1)
                msg_box = WebDriverWait(driver, 20).until(
                    EC.presence_of_element_located((By.XPATH, "//div[@contenteditable='true'][@data-tab='10']"))
                )
                msg_box.send_keys(msg)
                msg_box.send_keys(Keys.ENTER)
                log.info(f"Sent {n+1}/{count} to {phone_or_name}")

            if n < count - 1:
                time.sleep(delay)
        except Exception as e:
            log.error(f"Failed to send {n+1}/{count}: {e}")
            # try to screenshot for debug
            try:
                driver.save_screenshot(f"error_{int(time.time())}.png")
            except:
                pass
            raise

# ---- Flask Routes (VPS health + control) ----
@app.route("/")
def index():
    return jsonify({
        "status": "running" if driver_ready else "starting",
        "ready": driver_ready,
        "session_dir": SESSION_DIR,
        "endpoints": {
            "GET /health": "health check for VPS / UptimeRobot",
            "GET /qr": "view QR png to login",
            "POST /send": "{phone, message, count?, delay?}",
            "POST /spam": "compat with old spam.py - {message, count, phone}",
            "GET /status": "login status"
        }
    })

@app.route("/health")
def health():
    return jsonify({"ok": True, "ready": driver_ready, "uptime": time.time()}), 200

@app.route("/status")
def status():
    try:
        logged_in = len(driver.find_elements(By.CSS_SELECTOR, "div#pane-side")) > 0 if driver else False
    except:
        logged_in = False
    return jsonify({"ready": driver_ready, "logged_in": logged_in})

@app.route("/qr")
def get_qr():
    if os.path.exists(QR_PATH):
        return send_file(QR_PATH, mimetype="image/png")
    return jsonify({"error": "QR not available yet. Wait 10s and refresh. If logged in, session is active."}), 404

@app.route("/send", methods=["POST"])
def api_send():
    data = request.get_json(force=True, silent=True) or {}
    # support form as well
    if not data:
        data = request.form.to_dict()

    phone = data.get("phone") or data.get("to") or data.get("name")
    message = data.get("message") or data.get("msg") or data.get("text")
    count = int(data.get("count", 1))
    delay = float(data.get("delay", 1.0))

    if not phone or not message:
        return jsonify({"error": "Need 'phone' and 'message'. Example: {\"phone\":\"919876543210\", \"message\":\"hi\", \"count\":5}"}), 400
    if count > 100:
        return jsonify({"error": "count max 100 to avoid ban"}), 400

    try:
        is_phone = any(c.isdigit() for c in phone) and len("".join(filter(str.isdigit, phone))) >= 10
        send_message(phone, message, count=count, delay=delay, is_phone=is_phone)
        return jsonify({"ok": True, "sent": count, "to": phone})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

# compat: old spam.py behavior -> POST /spam
@app.route("/spam", methods=["POST"])
def api_spam():
    return api_send()

# ---- Runner ----
def run_flask():
    # threaded so selenium can run
    app.run(host="0.0.0.0", port=PORT, threaded=True, use_reloader=False)

if __name__ == "__main__":
    # start flask in background
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()
    log.info(f"Flask API listening on 0.0.0.0:{PORT} | /health /qr /send")

    # start driver (blocks until login)
    try:
        create_driver()
    except Exception as e:
        log.error(f"Driver failed to start: {e}")
        log.info(f"Still serving Flask on :{PORT} - check /qr and logs")

    log.info("Bot ready. Use POST http://YOUR_VPS_IP:%s/send to send messages." % PORT)
    log.info("Session persists in ./session - no need to scan QR again after first login.")

    # keep alive loop for VPS
    try:
        while True:
            time.sleep(10)
            # auto-heal: if driver crashed, log it
            try:
                _ = driver.current_url
            except Exception as e:
                log.warning(f"Driver disconnected: {e} - restart required (systemd/docker will restart)")
                time.sleep(5)
    except KeyboardInterrupt:
        log.info("Shutting down...")
        try:
            driver.quit()
        except:
            pass
