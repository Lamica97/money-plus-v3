// Money Plus v.4 - Excel (.xlsx) & Google Sheets (.csv) Export / Import Service
const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function getThaiMonthFromDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 2) return '';
  const m = parseInt(parts[1], 10);
  return (m >= 1 && m <= 12) ? THAI_MONTHS_SHORT[m - 1] : '';
}

window.ExportService = {
  // 1. Export Multi-Sheet Excel (.xlsx)
  exportToExcel: function(data) {
    if (typeof XLSX === 'undefined') {
      alert('ไลบรารี SheetJS ยังไม่พร้อมใช้งาน กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต');
      return;
    }

    const wb = XLSX.utils.book_new();

    const formatTxList = (txList) => {
      return txList.map((tx, idx) => ({
        'ลำดับ': idx + 1,
        'วันที่เรียน': tx.date,
        'ปี': tx.year || (tx.date ? tx.date.split('-')[0] : ''),
        'เดือน': tx.month || getThaiMonthFromDate(tx.date),
        'กลุ่มเรียน': tx.group || '',
        'ระดับชั้น': tx.grade || '',
        'ชื่อนักเรียน': tx.studentName || '',
        'ค่าเรียน (บาท)': Number(tx.amount) || 0,
        'สถานะ': tx.status || '',
        'ช่องทางชำระเงิน': tx.paymentMethod || '-',
        'Firebase ID': tx.firebaseId || ''
      }));
    };

    const tx2026 = (data.transactions || []).filter(t => t.year === '2026' || (t.date && t.date.startsWith('2026')));
    const ws2026 = XLSX.utils.json_to_sheet(formatTxList(tx2026));
    XLSX.utils.book_append_sheet(wb, ws2026, `ปี 2026 (${tx2026.length} รายการ)`);

    const tx2025 = (data.transactions || []).filter(t => t.year === '2025' || (t.date && t.date.startsWith('2025')));
    const ws2025 = XLSX.utils.json_to_sheet(formatTxList(tx2025));
    XLSX.utils.book_append_sheet(wb, ws2025, `ปี 2025 (${tx2025.length} รายการ)`);

    const wsAll = XLSX.utils.json_to_sheet(formatTxList(data.transactions || []));
    XLSX.utils.book_append_sheet(wb, wsAll, `รวมทุกปี (${(data.transactions || []).length} รายการ)`);

    const stuList = (data.students || []).map((s, idx) => ({
      'ลำดับ': idx + 1,
      'ระดับชั้น': s.grade || '',
      'ชื่อนักเรียน': s.name || '',
      'ค่าเรียนมาตรฐาน': Number(s.defaultFee) || 200,
      'กลุ่มเรียน (ที่สังกัด)': s.group || '-'
    }));
    const wsStu = XLSX.utils.json_to_sheet(stuList);
    XLSX.utils.book_append_sheet(wb, wsStu, 'รายชื่อนักเรียน (Students)');

    const grpList = (data.groups || []).map((g, idx) => ({
      'ลำดับ': idx + 1,
      'ชื่อกลุ่มเรียน': g.name || ''
    }));
    const wsGrp = XLSX.utils.json_to_sheet(grpList);
    XLSX.utils.book_append_sheet(wb, wsGrp, 'กลุ่มเรียน (Groups)');

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `MoneyPlus_v4_Export_${today}.xlsx`);
  },

  // 2. Direct UTF-8 BOM CSV Export (For Google Sheets / Excel)
  exportToCSV: function(data) {
    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '';
      const s = String(val);
      if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };

    const headers = ['ลำดับ', 'วันที่เรียน', 'ปี', 'เดือน', 'กลุ่มเรียน', 'ระดับชั้น', 'ชื่อนักเรียน', 'ค่าเรียน (บาท)', 'สถานะ', 'ช่องทางชำระเงิน', 'Firebase ID'];
    const rows = (data.transactions || []).map((tx, idx) => [
      idx + 1,
      tx.date || '',
      tx.year || (tx.date ? tx.date.split('-')[0] : ''),
      tx.month || getThaiMonthFromDate(tx.date),
      tx.group || '',
      tx.grade || '',
      tx.studentName || '',
      Number(tx.amount) || 0,
      tx.status || '',
      tx.paymentMethod || '-',
      tx.firebaseId || ''
    ].map(escapeCsv).join(','));

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const today = new Date().toISOString().split('T')[0];
    const link = document.createElement('a');
    link.href = url;
    link.download = `MoneyPlus_v4_Transactions_${today}.csv`;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 1000);
  },

  // 3. Import from Excel (.xlsx / .xls)
  importFromExcel: function(file, callback) {
    if (typeof XLSX === 'undefined') {
      alert('ไลบรารี SheetJS ยังไม่พร้อมใช้งาน');
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        let allSheetName = workbook.SheetNames.find(n => n.includes('รวมทุกปี'));
        const txRows = [];

        if (allSheetName) {
          const ws = workbook.Sheets[allSheetName];
          txRows.push(...XLSX.utils.sheet_to_json(ws));
        } else {
          workbook.SheetNames.forEach(name => {
            if (name.includes('ปี ')) {
              const ws = workbook.Sheets[name];
              txRows.push(...XLSX.utils.sheet_to_json(ws));
            }
          });
        }

        if (txRows.length === 0 && workbook.SheetNames.length > 0) {
          const ws = workbook.Sheets[workbook.SheetNames[0]];
          txRows.push(...XLSX.utils.sheet_to_json(ws));
        }

        const transactions = txRows.map((row, idx) => {
          const dStr = String(row['วันที่เรียน'] || row['Date'] || '');
          const rawStatus = String(row['สถานะ'] || row['Status'] || 'จ่ายแล้ว');
          return {
            id: 'tx_' + Date.now() + '_' + idx,
            seq: Number(row['ลำดับ']) || (idx + 1),
            date: dStr,
            year: String(row['ปี'] || (dStr ? dStr.split('-')[0] : '')),
            month: String(row['เดือน'] || getThaiMonthFromDate(dStr)),
            group: String(row['กลุ่มเรียน'] || row['Group'] || ''),
            grade: String(row['ระดับชั้น'] || row['Level'] || ''),
            studentName: String(row['ชื่อนักเรียน'] || row['Name'] || '').trim(),
            amount: Number(row['ค่าเรียน (บาท)'] || row['Amount'] || 0),
            status: rawStatus === 'ค้างชำระ' ? 'ค้างจ่าย' : rawStatus,
            paymentMethod: String(row['ช่องทางชำระเงิน'] || row['paymentMethod'] || '-'),
            firebaseId: String(row['Firebase ID'] || ('import_' + idx))
          };
        }).filter(t => t.studentName);

        let students = [];
        const stuSheetName = workbook.SheetNames.find(n => n.includes('รายชื่อนักเรียน') || n.includes('Students'));
        if (stuSheetName) {
          const stuRows = XLSX.utils.sheet_to_json(workbook.Sheets[stuSheetName]);
          students = stuRows.map((r, idx) => ({
            id: 'stu_' + (idx + 1),
            name: String(r['ชื่อนักเรียน'] || '').trim(),
            grade: String(r['ระดับชั้น'] || '').trim(),
            group: String(r['กลุ่มเรียน (ที่สังกัด)'] || '-').trim(),
            defaultFee: Number(r['ค่าเรียนมาตรฐาน']) || 200
          })).filter(s => s.name);
        }

        let groups = [];
        const grpSheetName = workbook.SheetNames.find(n => n.includes('กลุ่มเรียน') || n.includes('Groups'));
        if (grpSheetName) {
          const grpRows = XLSX.utils.sheet_to_json(workbook.Sheets[grpSheetName]);
          groups = grpRows.map((r, idx) => ({
            id: 'grp_' + (idx + 1),
            name: String(r['ชื่อกลุ่มเรียน'] || '').trim()
          })).filter(g => g.name);
        }

        callback(null, { transactions, students, groups });
      } catch (err) {
        callback(err, null);
      }
    };
    reader.readAsArrayBuffer(file);
  }
};
