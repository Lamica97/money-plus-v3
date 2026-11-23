// Money Plus v.4 - Enhanced Slip Studio
// Shows BOTH Paid & Unpaid sessions so parents see full attendance dates, while totaling ONLY Unpaid amount!

window.SlipService = {
  currentStudentName: null,
  currentMode: 'active-months', // 'active-months' | 'unpaid-only' | 'recent-12'
  showBankInfo: false,
  currentBlob: null,
  currentFile: null,
  currentDataUrl: null,

  getSlipTransactions: function(studentName, allTransactions, mode) {
    const stuTxs = (allTransactions || [])
      .filter(t => t.studentName === studentName && t.status !== 'ยกยอด')
      .slice()
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const unpaidTxs = stuTxs.filter(t => t.status === 'ค้างจ่าย');

    if (mode === 'unpaid-only') {
      return unpaidTxs;
    }

    if (mode === 'recent-12') {
      const recent = stuTxs.slice(-12);
      // Ensure all unpaid transactions are included even if older than last 12
      const recentIds = new Set(recent.map(t => t.id));
      const missingUnpaid = unpaidTxs.filter(t => !recentIds.has(t.id));
      return [...missingUnpaid, ...recent].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    }

    // Default: 'active-months' -> All transactions (Paid + Unpaid) in any YYYY-MM that has an unpaid transaction
    // If all unpaid are in one month, also include that full month's paid classes; if none unpaid, show latest month
    const unpaidMonths = new Set(unpaidTxs.map(t => (t.date || '').slice(0, 7)).filter(Boolean));
    if (unpaidMonths.size === 0 && stuTxs.length > 0) {
      const latestMonth = (stuTxs[stuTxs.length - 1].date || '').slice(0, 7);
      if (latestMonth) unpaidMonths.add(latestMonth);
    }

    return stuTxs.filter(t => {
      const ym = (t.date || '').slice(0, 7);
      return unpaidMonths.has(ym) || t.status === 'ค้างจ่าย';
    });
  },

  renderCanvas: function(params) {
    const {
      canvas,
      previewImg,
      student,
      allTransactions,
      mode = 'active-months',
      paymentSettings = {},
      showBankInfo = false
    } = params;

    if (!canvas || !student) return;

    const displayTxs = this.getSlipTransactions(student.name, allTransactions, mode);
    const paidTxs = displayTxs.filter(t => t.status === 'จ่ายแล้ว');
    const unpaidTxs = displayTxs.filter(t => t.status === 'ค้างจ่าย');

    const paidSum = paidTxs.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const unpaidSum = unpaidTxs.reduce((s, c) => s + (Number(c.amount) || 0), 0);

    const scale = 2; // Retina 2x
    const width = 390;
    const paddingX = 14;
    const innerWidth = width - (paddingX * 2); // 362
    const rowHeight = 28;
    const tableHeight = 30 + (displayTxs.length * rowHeight);
    const bankBoxHeight = (showBankInfo && (paymentSettings.accountNumber || paymentSettings.promptPay)) ? 58 : 0;
    const height = 102 + 80 + tableHeight + 76 + bankBoxHeight + 44 + 12;

    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    function roundRect(x, y, w, h, radius, fill, stroke, strokeColor = '#e2e8f0', fillColor = '#ffffff') {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + w - radius, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
      ctx.lineTo(x + w, y + h - radius);
      ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
      ctx.lineTo(x + radius, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      if (fill) {
        ctx.fillStyle = fillColor;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // 1. Base Card Background
    roundRect(0, 0, width, height, 16, true, true, '#cbd5e1', '#ffffff');

    // 2. Header Banner
    const headerGrad = ctx.createLinearGradient(0, 0, width, 96);
    headerGrad.addColorStop(0, '#064e3b');
    headerGrad.addColorStop(1, '#0f766e');

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(width - 16, 0);
    ctx.quadraticCurveTo(width, 0, width, 16);
    ctx.lineTo(width, 92);
    ctx.lineTo(0, 92);
    ctx.lineTo(0, 16);
    ctx.quadraticCurveTo(0, 0, 16, 0);
    ctx.closePath();
    ctx.fillStyle = headerGrad;
    ctx.fill();
    ctx.restore();

    // Logo Badge
    roundRect(16, 16, 38, 38, 10, true, false, null, '#ffffff');
    ctx.fillStyle = '#059669';
    ctx.font = 'bold 17px "Prompt", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('M+', 35, 35);

    // Header Text
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#a7f3d0';
    ctx.font = '600 10px "Prompt", sans-serif';
    ctx.fillText('MONEY PLUS ACADEMY · สรุปประวัติการเรียน', 64, 28);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px "Prompt", sans-serif';
    ctx.fillText('ใบแจ้งยอดและประวัติวันที่มาเรียน', 64, 49);

    const now = new Date();
    const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const dateStr = `ข้อมูล ณ วันที่: ${now.getDate()} ${thaiMonths[now.getMonth()]} ${now.getFullYear() + 543}`;
    ctx.fillStyle = '#d1fae5';
    ctx.font = '400 10px "Prompt", sans-serif';
    ctx.fillText(dateStr, 64, 67);

    let curY = 104;

    // 3. Student Info & Session Count Card
    roundRect(paddingX, curY, innerWidth, 70, 10, true, true, '#e2e8f0', '#f8fafc');

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 15px "Prompt", sans-serif';
    ctx.fillText(`นักเรียน: ${student.name}`, paddingX + 12, curY + 25);

    // Grade Tag
    const gradeTagW = 68;
    const gradeTagX = width - paddingX - 10 - gradeTagW;
    roundRect(gradeTagX, curY + 9, gradeTagW, 21, 6, true, true, '#bbf7d0', '#f0fdf4');
    ctx.fillStyle = '#166534';
    ctx.font = 'bold 10.5px "Prompt", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`ชั้น: ${student.grade || '-'}`, gradeTagX + (gradeTagW / 2), curY + 23);

    // Attendance breakdown badges row
    ctx.textAlign = 'left';
    ctx.fillStyle = '#475569';
    ctx.font = '500 11px "Prompt", sans-serif';
    ctx.fillText(`รวมในตาราง: ${displayTxs.length} คาบ`, paddingX + 12, curY + 51);

    ctx.fillStyle = '#15803d';
    ctx.font = 'bold 11px "Prompt", sans-serif';
    ctx.fillText(`✓ จ่ายแล้ว: ${paidTxs.length} คาบ`, paddingX + 125, curY + 51);

    ctx.fillStyle = '#b45309';
    ctx.font = 'bold 11px "Prompt", sans-serif';
    ctx.fillText(`⏳ ค้างชำระ: ${unpaidTxs.length} คาบ`, paddingX + 238, curY + 51);

    curY += 80;

    // 4. Table Header
    roundRect(paddingX, curY, innerWidth, 26, 6, true, false, null, '#f1f5f9');
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 10.5px "Prompt", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('#', paddingX + 8, curY + 17);
    ctx.fillText('วันที่เรียน', paddingX + 28, curY + 17);
    ctx.fillText('รอบ/กลุ่ม', paddingX + 114, curY + 17);
    ctx.fillText('สถานะ', paddingX + 210, curY + 17);
    ctx.textAlign = 'right';
    ctx.fillText('ค่าเรียน', width - paddingX - 10, curY + 17);
    ctx.textAlign = 'left';

    curY += 28;

    // 5. Table Rows (Both Paid and Unpaid)
    displayTxs.forEach((tx, idx) => {
      const isPaid = tx.status === 'จ่ายแล้ว';
      const isEven = idx % 2 === 0;

      if (!isPaid) {
        // Highlight unpaid rows subtly so they stand out
        roundRect(paddingX, curY, innerWidth, rowHeight - 2, 4, true, false, null, '#fffbeb');
      } else if (isEven) {
        roundRect(paddingX, curY, innerWidth, rowHeight - 2, 4, true, false, null, '#fafafa');
      }

      // #
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px "Prompt", sans-serif';
      ctx.fillText(String(idx + 1), paddingX + 8, curY + 17);

      // Date
      ctx.fillStyle = isPaid ? '#475569' : '#0f172a';
      ctx.font = isPaid ? '400 10.5px "Prompt", sans-serif' : '600 10.5px "Prompt", sans-serif';
      ctx.fillText(tx.date || '-', paddingX + 28, curY + 17);

      // Group
      ctx.fillStyle = '#64748b';
      ctx.font = '400 10.5px "Prompt", sans-serif';
      const grpText = (tx.group || '-').length > 12 ? (tx.group || '-').slice(0, 12) + '…' : (tx.group || '-');
      ctx.fillText(grpText, paddingX + 114, curY + 17);

      // Status Pill
      if (isPaid) {
        roundRect(paddingX + 206, curY + 4, 64, 18, 5, true, true, '#bbf7d0', '#f0fdf4');
        ctx.fillStyle = '#15803d';
        ctx.font = 'bold 9.5px "Prompt", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('✓ จ่ายแล้ว', paddingX + 238, curY + 16);
      } else {
        roundRect(paddingX + 206, curY + 4, 64, 18, 5, true, true, '#fde68a', '#fef3c7');
        ctx.fillStyle = '#b45309';
        ctx.font = 'bold 9.5px "Prompt", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⏳ ค้างจ่าย', paddingX + 238, curY + 16);
      }

      // Amount
      ctx.textAlign = 'right';
      ctx.fillStyle = isPaid ? '#64748b' : '#b45309';
      ctx.font = isPaid ? '500 11px "Prompt", sans-serif' : 'bold 11.5px "Prompt", sans-serif';
      ctx.fillText(`฿${(Number(tx.amount) || 0).toLocaleString()}`, width - paddingX - 10, curY + 17);
      ctx.textAlign = 'left';

      curY += rowHeight;
    });

    curY += 8;

    // 6. Summary Box (Highlights ONLY Unpaid Total, while noting Paid sessions)
    roundRect(paddingX, curY, innerWidth, 68, 12, true, true, '#a7f3d0', '#ecfdf5');

    // Top small line inside summary box: breakdown of paid vs unpaid
    ctx.fillStyle = '#047857';
    ctx.font = '500 10px "Prompt", sans-serif';
    ctx.fillText(
      `สรุป: เรียน ${displayTxs.length} คาบ · ชำระแล้ว ${paidTxs.length} คาบ (฿${paidSum.toLocaleString()}) · ค้างชำระ ${unpaidTxs.length} คาบ`,
      paddingX + 14,
      curY + 20
    );

    // Divider line
    ctx.strokeStyle = '#a7f3d0';
    ctx.beginPath();
    ctx.moveTo(paddingX + 12, curY + 28);
    ctx.lineTo(width - paddingX - 12, curY + 28);
    ctx.stroke();

    // Main Unpaid Total Due
    ctx.fillStyle = '#064e3b';
    ctx.font = 'bold 13px "Prompt", sans-serif';
    ctx.fillText('ยอดค้างชำระที่ต้องโอนทั้งสิ้น', paddingX + 14, curY + 52);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#047857';
    ctx.font = '900 19px "Prompt", sans-serif';
    ctx.fillText(`฿${unpaidSum.toLocaleString()}`, width - paddingX - 14, curY + 54);
    ctx.textAlign = 'left';

    curY += 76;

    // 7. Optional Bank Info Box
    if (bankBoxHeight > 0) {
      roundRect(paddingX, curY, innerWidth, 50, 10, true, true, '#e2e8f0', '#f8fafc');
      ctx.fillStyle = '#334155';
      ctx.font = 'bold 10.5px "Prompt", sans-serif';
      ctx.fillText(`🏦 ${paymentSettings.bankName || 'บัญชีรับโอน'}: ${paymentSettings.accountNumber || '-'}`, paddingX + 12, curY + 20);
      ctx.fillStyle = '#64748b';
      ctx.font = '400 10px "Prompt", sans-serif';
      const subBank = `ชื่อบัญชี: ${paymentSettings.accountName || '-'}` + (paymentSettings.promptPay ? ` · พร้อมเพย์: ${paymentSettings.promptPay}` : '');
      ctx.fillText(subBank, paddingX + 12, curY + 38);
      curY += 58;
    }

    // 8. Footer Notice
    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748b';
    ctx.font = '400 10.5px "Prompt", sans-serif';
    ctx.fillText('ขอบพระคุณผู้ปกครองครับ/ค่ะ 🙏', width / 2, curY + 14);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '400 9px "Prompt", sans-serif';
    ctx.fillText('Money Plus v.4 · Smart Attendance & Billing', width / 2, curY + 28);

    // Pre-cache DataURL, Blob & File for instant iPad Web Share
    const dataUrl = canvas.toDataURL('image/png');
    this.currentDataUrl = dataUrl;
    if (previewImg) {
      previewImg.src = dataUrl;
    }

    if (canvas.toBlob) {
      canvas.toBlob((blob) => {
        if (blob) {
          this.currentBlob = blob;
          try {
            this.currentFile = new File([blob], `ใบแจ้งยอด_${student.name}.png`, { type: 'image/png' });
          } catch (e) {
            console.warn('File constructor unsupported', e);
          }
        }
      }, 'image/png');
    }
  }
};
