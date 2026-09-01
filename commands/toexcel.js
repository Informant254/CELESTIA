const fs = require('fs');
const os = require('os');
const path = require('path');
const XLSX = require('xlsx');

module.exports = {
  name: 'toexcel',
  aliases: ['excel', 'makeexcel', 'toxlsx', 'text2excel'],
  description: 'Convert comma-separated text to an Excel spreadsheet. Usage: .toexcel Name,Age,City\\nJohn,25,NY',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || '';
    const inputText = args.join(' ').trim() || quotedText;

    if (!inputText?.trim()) {
      return sock.sendMessage(jid, {
        text: '📊 *Usage:*\n*.toexcel Name,Age,City\\nJohn,25,NY\\nJane,30,LA*\n\n_Columns = commas, Rows = new lines_\n_Or reply to a text message with CSV data_'
      }, { quoted: msg });
    }

    const xlsxPath = path.join(os.tmpdir(), `excel_${Date.now()}.xlsx`);
    try {
      await sock.sendMessage(jid, { text: '⏳ Creating Excel file...' }, { quoted: msg });

      const lines = inputText.trim().split(/\n|\\n/).filter(l => l.trim());
      const data = lines.map(line =>
        line.split(',').map(cell => {
          const t = cell.trim();
          const n = Number(t);
          return (!isNaN(n) && t !== '') ? n : t;
        })
      );

      const ws = XLSX.utils.aoa_to_sheet(data);
      const wb = XLSX.utils.book_new();

      const colWidths = data.reduce((acc, row) => {
        row.forEach((cell, i) => { acc[i] = Math.max(acc[i] || 10, String(cell).length + 4); });
        return acc;
      }, []);
      ws['!cols'] = colWidths.map(w => ({ wch: w }));

      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      XLSX.writeFile(wb, xlsxPath);

      await sock.sendMessage(jid, {
        document: fs.readFileSync(xlsxPath),
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileName: `spreadsheet_${Date.now()}.xlsx`,
        caption: `✅ *Excel created!*\n📊 ${data.length} rows × ${data[0]?.length || 0} columns`,
      }, { quoted: msg });

    } catch (err) {
      console.error('[TOEXCEL ERROR]', err.message);
      await sock.sendMessage(jid, { text: '❌ Failed to create Excel. Make sure data is comma-separated.' }, { quoted: msg });
    } finally {
      if (fs.existsSync(xlsxPath)) { try { fs.unlinkSync(xlsxPath); } catch (_) {} }
    }
  },
};

