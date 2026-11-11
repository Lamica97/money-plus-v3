import json
import os
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

# Paths
base_dir = os.path.dirname(os.path.abspath(__file__))
data_file = os.path.join(base_dir, 'src', 'data', 'initialData.json')
backup_dir = os.path.join(base_dir, 'backups')
os.makedirs(backup_dir, exist_ok=True)

date_str = '2026-11-11'

with open(data_file, 'r', encoding='utf-8') as f:
    data = json.load(f)

transactions = data.get('transactions', [])
students = data.get('students', [])
groups = data.get('groups', [])
payment_settings = data.get('paymentSettings', {})

print(f"Loaded: {len(transactions)} transactions, {len(students)} students, {len(groups)} groups")

# 1. JSON Backup
json_backup_path = os.path.join(backup_dir, f'MoneyPlus_Backup_{date_str}.json')
json_root_path = os.path.join(base_dir, f'MoneyPlus_Backup_{date_str}.json')
backup_payload = {
    'backupDate': date_str,
    'totalTransactions': len(transactions),
    'totalStudents': len(students),
    'totalGroups': len(groups),
    'paymentSettings': payment_settings,
    'transactions': transactions,
    'students': students,
    'groups': groups
}

with open(json_backup_path, 'w', encoding='utf-8') as f:
    json.dump(backup_payload, f, ensure_ascii=False, indent=2)
with open(json_root_path, 'w', encoding='utf-8') as f:
    json.dump(backup_payload, f, ensure_ascii=False, indent=2)

print(f"Created JSON backup: {json_backup_path}")

# Helper for Thai Month
thai_months = {
    '01': 'ม.ค.', '02': 'ก.พ.', '03': 'มี.ค.', '04': 'เม.ย.',
    '05': 'พ.ค.', '06': 'มิ.ย.', '07': 'ก.ค.', '08': 'ส.ค.',
    '09': 'ก.ย.', '10': 'ต.ค.', '11': 'พ.ย.', '12': 'ธ.ค.'
}

def get_thai_month(date_val):
    if not date_val:
        return ''
    parts = str(date_val).split('-')
    if len(parts) >= 2:
        return thai_months.get(parts[1], parts[1])
    return ''

# 2. Excel Backup (.xlsx)
wb = openpyxl.Workbook()
# remove default sheet
wb.remove(wb.active)

# Styles
header_font = Font(name='Prompt', size=11, bold=True, color='FFFFFF')
header_fill = PatternFill(start_color='059669', end_color='059669', fill_type='solid') # Emerald
data_font = Font(name='Prompt', size=10)
bold_font = Font(name='Prompt', size=10, bold=True)
paid_font = Font(name='Prompt', size=10, color='166534', bold=True)
pending_font = Font(name='Prompt', size=10, color='B45309', bold=True)
thin_border = Border(
    left=Side(style='thin', color='E2E8F0'),
    right=Side(style='thin', color='E2E8F0'),
    top=Side(style='thin', color='E2E8F0'),
    bottom=Side(style='thin', color='E2E8F0')
)

tx_headers = ['ลำดับ', 'วันที่เรียน', 'ปี', 'เดือน', 'กลุ่มเรียน', 'ระดับชั้น', 'ชื่อนักเรียน', 'ค่าเรียน (บาท)', 'สถานะ', 'ช่องทางชำระเงิน', 'Firebase ID']

