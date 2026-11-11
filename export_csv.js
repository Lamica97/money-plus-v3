const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, 'src', 'data', 'initialData.json');
const d = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const escapeCsv = (val) => {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
};

const BOM = '\uFEFF';

// 1. Transactions CSV
const txHeaders = ['ลำดับ', 'วันที่เรียน', 'ปี', 'เดือน', 'กลุ่มเรียน', 'ระดับชั้น', 'ชื่อนักเรียน', 'ค่าเรียน (บาท)', 'สถานะ', 'ช่องทางชำระเงิน'];
const txRows = (d.transactions || []).map((t, idx) => [
  idx + 1,
  t.date || '',
  t.year || (t.date ? t.date.split('-')[0] : ''),
  t.month || '',
  t.group || '',
  t.grade || '',
  t.studentName || '',
  Number(t.amount) || 0,
  t.status || '',
  t.paymentMethod || ''
].map(escapeCsv).join(','));

const txCsv = BOM + [txHeaders.join(','), ...txRows].join('\r\n');
fs.writeFileSync('MoneyPlus_Transactions_All.csv', txCsv, 'utf8');

// 2. Students CSV
const stuHeaders = ['ลำดับ', 'ระดับชั้น', 'ชื่อนักเรียน', 'กลุ่มเรียน'];
const stuRows = (d.students || []).map((s, idx) => [
  idx + 1,
  s.grade || '',
  s.name || '',
  s.group || '-'
].map(escapeCsv).join(','));

const stuCsv = BOM + [stuHeaders.join(','), ...stuRows].join('\r\n');
fs.writeFileSync('MoneyPlus_Students.csv', stuCsv, 'utf8');

console.log('SUCCESS: CSV files generated!');
console.log('Transactions count:', txRows.length);
console.log('Students count:', stuRows.length);
