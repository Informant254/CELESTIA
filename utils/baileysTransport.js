const MEDIA_KEYS = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage'];

function withGroupStatusMediaHint(message, inside) {
  const key = MEDIA_KEYS.find((candidate) => inside?.[candidate]);
  return key ? { ...message, [key]: inside[key] } : message;
}

function patchMessageBeforeSending(message) {
  const groupStatus = message?.groupStatusMessageV2 || message?.groupStatusMessage;
  if (!groupStatus?.message) return message;

  const patched = { ...message };
  for (const key of MEDIA_KEYS) delete patched[key];
  return patched;
}

module.exports = { withGroupStatusMediaHint, patchMessageBeforeSending };
