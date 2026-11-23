// Excel Export and Import using SheetJS (XLSX)
window.ExcelService = {
  exportToExcel: function(data) {
    if (typeof XLSX === 'undefined') {
      alert('ไลบรารี SheetJS ยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง');
      return;
    }

    const wb = XLSX.utils.book_new();

    // Helper to format transactions for sheets
    const formatTxList = (txList) => {
      return txList.map((tx, idx) => ({
        'ลำดับ': idx + 1,
        'วันที่เรียน': tx.date,
        'ปี': tx.year || (tx.date ? tx.date.split('-')[0] : ''),
        'เดือน': tx.month || (tx.date ? getThaiMonth(tx.date) : ''),
        'กลุ่มเรียน': tx.group,
        'ระดับชั้น': tx.grade || '',
        'ชื่อนักเรียน': tx.studentName,
        'ค่าเรียน (บาท)': Number(tx.amount) || 0,
        'สถานะ': tx.status,
        'ช่องทางชำระเงิน': tx.paymentMethod,
        'Firebase ID': tx.firebaseId || ''
      }));
    };

    // 1. Sheet ปี 2026
    const tx2026 = data.transactions.filter(t => (t.year === '2026' || (t.date && t.date.startsWith('2026'))));
    const ws2026 = XLSX.utils.json_to_sheet(formatTxList(tx2026));
    XLSX.utils.book_append_sheet(wb, ws2026, `ปี 2026 (${tx2026.length} รายการ)`);

    // 2. Sheet ปี 2025
    const tx2025 = data.transactions.filter(t => (t.year === '2025' || (t.date && t.date.startsWith('2025'))));
    const ws2025 = XLSX.utils.json_to_sheet(formatTxList(tx2025));
    XLSX.utils.book_append_sheet(wb, ws2025, `ปี 2025 (${tx2025.length} รายการ)`);

    // 3. Sheet รวมทุกปี
    const wsAll = XLSX.utils.json_to_sheet(formatTxList(data.transactions));
    XLSX.utils.book_append_sheet(wb, wsAll, `รวมทุกปี (${data.transactions.length} รายการ)`);

    // 4. Sheet รายชื่อนักเรียน (Students)
    const stuList = data.students.map((s, idx) => ({
      'ลำดับ': idx + 1,
      'ระดับชั้น': s.grade || '',
      'ชื่อนักเรียน': s.name,
      'กลุ่มเรียน (ที่สังกัด)': s.group || '-'
    }));
    const wsStu = XLSX.utils.json_to_sheet(stuList);
    XLSX.utils.book_append_sheet(wb, wsStu, 'รายชื่อนักเรียน (Students)');

    // 5. Sheet กลุ่มเรียน (Groups)
    const grpList = data.groups.map((g, idx) => ({
      'ลำดับ': idx + 1,
      'ชื่อกลุ่มเรียน': g.name
    }));
    const wsGrp = XLSX.utils.json_to_sheet(grpList);
    XLSX.utils.book_append_sheet(wb, wsGrp, 'กลุ่มเรียน (Groups)');

    // Generate filename with date
    const today = new Date().toISOString().split('T')[0];
    const fileName = `MoneyPlus_Export_${today}.xlsx`;
    XLSX.writeFile(wb, fileName);
  },

  importFromExcel: function(file, callback) {
    if (typeof XLSX === 'undefined') {
      alert('ไลบรารี SheetJS ยังไม่พร้อมใช้งาน');
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });

        // Try reading all sheets
        let txSheetName = wb.SheetNames.find(n => n.includes('รวมทุกปี') || n.includes('รายการ') || n.includes('2026'));
        if (!txSheetName && wb.SheetNames.length > 0) txSheetName = wb.SheetNames[0];

        const rawTx = XLSX.utils.sheet_to_json(wb.Sheets[txSheetName] || {});
        
        // Convert to standard format
        const importedTx = rawTx.map((r, idx) => ({
          id: 'tx_imp_' + Date.now() + '_' + idx,
          seq: idx + 1,
          date: r['วันที่เรียน'] ? String(r['วันที่เรียน']).substring(0, 10) : new Date().toISOString().split('T')[0],
          year: String(r['ปี'] || ''),
          month: String(r['เดือน'] || ''),
          group: String(r['กลุ่มเรียน'] || ''),
          grade: String(r['ระดับชั้น'] || ''),
          studentName: String(r['ชื่อนักเรียน'] || '').trim(),
          amount: Number(r['ค่าเรียน (บาท)']) || 0,
          status: String(r['สถานะ'] || 'จ่ายแล้ว').trim(),
          paymentMethod: String(r['ช่องทางชำระเงิน'] || 'เงินสด').trim(),
          firebaseId: String(r['Firebase ID'] || '')
        })).filter(t => t.studentName);

        // Read students sheet if exists
        let importedStudents = [];
        const stuSheetName = wb.SheetNames.find(n => n.includes('นักเรียน') || n.includes('Students'));
        if (stuSheetName) {
          const rawStu = XLSX.utils.sheet_to_json(wb.Sheets[stuSheetName] || {});
          importedStudents = rawStu.map((s, idx) => ({
            id: 'stu_imp_' + idx,
            name: String(s['ชื่อนักเรียน'] || '').trim(),
            grade: String(s['ระดับชั้น'] || '').trim(),
            group: String(s['กลุ่มเรียน (ที่สังกัด)'] || s['กลุ่มเรียน'] || '').trim(),
            defaultFee: 200
          })).filter(s => s.name);
        }

        // Read groups sheet if exists
        let importedGroups = [];
        const grpSheetName = wb.SheetNames.find(n => n.includes('กลุ่มเรียน') || n.includes('Groups'));
        if (grpSheetName) {
          const rawGrp = XLSX.utils.sheet_to_json(wb.Sheets[grpSheetName] || {});
          importedGroups = rawGrp.map((g, idx) => ({
            id: 'grp_imp_' + idx,
            name: String(g['ชื่อกลุ่มเรียน'] || g['กลุ่มเรียน'] || '').trim()
          })).filter(g => g.name);
        }

        callback(null, {
          transactions: importedTx,
          students: importedStudents,
          groups: importedGroups
        });
      } catch (err) {
        callback(err);
      }
    };
    reader.readAsArrayBuffer(file);
  }
};

function getThaiMonth(dateStr) {
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  try {
    const parts = dateStr.split('-');
    if (parts.length >= 2) {
      const mIdx = parseInt(parts[1], 10) - 1;
      return months[mIdx] || '';
    }
  } catch(e) {}
  return '';
}
