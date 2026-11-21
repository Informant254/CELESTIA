const fs = require('fs');
const path = require('path');

const BAN_FILE = path.join(__dirname, '..', 'data', 'banned.json');

function ensureFile() {
    const dir = path.dirname(BAN_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(BAN_FILE)) {
        fs.writeFileSync(BAN_FILE, JSON.stringify([], null, 2));
    }
}

function getBannedList() {
    ensureFile();
    try {
        const raw = fs.readFileSync(BAN_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        return [];
    }
}

function normalize(value) {
    return String(value || '').trim().toLowerCase();
}

function idDigits(value) {
    return normalize(value).split('@')[0].split(':')[0].replace(/\D/g, '');
}

// A ban is stored against whatever JID form the owner used (often a LID
// mention). The same account can present as PN or LID on later messages,
// so matching compares every form the message carries.
function listHas(list, jid) {
    const want = normalize(jid);
    const wantDigits = idDigits(jid);
    if (!want || !wantDigits) return false;
    return list.some((entry) => {
        const e = normalize(entry);
        return e === want || idDigits(entry) === wantDigits;
    });
}

function isBanned(jid) {
    return listHas(getBannedList(), jid);
}

function isBannedMessage(msg) {
    const list = getBannedList();
    if (!list.length) return false;
    const forms = [
        msg?.key?.participant,
        msg?.key?.participantPn,
        msg?.key?.participantAlt,
        msg?.key?.remoteJidAlt,
        msg?.key?.remoteJid,
    ];
    return forms.some((form) => form && listHas(list, form));
}

function banUser(jid) {
    const list = getBannedList();
    if (!listHas(list, jid)) {
        list.push(jid);
        fs.writeFileSync(BAN_FILE, JSON.stringify(list, null, 2));
    }
    return list;
}

function unbanUser(jid) {
    let list = getBannedList();
    list = list.filter((id) => !listHas([id], jid));
    fs.writeFileSync(BAN_FILE, JSON.stringify(list, null, 2));
    return list;
}

module.exports = { getBannedList, isBanned, isBannedMessage, banUser, unbanUser };
