const {
  downloadMediaMessage,
  normalizeMessageContent,
  jidNormalizedUser,
} = require('@whiskeysockets/baileys');

const { isOwner } = require('../utils/isOwner');
const { contextInfo } = require('../utils/jidResolver');
const { prepareStatusAudio } = require('../utils/groupStatusAudio');

const STATUS_JID = 'status@broadcast';

/**
 * Safely unwrap WhatsApp message content.
 */
function unwrapMessage(message) {
  if (!message) return null;

  try {
    return normalizeMessageContent(message) || message;
  } catch {
    return message;
  }
}

/**
 * Only allow real WhatsApp user JIDs.
 *
 * Supports:
 *   2547xxxxxxx@s.whatsapp.net
 *   xxxxx@lid
 */
function normalizeContactJid(jid) {
  if (!jid || typeof jid !== 'string') {
    return null;
  }

  try {
    const normalized = jidNormalizedUser(jid);

    if (
      normalized.endsWith('@s.whatsapp.net') ||
      normalized.endsWith('@lid')
    ) {
      return normalized;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Convert different possible contact-store formats into entries.
 */
function contactEntries(source) {
  if (!source) return [];

  if (source instanceof Map) {
    return [...source.entries()];
  }

  if (Array.isArray(source)) {
    return source.map((contact, index) => [
      contact?.id || String(index),
      contact,
    ]);
  }

  if (typeof source === 'object') {
    return Object.entries(source);
  }

  return [];
}

/**
 * Find contacts known to CELESTIA.
 *
 * Supports several common Baileys bot layouts:
 *
 * sock.store.contacts
 * sock.contacts
 * sock.contactStore.contacts
 * global.store.contacts
 *
 * Plus CELESTIA's own event-synced contacts and optionally:
 *
 * CELESTIA_STATUS_JIDS=2547...@s.whatsapp.net,2547...@s.whatsapp.net
 */
function getKnownContacts(sock) {
  const sources = [
    sock?.store?.contacts,
    sock?.contacts,
    sock?.contactStore?.contacts,
    globalThis?.store?.contacts,
  ];

  const pn = new Set();
  const lid = new Set();

  function add(jid) {
    const normalized = normalizeContactJid(jid);

    if (!normalized) return;

    if (normalized.endsWith('@lid')) {
      lid.add(normalized);
    } else if (
      normalized.endsWith('@s.whatsapp.net')
    ) {
      pn.add(normalized);
    }
  }

  for (const source of sources) {
    for (const [key, contact] of contactEntries(source)) {
      /*
       * Contact stores differ between Baileys versions /
       * bot architectures, so check the useful JID fields.
       */
      add(key);
      add(contact?.id);
      add(contact?.jid);
      add(contact?.lid);
      add(contact?.phoneNumber);
      add(contact?.pn);
    }
  }

  /*
   * CELESTIA's own event-synced contacts (contacts.upsert/update).
   */
  try {
    for (const jid of require('../utils/mediaStudio').syncedStatusContacts(sock)) {
      add(jid);
    }
  } catch { /* contacts sync never breaks publishing */ }

  /*
   * Optional manual fallback.
   *
   * Example:
   *
   * CELESTIA_STATUS_JIDS=
   * 254712345678@s.whatsapp.net,
   * 254798765432@s.whatsapp.net
   */
  const configured =
    process.env.CELESTIA_STATUS_JIDS || '';

  for (const jid of configured.split(',')) {
    add(jid.trim());
  }

  /*
   * Add our own WhatsApp identities.
   *
   * This is useful for Status synchronization
   * with the linked account.
   */
  add(sock?.user?.id);
  add(sock?.user?.lid);

  /*
   * Do NOT mix PN and LID recipients.
   *
   * If the account is LID-based and we actually have LID
   * contacts, use only LIDs.
   */
  const accountUsesLid =
    Boolean(sock?.user?.lid);

  let recipients;

  if (accountUsesLid && lid.size > 1) {
    recipients = [...lid];

    console.log(
      `[CELESTIA STATUS] using LID addressing (${recipients.length} recipients)`
    );
  } else if (pn.size > 1) {
    recipients = [...pn];

    console.log(
      `[CELESTIA STATUS] using PN addressing (${recipients.length} recipients)`
    );
  } else if (lid.size > 1) {
    recipients = [...lid];

    console.log(
      `[CELESTIA STATUS] using LID fallback (${recipients.length} recipients)`
    );
  } else {
    recipients = [];
  }

  return recipients;
}

/**
 * Download media from the current message
 * or from a replied message.
 */
async function downloadSourceMedia(
  sock,
  msg,
  ctx,
  source,
  replied
) {
  const key = replied
    ? {
        remoteJid: msg.key.remoteJid,
        id: ctx?.stanzaId,
        participant:
          ctx?.participant ||
          msg.key.participant,
      }
    : msg.key;

  return downloadMediaMessage(
    {
      key,
      message: source,
    },
    'buffer',
    {},
    {
      reuploadRequest: (message) =>
        sock.updateMediaMessage(message),
    }
  );
}

/**
 * Actually send the PERSONAL WhatsApp Status.
 *
 * IMPORTANT:
 * There is ZERO sendGroupStatus() logic here.
 */
async function sendPersonalStatus(
  sock,
  content,
  statusJidList
) {
  if (
    !Array.isArray(statusJidList) ||
    statusJidList.length === 0
  ) {
    throw new Error(
      'CELESTIA has no WhatsApp contacts available for Status delivery'
    );
  }

  const options = {
    statusJidList,
    broadcast: true,
  };

  /**
   * Text status styling.
   */
  if (content.text) {
    options.backgroundColor = '#111111';
    options.font = 1;
  }

  /**
   * Audio / voice Status.
   */
  if (content.audio) {
    content = {
      ...content,
      ptt: true,
    };

    options.backgroundColor = '#000000';
  }

  const result = await sock.sendMessage(
    STATUS_JID,
    content,
    options
  );

  console.log(
    `[CELESTIA PERSONAL STATUS] published ` +
    `id=${result?.key?.id || 'unknown'} ` +
    `recipients=${statusJidList.length}`
  );

  return result;
}

module.exports = {
  name: 'status',

  aliases: [
    'pstatus',
    'mystatus',
    'personalstatus',
    'story',
  ],

  description:
    'Publish text, images, videos or audio to your personal WhatsApp Status.',

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;

    /**
     * OWNER ONLY.
     *
     * Important because otherwise someone could make
     * your WhatsApp account publish a Status. Charming.
     */
    if (!isOwner(msg)) {
      return sock.sendMessage(
        jid,
        {
          text:
            '✦ Only the CELESTIA owner can publish a personal Status.',
        },
        {
          quoted: msg,
        }
      );
    }

    const input = args.join(' ').trim();

    const ctx = contextInfo(msg);

    const quoted = unwrapMessage(
      ctx?.quotedMessage
    );

    const current = unwrapMessage(
      msg.message
    );

    const supportedMedia = [
      'imageMessage',
      'videoMessage',
      'audioMessage',
      'stickerMessage',
    ];

    const currentMediaType =
      Object.keys(current || {}).find(
        (type) =>
          supportedMedia.includes(type)
      );

    /**
     * Prefer replied content.
     *
     * If there isn't any, check whether the .status
     * command itself carries media.
     */
    const source =
      quoted ||
      (currentMediaType
        ? current
        : null);

    const replied = Boolean(quoted);

    /**
     * No content supplied.
     */
    if (!source && !input) {
      return sock.sendMessage(
        jid,
        {
          text:
            '✦ *CELESTIA PERSONAL STATUS*\n\n' +

            'Use:\n\n' +

            '`.status <text>`\n\n' +

            'Or reply to an image/video/audio with:\n' +

            '`.status [optional caption]`\n\n' +

            'You can also use `.status` as the caption of an image or video.\n\n' +

            'This command publishes ONLY to your personal WhatsApp Status.',
        },
        {
          quoted: msg,
        }
      );
    }

    try {
      /**
       * Get PERSONAL Status recipients.
       *
       * No group participant lookup here.
       */
      const statusJidList =
        getKnownContacts(sock);

      if (!statusJidList.length) {
        return sock.sendMessage(
          jid,
          {
            text:
              '✦ CELESTIA does not know any personal Status recipients yet.\n\n' +

              'Keep CELESTIA connected while your chats sync, then try again. You can also use `.setstatus <group-link-or-JID> <text>` to choose a Status audience.',
          },
          {
            quoted: msg,
          }
        );
      }

      /**
       * TEXT STATUS
       */
      const sourceText =
        source?.conversation ||
        source?.extendedTextMessage?.text;

      if (!source || sourceText) {
        const text =
          input || sourceText;

        if (!text) {
          throw new Error(
            'No Status text was found'
          );
        }

        await sendPersonalStatus(
          sock,
          {
            text,
          },
          statusJidList
        );

        return sock.sendMessage(
          jid,
          {
            text:
              `✓ Personal Status published to ${statusJidList.length} recipient(s).`,
          },
          {
            quoted: msg,
          }
        );
      }

      /**
       * Find media type.
       */
      const sourceType =
        Object.keys(source).find(
          (type) =>
            supportedMedia.includes(type)
        );

      if (!sourceType) {
        return sock.sendMessage(
          jid,
          {
            text:
              '✦ Personal Status supports text, images, videos and audio.',
          },
          {
            quoted: msg,
          }
        );
      }

      /**
       * WhatsApp personal Status does not reliably accept
       * a raw standalone sticker Status.
       */
      if (
        sourceType ===
        'stickerMessage'
      ) {
        return sock.sendMessage(
          jid,
          {
            text:
              '✦ Raw sticker Status is not supported. Send the sticker as an image/video instead.',
          },
          {
            quoted: msg,
          }
        );
      }

      /**
       * Download media.
       */
      const buffer =
        await module.exports.downloadSourceMedia(
          sock,
          msg,
          ctx,
          source,
          replied
        );

      if (!buffer?.length) {
        throw new Error(
          'WhatsApp returned an empty media file'
        );
      }

      const sourceMedia =
        source[sourceType];

      let content;

      /**
       * IMAGE STATUS
       */
      if (
        sourceType ===
        'imageMessage'
      ) {
        content = {
          image: buffer,

          caption:
            input ||
            sourceMedia?.caption ||
            '',

          mimetype:
            sourceMedia?.mimetype ||
            'image/jpeg',

          jpegThumbnail:
            sourceMedia?.jpegThumbnail,

          width:
            sourceMedia?.width,

          height:
            sourceMedia?.height,
        };
      }

      /**
       * VIDEO / GIF STATUS
       */
      else if (
        sourceType ===
        'videoMessage'
      ) {
        content = {
          video: buffer,

          caption:
            input ||
            sourceMedia?.caption ||
            '',

          mimetype:
            sourceMedia?.mimetype ||
            'video/mp4',

          gifPlayback:
            Boolean(
              sourceMedia?.gifPlayback
            ),

          jpegThumbnail:
            sourceMedia?.jpegThumbnail,

          width:
            sourceMedia?.width,

          height:
            sourceMedia?.height,

          seconds:
            sourceMedia?.seconds,
        };
      }

      /**
       * AUDIO STATUS
       *
       * Reuse your existing CELESTIA audio preparation
       * helper.
       */
      else if (
        sourceType ===
        'audioMessage'
      ) {
        content =
          await module.exports.prepareStatusAudio(
            buffer
          );

        if (content?.audio) {
          content.ptt = true;
        }
      }

      if (!content) {
        throw new Error(
          'Could not prepare personal Status content'
        );
      }

      /**
       * PERSONAL STATUS ONLY.
       */
      await sendPersonalStatus(
        sock,
        content,
        statusJidList
      );

      return sock.sendMessage(
        jid,
        {
          text:
            `✓ Personal Status published to ${statusJidList.length} recipient(s).`,
        },
        {
          quoted: msg,
        }
      );
    } catch (error) {
      console.error(
        '[PERSONAL STATUS ERROR]',
        error
      );

      return sock.sendMessage(
        jid,
        {
          text:
            `✦ CELESTIA could not publish your personal Status:\n\n${error?.message || 'Unknown error'}`,
        },
        {
          quoted: msg,
        }
      );
    }
  },

  sendPersonalStatus,
  getKnownContacts,
  downloadSourceMedia,
  prepareStatusAudio,
};
