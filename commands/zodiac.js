module.exports = {
  name: 'zodiac',
  description: 'Get zodiac sign by birth month and day',

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;

    if (args.length !== 2 || isNaN(args[0]) || isNaN(args[1])) {
      return await sock.sendMessage(
        jid,
        { text: 'Please provide your birth month and date\n*Example:* .zodiac 8 23 (for August 23)' },
        { quoted: msg }
      );
    }

    const month = parseInt(args[0], 10);
    const day = parseInt(args[1], 10);

    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return await sock.sendMessage(
        jid,
        { text: 'Invalid date. Please check your month (1-12) and day (1-31)' },
        { quoted: msg }
      );
    }

    let zodiacSign = '';
    let traits = '';

    if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) {
      zodiacSign = 'Aries'; traits = 'Adventurous, energetic, courageous, enthusiastic, confident, dynamic, quick-witted';
    } else if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) {
      zodiacSign = 'Taurus'; traits = 'Patient, reliable, warmhearted, loving, persistent, determined, placid, security loving';
    } else if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) {
      zodiacSign = 'Gemini'; traits = 'Adaptable, versatile, communicative, witty, intellectual, eloquent, youthful, lively';
    } else if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) {
      zodiacSign = 'Cancer'; traits = 'Emotional, loving, intuitive, imaginative, shrewd, cautious, protective, sympathetic';
    } else if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) {
      zodiacSign = 'Leo'; traits = 'Generous, warmhearted, creative, enthusiastic, broad-minded, expansive, faithful, loving';
    } else if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) {
      zodiacSign = 'Virgo'; traits = 'Modest, shy, meticulous, reliable, practical, diligent, intelligent, analytical';
    } else if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) {
      zodiacSign = 'Libra'; traits = 'Diplomatic, urbane, romantic, charming, easygoing, sociable, idealistic, peaceable';
    } else if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) {
      zodiacSign = 'Scorpio'; traits = 'Determined, forceful, emotional, intuitive, powerful, passionate, exciting, magnetic';
    } else if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) {
      zodiacSign = 'Sagittarius'; traits = 'Optimistic, freedom-loving, jovial, good-humored, honest, straightforward, intellectual';
    } else if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) {
      zodiacSign = 'Capricorn'; traits = 'Practical, prudent, ambitious, disciplined, patient, careful, humorous, reserved';
    } else if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) {
      zodiacSign = 'Aquarius'; traits = 'Friendly, humanitarian, honest, loyal, original, inventive, independent, intellectual';
    } else if ((month === 2 && day >= 19) || (month === 3 && day <= 20)) {
      zodiacSign = 'Pisces'; traits = 'Imaginative, sensitive, compassionate, kind, selfless, unworldly, intuitive, sympathetic';
    } else {
      return await sock.sendMessage(
        jid,
        { text: 'Could not determine zodiac sign. Please check your birth date.' },
        { quoted: msg }
      );
    }

    const senderJid = msg.key.participant || msg.key.remoteJid;
    const pushname = msg.pushName || senderJid.split('@')[0];

    const text =
      `*Zodiac Sign*\n\n` +
      `*Birth Date:* ${month}/${day}\n` +
      `*Sign:* ${zodiacSign}\n` +
      `*Traits:* ${traits}\n\n` +
      `_Requested by ${pushname}_`;

    await sock.sendMessage(jid, { text }, { quoted: msg });
  },
};