def add_tx_sheet(title, tx_list):
    ws = wb.create_sheet(title=title)
    ws.append(tx_headers)
    
    # Style header row
    for col_idx in range(1, len(tx_headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal='center', vertical='center')
        cell.border = thin_border
    ws.row_dimensions[1].height = 28

    for idx, tx in enumerate(tx_list, 1):
        d_val = tx.get('date', '')
        y_val = tx.get('year') or (d_val.split('-')[0] if d_val else '')
        m_val = tx.get('month') or get_thai_month(d_val)
        amt = float(tx.get('amount') or 0)
        status = tx.get('status', '')
        pay_method = tx.get('paymentMethod', '')
        fb_id = tx.get('firebaseId', '')

        row = [
            idx,
            d_val,
            y_val,
            m_val,
            tx.get('group', ''),
            tx.get('grade', ''),
            tx.get('studentName', ''),
            amt,
            status,
            pay_method,
            fb_id
        ]
        ws.append(row)
        curr_row = idx + 1
        ws.row_dimensions[curr_row].height = 20
        for col_idx in range(1, len(row) + 1):
            c = ws.cell(row=curr_row, column=col_idx)
            c.border = thin_border
            if col_idx == 8: # Amount
                c.font = bold_font
                c.number_format = '#,##0'
                c.alignment = Alignment(horizontal='right', vertical='center')
            elif col_idx == 9: # Status
                c.alignment = Alignment(horizontal='center', vertical='center')
                c.font = paid_font if status == 'จ่ายแล้ว' else pending_font
            elif col_idx in (1, 2, 3, 4, 6):
                c.font = data_font
                c.alignment = Alignment(horizontal='center', vertical='center')
            else:
                c.font = data_font
                c.alignment = Alignment(horizontal='left', vertical='center')

    # Auto fit column width
    for col in ws.columns:
        col_letter = get_column_letter(col[0].column)
        max_len = max(len(str(cell.value or '')) for cell in col)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

# Sheet 1: Year 2026
tx_2026 = [t for t in transactions if t.get('year') == '2026' or (t.get('date') and t.get('date').startswith('2026'))]
add_tx_sheet(f'ปี 2026 ({len(tx_2026)} รายการ)', tx_2026)

# Sheet 2: Year 2025
tx_2025 = [t for t in transactions if t.get('year') == '2025' or (t.get('date') and t.get('date').startswith('2025'))]
add_tx_sheet(f'ปี 2025 ({len(tx_2025)} รายการ)', tx_2025)

# Sheet 3: All Years
add_tx_sheet(f'รวมทุกปี ({len(transactions)} รายการ)', transactions)

# Sheet 4: Students
ws_stu = wb.create_sheet(title='รายชื่อนักเรียน (Students)')
stu_headers = ['ลำดับ', 'ระดับชั้น', 'ชื่อนักเรียน', 'กลุ่มเรียน (ที่สังกัด)']
ws_stu.append(stu_headers)
for col_idx in range(1, len(stu_headers) + 1):
    cell = ws_stu.cell(row=1, column=col_idx)
    cell.font = header_font
    cell.fill = header_fill
    cell.alignment = Alignment(horizontal='center', vertical='center')
    cell.border = thin_border
ws_stu.row_dimensions[1].height = 28

for idx, s in enumerate(students, 1):
    row = [idx, s.get('grade', ''), s.get('name', ''), s.get('group', '-')]
    ws_stu.append(row)
    curr_row = idx + 1
    ws_stu.row_dimensions[curr_row].height = 20
    for col_idx in range(1, len(row) + 1):
        c = ws_stu.cell(row=curr_row, column=col_idx)
        c.font = data_font
        c.border = thin_border
        c.alignment = Alignment(horizontal='center' if col_idx in (1, 2) else 'left', vertical='center')

for col in ws_stu.columns:
    col_letter = get_column_letter(col[0].column)
    max_len = max(len(str(cell.value or '')) for cell in col)
    ws_stu.column_dimensions[col_letter].width = max(max_len + 4, 15)

# Sheet 5: Groups
ws_grp = wb.create_sheet(title='กลุ่มเรียน (Groups)')
grp_headers = ['ลำดับ', 'ชื่อกลุ่มเรียน']
ws_grp.append(grp_headers)
for col_idx in range(1, len(grp_headers) + 1):
    cell = ws_grp.cell(row=1, column=col_idx)
    cell.font = header_font
    cell.fill = header_fill
    cell.alignment = Alignment(horizontal='center', vertical='center')
    cell.border = thin_border
ws_grp.row_dimensions[1].height = 28

for idx, g in enumerate(groups, 1):
    row = [idx, g.get('name', '')]
    ws_grp.append(row)
    curr_row = idx + 1
    ws_grp.row_dimensions[curr_row].height = 20
    for col_idx in range(1, len(row) + 1):
        c = ws_grp.cell(row=curr_row, column=col_idx)
        c.font = data_font
        c.border = thin_border
        c.alignment = Alignment(horizontal='center' if col_idx == 1 else 'left', vertical='center')

for col in ws_grp.columns:
    col_letter = get_column_letter(col[0].column)
    max_len = max(len(str(cell.value or '')) for cell in col)
    ws_grp.column_dimensions[col_letter].width = max(max_len + 4, 15)

# Save Excel files
xlsx_backup_path = os.path.join(backup_dir, f'MoneyPlus_Backup_{date_str}.xlsx')
xlsx_root_path = os.path.join(base_dir, f'MoneyPlus_Backup_{date_str}.xlsx')
wb.save(xlsx_backup_path)
wb.save(xlsx_root_path)
print(f"Created Excel backup: {xlsx_backup_path}")

# 3. CSV Backups (with UTF-8 BOM)
import csv

def write_csv(filepath, headers, rows):
    with open(filepath, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(rows)

# Transactions CSV
tx_csv_rows = []
for idx, tx in enumerate(transactions, 1):
    d_val = tx.get('date', '')
    y_val = tx.get('year') or (d_val.split('-')[0] if d_val else '')
    m_val = tx.get('month') or get_thai_month(d_val)
    tx_csv_rows.append([
        idx, d_val, y_val, m_val, tx.get('group', ''), tx.get('grade', ''),
        tx.get('studentName', ''), float(tx.get('amount') or 0), tx.get('status', ''), tx.get('paymentMethod', '')
    ])

write_csv(os.path.join(backup_dir, f'MoneyPlus_Transactions_{date_str}.csv'), tx_headers[:10], tx_csv_rows)
write_csv(os.path.join(base_dir, f'MoneyPlus_Transactions_{date_str}.csv'), tx_headers[:10], tx_csv_rows)

# Students CSV
stu_csv_rows = [[idx, s.get('grade', ''), s.get('name', ''), s.get('group', '-')] for idx, s in enumerate(students, 1)]
write_csv(os.path.join(backup_dir, f'MoneyPlus_Students_{date_str}.csv'), stu_headers, stu_csv_rows)
write_csv(os.path.join(base_dir, f'MoneyPlus_Students_{date_str}.csv'), stu_headers, stu_csv_rows)

# Groups CSV
grp_csv_rows = [[idx, g.get('name', '')] for idx, g in enumerate(groups, 1)]
write_csv(os.path.join(backup_dir, f'MoneyPlus_Groups_{date_str}.csv'), grp_headers, grp_csv_rows)
write_csv(os.path.join(base_dir, f'MoneyPlus_Groups_{date_str}.csv'), grp_headers, grp_csv_rows)

print("SUCCESS: All backups created successfully!")
