// Money Plus v.3 - Core Application Logic with Beautiful Modals & Calendar
const STORAGE_KEY = 'money_plus_v3_store';

const App = {
  state: {
    transactions: [],
    students: [],
    groups: [],
    activeTab: 'quick-record',
    // Quick record state
    recordMode: 'group',
    recordDate: new Date().toISOString().split('T')[0],
    recordGrade: 'ม.1',
    recordGroup: '',
    sessionStudents: [],
    // Single record state
    singleStudentName: '',
    singleDate: new Date().toISOString().split('T')[0],
    singleGrade: '',
    singleGroup: '',
    singleAmount: 200,
    singleStatus: 'ค้างจ่าย',
    singlePayment: '-',
    // Filter state
    filter: {
      search: '',
      year: 'all',
      month: 'all',
      group: 'all',
      grade: 'all',
      status: 'all',
      payment: 'all',
      quickChip: 'all'
    },
    masterGradeFilter: 'all',
    page: 1,
    pageSize: 50,
    // Calendar state
    calendarYear: 2026,
    calendarMonth: 8, // 0-indexed (8 = September)
    // Dashboard filter state
    dashSelectedYear: '2026',
    dashSelectedMonth: 'ก.ย.',
    // Modals state
    editingTx: null,
    editingStudentId: null,
    pendingTxForPayment: null,
    confirmActionCallback: null,
    selectedCalendarDate: null,
    // Unpaid Tracker state
    unpaidSearch: '',
    unpaidGradeFilter: 'all',
    unpaidSort: 'amount-desc',
    currentSlipStudentName: null,
    paymentSettings: {
      accountName: 'ครูผู้สอน (Money Plus)',
      bankName: 'ธนาคารกสิกรไทย',
      accountNumber: '123-4-56789-0',
      promptPay: '089-123-4567',
      note: 'โอนแล้วรบกวนส่งสลิปยืนยัน ขอบคุณครับ/ค่ะ 🙏'
    }
  },

  charts: {},

  init: function() {
    this.initTheme();
    this.loadData();
    this.setupDateDefaults();
    this.bindEvents();
    this.render();
    this.initFirebase();
  },

  getAvailableGrades: function() {
    const gradesSet = new Set();
    this.state.students.forEach(s => {
      if (s.grade && s.grade.trim()) gradesSet.add(s.grade.trim());
    });
    const order = ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6', 'ป.6'];
    const sorted = Array.from(gradesSet).sort((a, b) => {
      const idxA = order.indexOf(a);
      const idxB = order.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b, 'th');
    });
    return sorted.length > 0 ? sorted : ['ม.1', 'ม.4', 'ม.5', 'ม.6'];
  },

  loadData: function() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.state.transactions = parsed.transactions || [];
        // Normalize any status to ค้างจ่าย
        this.state.transactions.forEach(t => {
          if (t.status === 'ค้างชำระ') t.status = 'ค้างจ่าย';
          if (t.id === 'tx_181' && t.status === 'จ่ายแล้ว' && t.paymentMethod === '-') t.status = 'ค้างจ่าย';
        });
        this.state.students = parsed.students || [];
        this.state.groups = parsed.groups || [];
      } catch (e) {
        console.error('Failed to parse saved data, fallback to initial data', e);
        this.loadInitial();
      }
    } else {
      this.loadInitial();
    }

    const savedSettings = localStorage.getItem('money_plus_v3_payment_settings');
    if (savedSettings) {
      try {
        this.state.paymentSettings = Object.assign(this.state.paymentSettings, JSON.parse(savedSettings));
      } catch (e) {}
    }

    if (this.state.groups.length > 0 && !this.state.recordGroup) {
      this.state.recordGroup = this.state.groups[0].name;
    }
    const availGrades = this.getAvailableGrades();
    if (!this.state.recordGrade || (!availGrades.includes(this.state.recordGrade) && this.state.recordGrade !== 'all')) {
      this.state.recordGrade = availGrades[0] || 'ม.1';
    }
    this.populateSessionStudents();
  },

  loadInitial: function() {
    if (window.INITIAL_MONEY_PLUS_DATA) {
      this.state.transactions = JSON.parse(JSON.stringify(window.INITIAL_MONEY_PLUS_DATA.transactions));
      this.state.students = JSON.parse(JSON.stringify(window.INITIAL_MONEY_PLUS_DATA.students));
      this.state.groups = JSON.parse(JSON.stringify(window.INITIAL_MONEY_PLUS_DATA.groups));
      this.saveData();
    }
  },

  saveData: function() {
    const payload = {
      transactions: this.state.transactions,
      students: this.state.students,
      groups: this.state.groups,
      paymentSettings: this.state.paymentSettings,
      lastUpdated: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    this.updateUnpaidBadge();

    // Sync to Firebase in background if connected
    if (window.FirebaseService && window.FirebaseService.db) {
      window.FirebaseService.saveData(payload);
    }
  },

  resetData: function() {
    this.openConfirmModal({
      title: 'รีเซ็ตข้อมูลเริ่มต้น',
      message: 'คุณแน่ใจหรือไม่ว่าต้องการรีเซ็ตข้อมูลทั้งหมดกลับเป็นค่าเริ่มต้นจากไฟล์สำรองข้อมูลเดิม? รายการที่เพิ่มใหม่จะหายไป',
      confirmText: 'รีเซ็ตข้อมูล',
      confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
      onConfirm: () => {
        localStorage.removeItem(STORAGE_KEY);
        this.loadInitial();
        this.render();
        this.showToast('รีเซ็ตข้อมูลกลับเป็นค่าเริ่มต้นเรียบร้อยแล้ว', 'success');
      }
    });
  },

  setupDateDefaults: function() {
    // Default to the latest date from data or today
    let defaultDate = new Date().toISOString().split('T')[0];
    if (this.state.transactions.length > 0 && this.state.transactions[0].date) {
      defaultDate = this.state.transactions[0].date;
    }
    this.state.recordDate = defaultDate;
    this.state.singleDate = defaultDate;

    // Set calendar month/year based on defaultDate
    const parts = defaultDate.split('-');
    if (parts.length >= 2) {
      this.state.calendarYear = parseInt(parts[0], 10);
      this.state.calendarMonth = parseInt(parts[1], 10) - 1;
      this.state.dashSelectedYear = parts[0];
      this.state.dashSelectedMonth = getThaiMonth(defaultDate);
    }
  },

  setRecordDateQuick: function(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const dateStr = d.toISOString().split('T')[0];
    this.state.recordDate = dateStr;
    const input = document.getElementById('record-date-input');
    if (input) input.value = dateStr;
    this.showToast(`เปลี่ยนวันที่เป็น: ${dateStr}`, 'info');
  },

  populateSessionStudents: function() {
    const grade = this.state.recordGrade;
    const groupName = this.state.recordGroup || (this.state.groups[0]?.name || 'วันอื่น_ๆ');
    
    let targetStudents = [];
    if (!grade || grade === 'all') {
      targetStudents = this.state.students;
    } else if (grade === 'other') {
      const knownGrades = this.getAvailableGrades();
      targetStudents = this.state.students.filter(s => !s.grade || !knownGrades.includes(s.grade));
    } else {
      targetStudents = this.state.students.filter(s => s.grade === grade);
    }

    this.state.sessionStudents = targetStudents.map(s => {
      const defaultFee = Number(s.defaultFee) || 200;
      return {
        name: s.name,
        grade: s.grade || (grade !== 'all' && grade !== 'other' ? grade : ''),
        group: groupName,
        amount: defaultFee,
        present: false,
        status: 'ค้างจ่าย',
        paymentMethod: '-'
      };
    });
  },

  // ----------------- QUICK RECORD ACTIONS -----------------
  setAllPresent: function(isPresent) {
    this.state.sessionStudents.forEach(item => {
      item.present = isPresent;
    });
    this.renderQuickRecordList();
    this.showToast(isPresent ? 'เลือกนักเรียนทุกคนแล้ว' : 'ยกเลิกการเลือกทุกคนแล้ว', 'info');
  },

  setGroupPreset: function(type) {
    this.state.sessionStudents.forEach(item => {
      item.present = true;
      if (type === 'paid_transfer') {
        item.status = 'จ่ายแล้ว';
        item.paymentMethod = 'เงินโอน';
      } else if (type === 'paid_cash') {
        item.status = 'จ่ายแล้ว';
        item.paymentMethod = 'เงินสด';
      } else if (type === 'pending') {
        item.status = 'ค้างจ่าย';
        item.paymentMethod = '-';
      }
    });
    this.renderQuickRecordList();
    this.showToast('ตั้งค่าสถานะให้ทุกคนเรียบร้อย', 'info');
  },

  saveSessionRecords: function() {
    const activeStudents = this.state.sessionStudents.filter(s => s.present);
    if (activeStudents.length === 0) {
      this.showToast('ไม่มีนักเรียนที่เลือก "มาเรียน" ในรอบนี้', 'error');
      return;
    }

    const dateVal = this.state.recordDate;
    const yearVal = dateVal.split('-')[0];
    const monthVal = getThaiMonth(dateVal);
    const sessionGroup = this.state.recordGroup || (this.state.groups[0]?.name || 'วันอื่น_ๆ');

    const newTxList = activeStudents.map((item, idx) => {
      return {
        id: 'tx_' + Date.now() + '_' + idx,
        seq: this.state.transactions.length + idx + 1,
        date: dateVal,
        year: yearVal,
        month: monthVal,
        group: sessionGroup,
        grade: item.grade || '',
        studentName: item.name,
        amount: Number(item.amount) || 0,
        status: item.status,
        paymentMethod: item.status === 'ค้างจ่าย' ? '-' : item.paymentMethod,
        firebaseId: 'local_' + Math.random().toString(36).substr(2, 9)
      };
    });

    this.state.transactions.unshift(...newTxList);
    this.saveData();

    const sumAmt = newTxList.reduce((s, c) => s + c.amount, 0);
    this.showToast(`บันทึกการสอนเรียบร้อย ${newTxList.length} รายการ (รวม ฿${sumAmt.toLocaleString()})`, 'success');
    this.switchTab('transactions');
  },

  saveSingleRecord: function() {
    const name = (this.state.singleStudentName || '').trim();
    if (!name) {
      this.showToast('กรุณาระบุชื่อนักเรียน', 'error');
      return;
    }

    const dateVal = this.state.singleDate;
    const yearVal = dateVal.split('-')[0];
    const monthVal = getThaiMonth(dateVal);

    const newTx = {
      id: 'tx_' + Date.now(),
      seq: this.state.transactions.length + 1,
      date: dateVal,
      year: yearVal,
      month: monthVal,
      group: this.state.singleGroup || 'วันอื่น_ๆ',
      grade: this.state.singleGrade || '',
      studentName: name,
      amount: Number(this.state.singleAmount) || 0,
      status: this.state.singleStatus,
      paymentMethod: this.state.singleStatus === 'ค้างจ่าย' ? '-' : this.state.singlePayment,
      firebaseId: 'local_' + Math.random().toString(36).substr(2, 9)
    };

    const existing = this.state.students.find(s => s.name === name);
    if (!existing) {
      this.state.students.push({
        id: 'stu_' + Date.now(),
        name: name,
        grade: this.state.singleGrade || '',
        group: this.state.singleGroup || '',
        defaultFee: Number(this.state.singleAmount) || 200
      });
    }

    this.state.transactions.unshift(newTx);
    this.saveData();
    this.showToast(`บันทึกรายการของ ${name} เรียบร้อย`, 'success');
    this.state.singleStudentName = '';
    const singleInput = document.getElementById('single-student-name');
    if (singleInput) singleInput.value = '';
    this.switchTab('transactions');
  },

  // ----------------- BEAUTIFUL PAYMENT MODAL -----------------
  openPaymentMethodModal: function(txId) {
    const tx = this.state.transactions.find(t => t.id === txId);
    if (!tx) return;
    this.state.pendingTxForPayment = tx;

    document.getElementById('pay-modal-student').textContent = tx.studentName;
    document.getElementById('pay-modal-info').textContent = `วันที่ ${tx.date} · กลุ่ม ${tx.group || '-'}`;
    document.getElementById('pay-modal-amount').textContent = `฿${(Number(tx.amount) || 0).toLocaleString()}`;

    const modal = document.getElementById('payment-method-modal');
    if (modal) modal.classList.remove('hidden');
  },

  selectPaymentMethod: function(method) {
    if (!this.state.pendingTxForPayment) return;
    const tx = this.state.pendingTxForPayment;
    tx.status = 'จ่ายแล้ว';
    tx.paymentMethod = method;
    this.saveData();

    this.closePaymentMethodModal();
    this.renderTransactions();
    this.renderDashboard();
    if (this.state.activeTab === 'calendar') this.renderCalendar();
    this.showToast(`อัปเดต "${tx.studentName}" เป็นจ่ายแล้ว (${method}) เรียบร้อย!`, 'success');
  },

  closePaymentMethodModal: function() {
    this.state.pendingTxForPayment = null;
    const modal = document.getElementById('payment-method-modal');
    if (modal) modal.classList.add('hidden');
  },

  // ----------------- BEAUTIFUL CONFIRM MODAL -----------------
  openConfirmModal: function({ title, message, confirmText, confirmClass, onConfirm }) {
    document.getElementById('confirm-modal-title').textContent = title || 'ยืนยันการทำรายการ';
    document.getElementById('confirm-modal-message').textContent = message || '';
    
    const confirmBtn = document.getElementById('confirm-modal-action-btn');
    confirmBtn.textContent = confirmText || 'ยืนยัน';
    confirmBtn.className = `px-4 py-2 text-xs font-bold rounded-lg shadow-sm transition ${confirmClass || 'bg-emerald-600 hover:bg-emerald-700 text-white'}`;
    
    this.state.confirmActionCallback = onConfirm;

    const modal = document.getElementById('confirm-dialog-modal');
    if (modal) modal.classList.remove('hidden');
  },

  executeConfirmModalAction: function() {
    if (this.state.confirmActionCallback) {
      this.state.confirmActionCallback();
    }
    this.closeConfirmModal();
  },

  closeConfirmModal: function() {
    this.state.confirmActionCallback = null;
    const modal = document.getElementById('confirm-dialog-modal');
    if (modal) modal.classList.add('hidden');
  },

  // ----------------- TABLE ACTIONS -----------------
  deleteTransaction: function(txId) {
    const tx = this.state.transactions.find(t => t.id === txId);
    if (!tx) return;

    this.openConfirmModal({
      title: 'ยืนยันการลบรายการ',
      message: `คุณต้องการลบรายการของ "${tx.studentName}" (วันที่ ${tx.date}, ยอด ฿${tx.amount}) ออกจากระบบใช่หรือไม่?`,
      confirmText: 'ลบรายการ',
      confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
      onConfirm: () => {
        this.state.transactions = this.state.transactions.filter(t => t.id !== txId);
        this.saveData();
        this.renderTransactions();
        this.renderDashboard();
        if (this.state.activeTab === 'calendar') this.renderCalendar();
        this.showToast('ลบรายการเรียบร้อย', 'info');
      }
    });
  },

  openEditModal: function(txId) {
    const tx = this.state.transactions.find(t => t.id === txId);
    if (!tx) return;
    this.state.editingTx = { ...tx };
    this.renderEditModal();
  },

  saveEditedTransaction: function() {
    if (!this.state.editingTx) return;
    const idx = this.state.transactions.findIndex(t => t.id === this.state.editingTx.id);
    if (idx !== -1) {
      const tx = this.state.editingTx;
      tx.date = document.getElementById('edit-date').value;
      tx.studentName = document.getElementById('edit-student').value;
      tx.grade = document.getElementById('edit-grade').value;
      tx.group = document.getElementById('edit-group').value;
      tx.amount = Number(document.getElementById('edit-amount').value) || 0;
      tx.status = document.getElementById('edit-status').value;
      tx.paymentMethod = tx.status === 'ค้างจ่าย' ? '-' : document.getElementById('edit-payment').value;
      tx.year = tx.date ? tx.date.split('-')[0] : tx.year;
      tx.month = tx.date ? getThaiMonth(tx.date) : tx.month;
      
      this.state.transactions[idx] = tx;
      this.saveData();
      this.closeEditModal();
      this.renderTransactions();
      this.renderDashboard();
      if (this.state.activeTab === 'calendar') this.renderCalendar();
      this.showToast('แก้ไขข้อมูลรายการเรียบร้อย', 'success');
    }
  },

  closeEditModal: function() {
    this.state.editingTx = null;
    const modal = document.getElementById('edit-tx-modal');
    if (modal) modal.classList.add('hidden');
  },

  // ----------------- FILTERING LOGIC -----------------
  getFilteredTransactions: function() {
    let list = [...this.state.transactions];
    const f = this.state.filter;

    if (f.quickChip === 'pending') {
      list = list.filter(t => t.status === 'ค้างจ่าย');
    } else if (f.quickChip === 'current_month') {
      const now = new Date();
      const currentYear = String(now.getFullYear());
      const currentMonth = getThaiMonth(now.toISOString().split('T')[0]);
      list = list.filter(t => (t.year === currentYear || (t.date && t.date.startsWith(currentYear))) && t.month === currentMonth);
    } else if (f.quickChip === 'last_month') {
      const now = new Date();
      now.setMonth(now.getMonth() - 1);
      const lastYear = String(now.getFullYear());
      const lastMonth = getThaiMonth(now.toISOString().split('T')[0]);
      list = list.filter(t => (t.year === lastYear || (t.date && t.date.startsWith(lastYear))) && t.month === lastMonth);
    } else if (f.quickChip === 'transfer') {
      list = list.filter(t => t.paymentMethod === 'เงินโอน');
    } else if (f.quickChip === 'cash') {
      list = list.filter(t => t.paymentMethod === 'เงินสด');
    }

    if (f.search) {
      const q = f.search.toLowerCase().trim();
      list = list.filter(t => 
        (t.studentName && t.studentName.toLowerCase().includes(q)) ||
        (t.group && t.group.toLowerCase().includes(q)) ||
        (t.firebaseId && t.firebaseId.toLowerCase().includes(q))
      );
    }

    if (f.year !== 'all') {
      list = list.filter(t => t.year === f.year || (t.date && t.date.startsWith(f.year)));
    }

    if (f.month !== 'all') {
      list = list.filter(t => t.month === f.month);
    }

    if (f.group !== 'all') {
      list = list.filter(t => t.group === f.group);
    }

    if (f.grade !== 'all') {
      list = list.filter(t => t.grade === f.grade);
    }

    if (f.status !== 'all') {
      list = list.filter(t => t.status === f.status);
    }

    if (f.payment !== 'all') {
      list = list.filter(t => t.paymentMethod === f.payment);
    }

    return list;
  },

  setQuickChip: function(chip) {
    this.state.filter.quickChip = chip;
    this.state.page = 1;
    this.renderTransactions();
  },

  resetFilters: function() {
    this.state.filter = {
      search: '',
      year: 'all',
      month: 'all',
      group: 'all',
      grade: 'all',
      status: 'all',
      payment: 'all',
      quickChip: 'all'
    };
    const sInput = document.getElementById('filter-search');
    if (sInput) sInput.value = '';
    ['year', 'month', 'group', 'grade', 'status', 'payment'].forEach(f => {
      const el = document.getElementById('filter-' + f);
      if (el) el.value = 'all';
    });
    this.state.page = 1;
    this.renderTransactions();
    this.showToast('ล้างตัวกรองทั้งหมดเรียบร้อย', 'info');
  },

  setTxMonth: function(monthVal) {
    this.state.filter.month = monthVal;
    if (monthVal !== 'all' && this.state.filter.year === 'all') {
      this.state.filter.year = String(new Date().getFullYear());
    }
    this.state.page = 1;
    this.renderTransactions();
  },

  setTxYear: function(yearVal) {
    this.state.filter.year = yearVal;
    this.state.page = 1;
    this.renderTransactions();
  },

  setTxToCurrentMonth: function() {
    const now = new Date();
    const curYear = String(now.getFullYear());
    const curMonth = getThaiMonth(now.toISOString().split('T')[0]);
    this.state.filter.year = curYear;
    this.state.filter.month = curMonth;
    this.state.page = 1;
    this.renderTransactions();
    this.showToast(`เปลี่ยนเป็นเดือนปัจจุบัน (${curMonth} ${curYear})`, 'info');
  },

  prevTxMonth: function() {
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    let curIdx = months.indexOf(this.state.filter.month);
    let curYr = parseInt(this.state.filter.year, 10) || new Date().getFullYear();
    if (curIdx === -1) {
      const now = new Date();
      curYr = now.getFullYear();
      curIdx = now.getMonth() - 1;
      if (curIdx < 0) {
        curIdx = 11;
        curYr -= 1;
      }
    } else if (curIdx === 0) {
      curIdx = 11;
      curYr -= 1;
    } else {
      curIdx -= 1;
    }
    this.state.filter.month = months[curIdx];
    this.state.filter.year = String(curYr);
    this.state.page = 1;
    this.renderTransactions();
  },

  nextTxMonth: function() {
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    let curIdx = months.indexOf(this.state.filter.month);
    let curYr = parseInt(this.state.filter.year, 10) || new Date().getFullYear();
    if (curIdx === -1) {
      const now = new Date();
      curYr = now.getFullYear();
      curIdx = now.getMonth() + 1;
      if (curIdx > 11) {
        curIdx = 0;
        curYr += 1;
      }
    } else if (curIdx === 11) {
      curIdx = 0;
      curYr += 1;
    } else {
      curIdx += 1;
    }
    this.state.filter.month = months[curIdx];
    this.state.filter.year = String(curYr);
    this.state.page = 1;
    this.renderTransactions();
  },

  // ----------------- NAVIGATION -----------------
  switchTab: function(tabName) {
    this.state.activeTab = tabName;

    ['quick-record', 'transactions', 'calendar', 'dashboard', 'unpaid', 'master'].forEach(t => {
      const panel = document.getElementById('tab-panel-' + t);
      if (panel) panel.classList.add('hidden');

      const navBtn = document.getElementById('nav-' + t);
      if (navBtn) {
        navBtn.classList.remove('border-emerald-500', 'text-emerald-600', 'font-bold');
        navBtn.classList.add('border-transparent', 'text-slate-600');
      }

      const mBtn = document.getElementById('m-nav-' + t);
      if (mBtn) {
        mBtn.classList.remove('text-emerald-600', 'font-bold');
        mBtn.classList.add('text-slate-400', 'font-medium');
      }
    });

    const activePanel = document.getElementById('tab-panel-' + tabName);
    if (activePanel) activePanel.classList.remove('hidden');

    const activeNav = document.getElementById('nav-' + tabName);
    if (activeNav) {
      activeNav.classList.remove('border-transparent', 'text-slate-600');
      activeNav.classList.add('border-emerald-500', 'text-emerald-600', 'font-bold');
    }

    const activeM = document.getElementById('m-nav-' + tabName);
    if (activeM) {
      activeM.classList.remove('text-slate-400', 'font-medium');
      activeM.classList.add('text-emerald-600', 'font-bold');
    }

    if (tabName === 'dashboard') {
      this.renderDashboard();
    } else if (tabName === 'transactions') {
      this.renderTransactions();
    } else if (tabName === 'calendar') {
      this.renderCalendar();
    } else if (tabName === 'quick-record') {
      this.renderQuickRecord();
    } else if (tabName === 'unpaid') {
      this.renderUnpaidTracker();
    } else if (tabName === 'master') {
      this.renderMaster();
    }
  },

  switchRecordMode: function(mode) {
    this.state.recordMode = mode;
    const groupSec = document.getElementById('record-mode-group-sec');
    const singleSec = document.getElementById('record-mode-single-sec');
    const bannerControls = document.getElementById('banner-group-controls');
    const btnGroup = document.getElementById('btn-mode-group');
    const btnSingle = document.getElementById('btn-mode-single');

    if (mode === 'group') {
      if (groupSec) groupSec.classList.remove('hidden');
      if (singleSec) singleSec.classList.add('hidden');
      if (bannerControls) bannerControls.classList.remove('hidden');
      if (btnGroup) btnGroup.className = "px-3.5 py-1.5 bg-white text-emerald-800 text-xs font-bold rounded-lg shadow-sm";
      if (btnSingle) btnSingle.className = "px-3.5 py-1.5 bg-emerald-700/60 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg";
    } else {
      if (groupSec) groupSec.classList.add('hidden');
      if (singleSec) singleSec.classList.remove('hidden');
      if (bannerControls) bannerControls.classList.add('hidden');
      if (btnSingle) btnSingle.className = "px-3.5 py-1.5 bg-white text-emerald-800 text-xs font-bold rounded-lg shadow-sm";
      if (btnGroup) btnGroup.className = "px-3.5 py-1.5 bg-emerald-700/60 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg";
    }
  },

  render: function() {
    this.updateUnpaidBadge();
    this.switchTab(this.state.activeTab);
  },

  // ----------------- QUICK RECORD RENDER -----------------
  renderQuickRecord: function() {
    // Grade select
    const gradeSelect = document.getElementById('record-grade-select');
    if (gradeSelect) {
      const grades = this.getAvailableGrades();
      let optionsHtml = grades.map(g => {
        const sel = g === this.state.recordGrade ? 'selected' : '';
        const count = this.state.students.filter(s => s.grade === g).length;
        return `<option value="${g}" ${sel}>ชั้น ${g} (${count} คน)</option>`;
      }).join('');
      
      const otherCount = this.state.students.filter(s => !s.grade || !grades.includes(s.grade)).length;
      if (otherCount > 0) {
        optionsHtml += `<option value="other" ${this.state.recordGrade === 'other' ? 'selected' : ''}>อื่นๆ / ไม่ระบุชั้น (${otherCount} คน)</option>`;
      }
      optionsHtml += `<option value="all" ${this.state.recordGrade === 'all' ? 'selected' : ''}>ทุกระดับชั้น (ทั้งหมด ${this.state.students.length} คน)</option>`;
      
      gradeSelect.innerHTML = optionsHtml;
    }

    // Group select
    const groupSelect = document.getElementById('record-group-select');
    if (groupSelect) {
      groupSelect.innerHTML = this.state.groups.map(g => {
        const selected = g.name === this.state.recordGroup ? 'selected' : '';
        return `<option value="${g.name}" ${selected}>${g.name}</option>`;
      }).join('');
    }

    const dateInput = document.getElementById('record-date-input');
    if (dateInput) dateInput.value = this.state.recordDate;

    const singleGrp = document.getElementById('single-group');
    if (singleGrp && singleGrp.options.length <= 1) {
      this.state.groups.forEach(g => {
        singleGrp.innerHTML += `<option value="${g.name}">${g.name}</option>`;
      });
    }

    this.renderQuickRecordList();
  },

  renderQuickRecordList: function() {
    const container = document.getElementById('session-students-list');
    const countSpan = document.getElementById('session-count');
    const totalSpan = document.getElementById('session-total-amount');
    if (!container) return;

    const list = this.state.sessionStudents;
    const activeList = list.filter(s => s.present);
    const totalAmount = activeList.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

    if (countSpan) countSpan.textContent = `${activeList.length} คน (จากทั้งหมด ${list.length} คน)`;
    if (totalSpan) totalSpan.textContent = `฿${totalAmount.toLocaleString()}`;

    if (list.length === 0) {
      container.innerHTML = `
        <div class="col-span-full p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
          <p class="text-sm font-medium">ยังไม่มีนักเรียนในระดับชั้นนี้</p>
          <button onclick="App.openAddExtraStudentModal()" class="mt-2 text-xs text-emerald-600 font-semibold hover:underline">
            + คลิกเพื่อเพิ่มนักเรียนเข้าในรอบนี้
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = list.map((item, index) => {
      const isPaid = item.status === 'จ่ายแล้ว';
      const isTransfer = item.paymentMethod === 'เงินโอน';

      return `
        <div class="p-2.5 sm:p-3 rounded-xl border transition-all flex flex-col justify-between gap-2 ${
          item.present 
            ? (isPaid ? 'border-emerald-300 bg-white hover:border-emerald-400 shadow-sm' : 'border-amber-300 bg-white hover:border-amber-400 shadow-sm') 
            : 'border-slate-200 bg-white/70 hover:border-slate-300 hover:shadow-sm'
        }">
          <!-- Top: Checkbox, Name, Grade & Remove button -->
          <div>
            <div class="flex items-start justify-between gap-1.5">
              <label class="flex items-center gap-1.5 cursor-pointer select-none flex-1 min-w-0">
                <input type="checkbox" ${item.present ? 'checked' : ''} onchange="App.toggleStudentPresent(${index}, this.checked)" class="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer flex-shrink-0">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1 flex-nowrap overflow-hidden">
                    <span class="font-bold ${item.present ? 'text-slate-900' : 'text-slate-700'} text-xs sm:text-sm truncate whitespace-nowrap">${item.name}</span>
                    ${item.grade ? `<span class="px-1 py-0.2 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold whitespace-nowrap flex-shrink-0">${item.grade}</span>` : ''}
                  </div>
                  <div class="text-[10px] ${item.present ? 'text-emerald-700 font-semibold' : 'text-slate-400 font-normal'} whitespace-nowrap mt-0.5">
                    ${item.present ? '✓ มาเรียน' : 'ยังไม่เลือก'}
                  </div>
                </div>
              </label>

              <button onclick="App.removeStudentFromSession(${index})" title="นำออกจากรอบนี้" class="text-slate-300 hover:text-red-500 text-xs p-0.5 flex-shrink-0">
                ✕
              </button>
            </div>
          </div>

          <!-- Middle & Bottom: Fee + Status + Channel in a seamless adaptive row -->
          <div class="flex flex-wrap sm:flex-col items-center sm:items-stretch justify-between gap-1.5 pt-1 border-t border-slate-100 ${!item.present ? 'opacity-60' : ''}">
            
            <!-- Fee Amount Input with Step 25 -->
            <div class="flex items-center justify-between bg-slate-50 px-2 py-0.5 sm:py-1 rounded-lg border border-slate-200 text-xs flex-shrink-0">
              <span class="text-slate-500 text-[10px] sm:text-[11px] font-medium whitespace-nowrap mr-1">ค่าเรียน:</span>
              <div class="flex items-center gap-0.5 flex-shrink-0">
                <button type="button" onclick="App.adjustStudentAmount(${index}, -25)" title="ลด 25 บาท" class="w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs leading-none transition select-none flex-shrink-0">
                  -
                </button>
                <input type="number" step="25" min="0" value="${item.amount}" onchange="App.updateStudentAmount(${index}, this.value)" class="w-11 sm:w-14 px-1 py-0.5 text-xs font-bold text-center bg-white border border-slate-200 rounded text-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-500">
                <button type="button" onclick="App.adjustStudentAmount(${index}, 25)" title="เพิ่ม 25 บาท" class="w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs leading-none transition select-none flex-shrink-0">
                  +
                </button>
                <span class="text-slate-400 text-[11px] whitespace-nowrap ml-0.5">฿</span>
              </div>
            </div>

            <!-- Status & Channel Buttons -->
            <div class="flex items-center gap-1 flex-1 sm:w-full min-w-[150px]">
              <!-- Status: จ่ายแล้ว / ค้างจ่าย -->
              <div class="grid grid-cols-2 rounded-lg p-0.5 bg-slate-100 text-[10px] sm:text-[11px] text-center font-bold flex-1">
                <button onclick="App.updateStudentStatus(${index}, 'จ่ายแล้ว')" class="py-0.5 sm:py-1 rounded transition whitespace-nowrap ${isPaid ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}">
                  จ่ายแล้ว
                </button>
                <button onclick="App.updateStudentStatus(${index}, 'ค้างจ่าย')" class="py-0.5 sm:py-1 rounded transition whitespace-nowrap ${!isPaid ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}">
                  ค้างจ่าย
                </button>
              </div>

              <!-- Channel: โอน / สด (only when จ่ายแล้ว) -->
              <div class="grid grid-cols-2 rounded-lg p-0.5 bg-slate-100 text-[10px] sm:text-[11px] text-center font-bold flex-1 ${!isPaid ? 'invisible' : ''}">
                <button onclick="App.updateStudentPayment(${index}, 'เงินโอน')" class="py-0.5 sm:py-1 rounded transition whitespace-nowrap ${isTransfer ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}">
                  📱 โอน
                </button>
                <button onclick="App.updateStudentPayment(${index}, 'เงินสด')" class="py-0.5 sm:py-1 rounded transition whitespace-nowrap ${!isTransfer ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}">
                  💵 สด
                </button>
              </div>
            </div>

          </div>
        </div>
      `;
    }).join('');
  },

  toggleStudentPresent: function(index, isChecked) {
    if (this.state.sessionStudents[index]) {
      this.state.sessionStudents[index].present = isChecked;
      this.renderQuickRecordList();
    }
  },

  adjustStudentAmount: function(index, delta) {
    if (this.state.sessionStudents[index]) {
      const cur = Number(this.state.sessionStudents[index].amount) || 0;
      this.state.sessionStudents[index].amount = Math.max(0, cur + delta);
      this.state.sessionStudents[index].present = true;
      this.renderQuickRecordList();
    }
  },

  updateStudentAmount: function(index, amount) {
    if (this.state.sessionStudents[index]) {
      this.state.sessionStudents[index].amount = Math.max(0, Number(amount) || 0);
      this.renderQuickRecordList();
    }
  },

  updateStudentStatus: function(index, status) {
    if (this.state.sessionStudents[index]) {
      this.state.sessionStudents[index].status = status;
      if (status === 'ค้างจ่าย') {
        this.state.sessionStudents[index].paymentMethod = '-';
      } else if (this.state.sessionStudents[index].paymentMethod === '-') {
        this.state.sessionStudents[index].paymentMethod = 'เงินโอน';
      }
      this.state.sessionStudents[index].present = true;
      this.renderQuickRecordList();
    }
  },

  updateStudentPayment: function(index, method) {
    if (this.state.sessionStudents[index]) {
      this.state.sessionStudents[index].paymentMethod = method;
      this.renderQuickRecordList();
    }
  },

  removeStudentFromSession: function(index) {
    this.state.sessionStudents.splice(index, 1);
    this.renderQuickRecordList();
  },

  // Extra Student Modal
  openAddExtraStudentModal: function() {
    const select = document.getElementById('extra-student-select');
    if (select) {
      const existingInSession = new Set(this.state.sessionStudents.map(s => s.name));
      select.innerHTML = '<option value="">-- เลือกจากรายชื่อนักเรียนที่มีอยู่ --</option>' +
        this.state.students
          .filter(s => !existingInSession.has(s.name))
          .map(s => `<option value="${s.name}">${s.name} (${s.grade || 'ไม่ระบุชั้น'})</option>`)
          .join('');
    }
    const modal = document.getElementById('extra-student-modal');
    if (modal) modal.classList.remove('hidden');
  },

  closeAddExtraStudentModal: function() {
    const modal = document.getElementById('extra-student-modal');
    if (modal) modal.classList.add('hidden');
  },

  confirmAddExtraStudent: function() {
    const selectVal = document.getElementById('extra-student-select').value;
    const manualVal = document.getElementById('extra-student-manual').value.trim();
    const name = manualVal || selectVal;

    if (!name) {
      this.showToast('กรุณาเลือกหรือระบุชื่อนักเรียน', 'error');
      return;
    }

    const studentProfile = this.state.students.find(s => s.name === name) || {};
    this.state.sessionStudents.push({
      name: name,
      grade: studentProfile.grade || '',
      group: this.state.recordGroup,
      amount: studentProfile.defaultFee || 200,
      present: true,
      status: 'ค้างจ่าย',
      paymentMethod: '-'
    });

    this.closeAddExtraStudentModal();
    this.renderQuickRecordList();
    this.showToast(`เพิ่ม "${name}" ในรอบนี้เรียบร้อย`, 'info');
  },

  onSingleStatusChange: function(status) {
    this.state.singleStatus = status;
    const paySelect = document.getElementById('single-payment');
    if (status === 'ค้างจ่าย') {
      this.state.singlePayment = '-';
      if (paySelect) {
        paySelect.value = '-';
        paySelect.disabled = true;
      }
    } else {
      if (this.state.singlePayment === '-') {
        this.state.singlePayment = 'เงินโอน';
      }
      if (paySelect) {
        paySelect.value = this.state.singlePayment;
        paySelect.disabled = false;
      }
    }
  },

  onSingleStudentInput: function(val) {
    this.state.singleStudentName = val;
    const match = this.state.students.find(s => s.name.toLowerCase() === val.trim().toLowerCase());
    if (match) {
      this.state.singleGrade = match.grade;
      this.state.singleGroup = match.group;
      this.state.singleAmount = match.defaultFee || 200;

      const gInput = document.getElementById('single-grade');
      const grpSelect = document.getElementById('single-group');
      const feeInput = document.getElementById('single-amount');
      if (gInput) gInput.value = match.grade || '';
      if (grpSelect) grpSelect.value = match.group || '';
      if (feeInput) feeInput.value = match.defaultFee || 200;
    }
  },

  // ----------------- TRANSACTIONS RENDER -----------------
  renderTransactions: function() {
    const filtered = this.getFilteredTransactions();
    const countBadge = document.getElementById('tx-filter-count');
    const totalSumEl = document.getElementById('tx-filter-sum');
    const paidSumEl = document.getElementById('tx-filter-paid');
    const pendingSumEl = document.getElementById('tx-filter-pending');

    const totalAmount = filtered.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const paidAmount = filtered.filter(t => t.status === 'จ่ายแล้ว').reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const pendingAmount = filtered.filter(t => t.status === 'ค้างจ่าย').reduce((s, c) => s + (Number(c.amount) || 0), 0);

    if (countBadge) countBadge.textContent = `${filtered.length} / ${this.state.transactions.length} รายการ`;
    if (totalSumEl) totalSumEl.textContent = `฿${totalAmount.toLocaleString()}`;
    if (paidSumEl) paidSumEl.textContent = `฿${paidAmount.toLocaleString()}`;
    if (pendingSumEl) pendingSumEl.textContent = `฿${pendingAmount.toLocaleString()}`;

    // Update Quick Chip buttons
    ['all', 'pending', 'transfer', 'cash'].forEach(c => {
      const btn = document.getElementById('chip-' + c);
      if (btn) {
        if (this.state.filter.quickChip === c) {
          btn.classList.remove('bg-white', 'bg-slate-100', 'text-slate-700', 'border-slate-200');
          btn.classList.add('bg-emerald-600', 'text-white', 'border-emerald-600');
        } else {
          btn.classList.remove('bg-emerald-600', 'text-white', 'border-emerald-600');
          btn.classList.add('bg-white', 'text-slate-700', 'border-slate-200');
        }
      }
    });

    this.populateFilterDropdowns();

    const totalPages = Math.ceil(filtered.length / this.state.pageSize) || 1;
    if (this.state.page > totalPages) this.state.page = 1;

    const startIdx = (this.state.page - 1) * this.state.pageSize;
    const pageItems = filtered.slice(startIdx, startIdx + this.state.pageSize);

    const tbody = document.getElementById('tx-table-body');
    if (!tbody) return;

    if (pageItems.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="py-12 text-center text-slate-400">
            ไม่พบรายการที่ตรงกับตัวกรอง
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = pageItems.map((tx, idx) => {
      const isPaid = tx.status === 'จ่ายแล้ว';
      return `
        <tr class="hover:bg-slate-50 transition border-b border-slate-100 ${!isPaid ? 'bg-amber-50/30' : ''}">
          <td class="py-3 px-3 text-slate-400 font-mono text-xs">${startIdx + idx + 1}</td>
          <td class="py-3 px-3 whitespace-nowrap font-medium text-slate-700">${tx.date}</td>
          <td class="py-3 px-3 whitespace-nowrap font-bold text-slate-900">${tx.studentName}</td>
          <td class="py-3 px-3 whitespace-nowrap"><span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium">${tx.grade || '-'}</span></td>
          <td class="py-3 px-3 whitespace-nowrap text-slate-600 font-medium">${tx.group || '-'}</td>
          <td class="py-3 px-3 whitespace-nowrap text-right font-bold ${isPaid ? 'text-emerald-700' : 'text-amber-700'} text-sm">฿${(Number(tx.amount) || 0).toLocaleString()}</td>
          <td class="py-3 px-3 whitespace-nowrap text-center">
            <span class="px-2.5 py-1 rounded-full text-[11px] font-semibold ${isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
              ${tx.status}
            </span>
          </td>
          <td class="py-3 px-3 whitespace-nowrap text-slate-600">
            ${tx.paymentMethod === 'เงินโอน' ? '<span class="text-blue-600 font-medium">📱 โอนเงิน</span>' : (tx.paymentMethod === 'เงินสด' ? '<span class="text-slate-700 font-medium">💵 เงินสด</span>' : '<span class="text-slate-400">-</span>')}
          </td>
          <td class="py-3 px-3 whitespace-nowrap text-center">
            <div class="flex items-center justify-center gap-1.5">
              ${!isPaid ? `
                <button onclick="App.openPaymentMethodModal('${tx.id}')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[11px] font-bold shadow-sm transition">
                  ✓ เปลี่ยนเป็นจ่ายแล้ว
                </button>
              ` : ''}
              <button onclick="App.openEditModal('${tx.id}')" class="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded transition" title="แก้ไข">
                ✏️
              </button>
              <button onclick="App.deleteTransaction('${tx.id}')" class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-slate-100 rounded transition" title="ลบ">
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    const pageControls = document.getElementById('tx-pagination');
    if (pageControls) {
      pageControls.innerHTML = `
        <div class="flex items-center justify-between text-xs text-slate-600 py-3">
          <span>แสดง ${startIdx + 1} - ${Math.min(startIdx + this.state.pageSize, filtered.length)} จาก ${filtered.length} รายการ</span>
          <div class="flex items-center gap-2">
            <button onclick="App.changePage(${this.state.page - 1})" ${this.state.page <= 1 ? 'disabled class="px-3 py-1 rounded border border-slate-200 text-slate-300 cursor-not-allowed"' : 'class="px-3 py-1 rounded border border-slate-300 hover:bg-slate-100"'}>
              &larr; ก่อนหน้า
            </button>
            <span class="font-bold text-slate-800">หน้า ${this.state.page} / ${totalPages}</span>
            <button onclick="App.changePage(${this.state.page + 1})" ${this.state.page >= totalPages ? 'disabled class="px-3 py-1 rounded border border-slate-200 text-slate-300 cursor-not-allowed"' : 'class="px-3 py-1 rounded border border-slate-300 hover:bg-slate-100"'}>
              ถัดไป &rarr;
            </button>
          </div>
        </div>
      `;
    }
  },

  changePage: function(newPage) {
    this.state.page = newPage;
    this.renderTransactions();
  },

  populateFilterDropdowns: function() {
    const yearSelect = document.getElementById('filter-year');
    if (yearSelect) {
      const years = Array.from(new Set(this.state.transactions.map(t => t.year || (t.date ? t.date.split('-')[0] : '')).filter(Boolean))).sort().reverse();
      if (!years.includes('2026')) years.unshift('2026');
      if (!years.includes('2025')) years.push('2025');
      const curVal = this.state.filter.year || 'all';
      
      const optionsHtml = `<option value="all">ทุกปี</option>` + years.map(y => `<option value="${y}">ปี ${y}</option>`).join('');
      if (yearSelect.innerHTML !== optionsHtml) {
        yearSelect.innerHTML = optionsHtml;
      }
      yearSelect.value = curVal;
    }

    const monthSelect = document.getElementById('filter-month');
    if (monthSelect) {
      monthSelect.value = this.state.filter.month || 'all';
    }

    const groupSelect = document.getElementById('filter-group');
    if (groupSelect && groupSelect.options.length <= 1) {
      this.state.groups.forEach(g => {
        groupSelect.innerHTML += `<option value="${g.name}">${g.name}</option>`;
      });
      groupSelect.value = this.state.filter.group || 'all';
    }
  },

  // ----------------- 📅 CALENDAR VIEW RENDER -----------------
  renderCalendar: function() {
    const monthsFull = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const curYear = this.state.calendarYear;
    const curMonth = this.state.calendarMonth;

    const titleEl = document.getElementById('calendar-month-title');
    if (titleEl) {
      titleEl.textContent = `${monthsFull[curMonth]} ${curYear}`;
    }

    // Days in month
    const firstDayIndex = new Date(curYear, curMonth, 1).getDay(); // 0 = Sun
    const daysInMonth = new Date(curYear, curMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(curYear, curMonth, 0).getDate();

    const grid = document.getElementById('calendar-days-grid');
    if (!grid) return;

    // Aggregate transactions by date string YYYY-MM-DD
    const txByDate = {};
    this.state.transactions.forEach(t => {
      if (t.date) {
        if (!txByDate[t.date]) {
          txByDate[t.date] = { count: 0, sum: 0, pendingCount: 0, groups: new Set(), students: [] };
        }
        txByDate[t.date].count++;
        txByDate[t.date].sum += (Number(t.amount) || 0);
        if (t.status === 'ค้างจ่าย') txByDate[t.date].pendingCount++;
        if (t.group) txByDate[t.date].groups.add(t.group);
        txByDate[t.date].students.push(t);
      }
    });

    let cellsHtml = '';

    // Prev month padding days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      cellsHtml += `
        <div class="min-h-[56px] sm:min-h-[64px] lg:min-h-[68px] p-1.5 bg-slate-50/50 border border-slate-100 rounded-xl text-slate-300 select-none">
          <span class="text-xs font-medium">${dayNum}</span>
        </div>
      `;
    }

    // Current month days
    const todayStr = new Date().toISOString().split('T')[0];

    for (let d = 1; d <= daysInMonth; d++) {
      const monthStr = String(curMonth + 1).padStart(2, '0');
      const dayStr = String(d).padStart(2, '0');
      const dateKey = `${curYear}-${monthStr}-${dayStr}`;

      const dayData = txByDate[dateKey];
      const isToday = dateKey === todayStr;

      let badgeContent = '';
      if (dayData) {
        const hasPending = dayData.pendingCount > 0;
        const groupsArr = Array.from(dayData.groups);
        badgeContent = `
          <div class="mt-0.5 space-y-0.5">
            <div class="flex items-center justify-between text-[10px] sm:text-[11px] font-bold ${hasPending ? 'text-amber-700 bg-amber-50' : 'text-emerald-700 bg-emerald-50'} px-1 py-0.2 rounded border ${hasPending ? 'border-amber-200' : 'border-emerald-200'} whitespace-nowrap">
              <span>฿${dayData.sum.toLocaleString()}</span>
              <span class="text-[9px] sm:text-[10px]">${dayData.count} คน</span>
            </div>
            ${groupsArr.slice(0, 1).map(g => `<div class="text-[9px] sm:text-[10px] text-slate-500 truncate px-0.5 font-medium whitespace-nowrap">${g}</div>`).join('')}
            ${hasPending ? `<div class="text-[9px] sm:text-[10px] font-bold text-amber-600 truncate whitespace-nowrap">⚠️ ค้าง ${dayData.pendingCount}</div>` : ''}
          </div>
        `;
      }

      cellsHtml += `
        <div onclick="App.openDayDetailModal('${dateKey}')" class="min-h-[56px] sm:min-h-[64px] lg:min-h-[68px] p-1.5 bg-white hover:bg-slate-50 border ${isToday ? 'border-emerald-500 shadow-sm' : 'border-slate-200'} rounded-xl cursor-pointer transition flex flex-col justify-between group hover:border-emerald-400">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold ${isToday ? 'w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[11px]' : 'text-slate-800'}">${d}</span>
            ${dayData ? '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"></span>' : ''}
          </div>
          <div class="flex-1">${badgeContent}</div>
        </div>
      `;
    }

    grid.innerHTML = cellsHtml;
  },

  changeCalendarMonth: function(offset) {
    let newMonth = this.state.calendarMonth + offset;
    let newYear = this.state.calendarYear;

    if (newMonth < 0) {
      newMonth = 11;
      newYear--;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear++;
    }

    this.state.calendarMonth = newMonth;
    this.state.calendarYear = newYear;
    this.renderCalendar();
  },

  setCalendarToday: function() {
    const now = new Date();
    this.state.calendarYear = now.getFullYear();
    this.state.calendarMonth = now.getMonth();
    this.renderCalendar();
  },

  openDayDetailModal: function(dateStr) {
    this.state.selectedCalendarDate = dateStr;
    const dayTx = this.state.transactions.filter(t => t.date === dateStr);
    
    document.getElementById('day-modal-date').textContent = `วันที่ ${dateStr} (${getThaiMonth(dateStr)})`;
    const sum = dayTx.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const paidSum = dayTx.filter(t => t.status === 'จ่ายแล้ว').reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const pendingSum = dayTx.filter(t => t.status === 'ค้างจ่าย').reduce((s, c) => s + (Number(c.amount) || 0), 0);

    document.getElementById('day-modal-summary').innerHTML = `
      <span>ทั้งหมด: <strong>${dayTx.length} คน</strong></span> · 
      <span>ยอดรวม: <strong class="text-emerald-700">฿${sum.toLocaleString()}</strong></span> · 
      <span>จ่ายแล้ว: <strong class="text-blue-700">฿${paidSum.toLocaleString()}</strong></span>
      ${pendingSum > 0 ? ` · <span>ค้าง: <strong class="text-amber-700">฿${pendingSum.toLocaleString()}</strong></span>` : ''}
    `;

    const listContainer = document.getElementById('day-modal-list');
    if (dayTx.length === 0) {
      listContainer.innerHTML = `
        <div class="p-6 text-center text-slate-400 text-xs">
          ยังไม่มีการบันทึกการสอนในวันที่นี้
        </div>
      `;
    } else {
      listContainer.innerHTML = dayTx.map(t => {
        const isPaid = t.status === 'จ่ายแล้ว';
        return `
          <div class="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between text-xs">
            <div>
              <div class="font-bold text-slate-900 text-sm">${t.studentName} <span class="text-[11px] font-medium text-slate-500">(${t.grade || '-'})</span></div>
              <div class="text-[11px] text-slate-400 mt-0.5">กลุ่ม: ${t.group || '-'} · ช่องทาง: ${t.paymentMethod}</div>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-bold text-sm ${isPaid ? 'text-emerald-700' : 'text-amber-700'}">฿${(Number(t.amount) || 0).toLocaleString()}</span>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${t.status}</span>
              ${!isPaid ? `
                <button onclick="App.closeDayDetailModal(); App.openPaymentMethodModal('${t.id}')" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold">
                  ✓ รับชำระ
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');
    }

    const modal = document.getElementById('day-detail-modal');
    if (modal) modal.classList.remove('hidden');
  },

  closeDayDetailModal: function() {
    this.state.selectedCalendarDate = null;
    const modal = document.getElementById('day-detail-modal');
    if (modal) modal.classList.add('hidden');
  },

  jumpToQuickRecordForDate: function() {
    if (this.state.selectedCalendarDate) {
      this.state.recordDate = this.state.selectedCalendarDate;
      this.closeDayDetailModal();
      this.switchTab('quick-record');
      this.showToast(`เลือกวันที่ ${this.state.recordDate} ในหน้าเช็คชื่อเรียบร้อย`, 'info');
    }
  },

  // ----------------- DASHBOARD RENDER -----------------
  renderDashboard: function() {
    const txList = this.state.transactions;
    const totalIncome = txList.filter(t => t.status === 'จ่ายแล้ว').reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const totalPendingAmount = txList.filter(t => t.status === 'ค้างจ่าย').reduce((s, c) => s + (Number(c.amount) || 0), 0);

    // Populate Year select if needed
    const yearSelect = document.getElementById('dash-year-select');
    if (yearSelect) {
      const years = Array.from(new Set(txList.map(t => t.year || (t.date ? t.date.split('-')[0] : '')).filter(Boolean))).sort().reverse();
      if (!years.includes('2026')) years.unshift('2026');
      if (yearSelect.options.length <= 2) {
        yearSelect.innerHTML = years.map(y => `<option value="${y}" ${y === this.state.dashSelectedYear ? 'selected' : ''}>ปี ${y}</option>`).join('');
      } else {
        yearSelect.value = this.state.dashSelectedYear;
      }
    }

    const monthSelect = document.getElementById('dash-month-select');
    if (monthSelect) {
      monthSelect.value = this.state.dashSelectedMonth;
    }

    const selYear = this.state.dashSelectedYear;
    const selMonth = this.state.dashSelectedMonth;

    // Filter transactions for the selected month/year
    const periodTx = txList.filter(t => {
      const matchYear = !selYear || selYear === 'all' || t.year === selYear || (t.date && t.date.startsWith(selYear));
      const matchMonth = !selMonth || selMonth === 'all' || t.month === selMonth;
      return matchYear && matchMonth;
    });

    const periodPaidTx = periodTx.filter(t => t.status === 'จ่ายแล้ว');
    const monthPaidIncome = periodPaidTx.reduce((s, c) => s + (Number(c.amount) || 0), 0);

    const monthTransferTx = periodPaidTx.filter(t => t.paymentMethod === 'เงินโอน');
    const monthCashTx = periodPaidTx.filter(t => t.paymentMethod === 'เงินสด');

    const monthTransferTotal = monthTransferTx.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const monthCashTotal = monthCashTx.reduce((s, c) => s + (Number(c.amount) || 0), 0);

    const monthPendingTx = periodTx.filter(t => t.status === 'ค้างจ่าย');
    const monthPendingAmount = monthPendingTx.reduce((s, c) => s + (Number(c.amount) || 0), 0);

    // ยอดรวมทั้งหมดจริง ๆ (รวมยอดจ่ายแล้ว + ยอดค้างจ่าย)
    const monthTotalRevenue = periodTx.reduce((s, c) => s + (Number(c.amount) || 0), 0);

    const transferPct = monthPaidIncome > 0 ? Math.round((monthTransferTotal / monthPaidIncome) * 100) : 0;
    const cashPct = monthPaidIncome > 0 ? Math.round((monthCashTotal / monthPaidIncome) * 100) : 0;

    const periodLabel = selMonth === 'all' ? `ทั้งปี ${selYear}` : `เดือน${selMonth} ${selYear}`;

    // Update Card Titles & Values
    const card2Title = document.getElementById('dash-card2-title');
    const card3Title = document.getElementById('dash-card3-title');
    const card4Title = document.getElementById('dash-card4-title');
    const card5Title = document.getElementById('dash-card5-title');

    if (card2Title) card2Title.textContent = `รายรับรวม (${periodLabel})`;
    if (card3Title) card3Title.textContent = `เงินโอน (${periodLabel})`;
    if (card4Title) card4Title.textContent = `เงินสด (${periodLabel})`;
    if (card5Title) card5Title.textContent = `ยอดค้างจ่าย (${periodLabel})`;

    const totalIncomeEl = document.getElementById('dash-total-income');
    const curMonthEl = document.getElementById('dash-month-income');
    const monthNameEl = document.getElementById('dash-month-name');
    const pendingEl = document.getElementById('dash-pending-amount');
    const pendingCountEl = document.getElementById('dash-pending-count');
    const pendingSubtextEl = document.getElementById('dash-pending-subtext');

    if (totalIncomeEl) totalIncomeEl.textContent = `฿${totalIncome.toLocaleString()}`;
    if (curMonthEl) curMonthEl.textContent = `฿${monthTotalRevenue.toLocaleString()}`;
    if (monthNameEl) {
      if (monthPendingAmount > 0) {
        monthNameEl.innerHTML = `<span class="text-emerald-700 font-semibold">รับแล้ว ฿${monthPaidIncome.toLocaleString()}</span> · <span class="text-amber-700 font-semibold">ค้าง ฿${monthPendingAmount.toLocaleString()}</span>`;
      } else {
        monthNameEl.textContent = `ยอดรวมทั้งหมด ${periodLabel} (ชำระครบ 100%)`;
      }
    }
    if (pendingEl) pendingEl.textContent = `฿${monthPendingAmount.toLocaleString()}`;
    if (pendingCountEl) pendingCountEl.textContent = `${monthPendingTx.length} รายการ`;
    if (pendingSubtextEl) pendingSubtextEl.innerHTML = `ค้างใน${periodLabel} <span class="text-slate-400 font-normal">(รวมทุกเดือน ฿${totalPendingAmount.toLocaleString()})</span>`;

    // Top Metric Cards for Transfer & Cash
    const monthTransferEl = document.getElementById('dash-month-transfer');
    const monthTransferCountEl = document.getElementById('dash-month-transfer-count');
    const monthCashEl = document.getElementById('dash-month-cash');
    const monthCashCountEl = document.getElementById('dash-month-cash-count');

    if (monthTransferEl) monthTransferEl.textContent = `฿${monthTransferTotal.toLocaleString()}`;
    if (monthTransferCountEl) monthTransferCountEl.textContent = `${monthTransferTx.length} รายการ`;
    if (monthCashEl) monthCashEl.textContent = `฿${monthCashTotal.toLocaleString()}`;
    if (monthCashCountEl) monthCashCountEl.textContent = `${monthCashTx.length} รายการ`;

    // Right Breakdown Panel (ยอดค้างจ่าย แยกตามรายคน)
    const panelTitle = document.getElementById('dash-panel-title');
    const panelMonthNameEl = document.getElementById('dash-panel-month-name');
    const panelMonthTotalEl = document.getElementById('dash-panel-month-total');
    const panelStudentCountEl = document.getElementById('dash-panel-student-count');
    const studentListContainer = document.getElementById('dash-student-breakdown-list');

    // Group monthPendingTx by student
    const studentUnpaidMap = {};
    monthPendingTx.forEach(t => {
      const name = t.studentName ? t.studentName.trim() : 'ไม่ระบุชื่อ';
      if (!studentUnpaidMap[name]) {
        const stRecord = this.state.students.find(s => s.name && s.name.trim() === name);
        studentUnpaidMap[name] = {
          name: name,
          grade: (stRecord && stRecord.grade) || t.grade || '-',
          count: 0,
          totalAmount: 0,
          groups: new Set()
        };
      }
      studentUnpaidMap[name].count += 1;
      studentUnpaidMap[name].totalAmount += (Number(t.amount) || 0);
      if (t.group) studentUnpaidMap[name].groups.add(t.group);
    });

    const studentUnpaidList = Object.values(studentUnpaidMap).sort((a, b) => b.totalAmount - a.totalAmount);

    if (panelTitle) panelTitle.textContent = `ยอดค้างจ่าย (${periodLabel})`;
    if (panelMonthNameEl) panelMonthNameEl.textContent = `แยกตามรายคน (${studentUnpaidList.length} คน)`;
    if (panelMonthTotalEl) panelMonthTotalEl.textContent = `฿${monthPendingAmount.toLocaleString()}`;
    if (panelStudentCountEl) panelStudentCountEl.textContent = `${studentUnpaidList.length} คน • ${monthPendingTx.length} คาบ`;

    if (studentListContainer) {
      if (studentUnpaidList.length === 0) {
        studentListContainer.innerHTML = `
          <div class="py-12 text-center text-slate-400 text-xs">
            <div class="text-2xl mb-1.5">🎉</div>
            <div class="font-bold text-slate-700">ไม่มีรายการค้างจ่ายใน${periodLabel}</div>
            <div class="text-[11px] text-slate-400 mt-0.5">นักเรียนทุกคนชำระครบถ้วนแล้ว</div>
          </div>
        `;
      } else {
        studentListContainer.innerHTML = studentUnpaidList.map((st, idx) => {
          const safeName = encodeURIComponent(st.name);
          const groupsStr = Array.from(st.groups).join(', ');
          return `
            <div class="py-2.5 px-2 hover:bg-amber-50/40 rounded-xl transition flex items-center justify-between gap-2.5 text-xs">
              <div class="flex items-center gap-2.5 min-w-0">
                <span class="w-5 h-5 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                  ${idx + 1}
                </span>
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5">
                    <span class="font-bold text-slate-900 truncate">${st.name}</span>
                    <span class="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 text-[10px] font-bold flex-shrink-0">${st.grade}</span>
                  </div>
                  <div class="text-[10px] text-amber-700 font-medium flex items-center gap-1.5 mt-0.5 truncate">
                    <span>⚠️ ค้าง ${st.count} คาบ</span>
                    ${groupsStr ? `<span class="text-slate-300">•</span><span class="text-slate-400 font-normal truncate">${groupsStr}</span>` : ''}
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-2 flex-shrink-0">
                <div class="text-right">
                  <div class="font-black text-red-600 text-xs">฿${st.totalAmount.toLocaleString()}</div>
                </div>
                <button type="button" onclick="App.openSlipModal(decodeURIComponent('${safeName}'))" class="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs transition shadow-xs" title="สร้างสลิปทวงยอด">
                  📸
                </button>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    this.renderCharts();
  },

  setDashboardMonth: function(monthVal) {
    this.state.dashSelectedMonth = monthVal;
    this.renderDashboard();
  },

  setDashboardYear: function(yearVal) {
    this.state.dashSelectedYear = yearVal;
    this.renderDashboard();
  },

  resetDashboardToCurrent: function() {
    const now = new Date();
    this.state.dashSelectedYear = String(now.getFullYear());
    this.state.dashSelectedMonth = getThaiMonth(now.toISOString().split('T')[0]);
    this.renderDashboard();
    this.showToast(`เปลี่ยนกลับเป็นเดือนปัจจุบัน (${this.state.dashSelectedMonth} ${this.state.dashSelectedYear})`, 'info');
  },

  prevDashboardMonth: function() {
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    let curIdx = months.indexOf(this.state.dashSelectedMonth);
    let curYr = parseInt(this.state.dashSelectedYear, 10) || 2026;
    if (curIdx === -1 || curIdx === 0) {
      curIdx = 11;
      curYr -= 1;
    } else {
      curIdx -= 1;
    }
    this.state.dashSelectedMonth = months[curIdx];
    this.state.dashSelectedYear = String(curYr);
    this.renderDashboard();
  },

  nextDashboardMonth: function() {
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    let curIdx = months.indexOf(this.state.dashSelectedMonth);
    let curYr = parseInt(this.state.dashSelectedYear, 10) || 2026;
    if (curIdx === -1 || curIdx === 11) {
      curIdx = 0;
      curYr += 1;
    } else {
      curIdx += 1;
    }
    this.state.dashSelectedMonth = months[curIdx];
    this.state.dashSelectedYear = String(curYr);
    this.renderDashboard();
  },

  viewDashboardPendingTransactions: function() {
    this.state.filter.status = 'ค้างจ่าย';
    this.state.filter.year = this.state.dashSelectedYear;
    this.state.filter.month = this.state.dashSelectedMonth === 'all' ? 'all' : this.state.dashSelectedMonth;
    this.state.filter.quickChip = 'all';
    this.state.page = 1;
    this.switchTab('transactions');
  },

  renderCharts: function() {
    if (typeof Chart === 'undefined') return;

    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const txList = this.state.transactions.filter(t => t.status === 'จ่ายแล้ว');

    const monthly2025 = new Array(12).fill(0);
    const monthly2026 = new Array(12).fill(0);

    txList.forEach(t => {
      const amt = Number(t.amount) || 0;
      const mIdx = months.indexOf(t.month);
      if (mIdx !== -1) {
        if (t.year === '2025' || (t.date && t.date.startsWith('2025'))) {
          monthly2025[mIdx] += amt;
        } else if (t.year === '2026' || (t.date && t.date.startsWith('2026'))) {
          monthly2026[mIdx] += amt;
        }
      }
    });

    const canvasTrend = document.getElementById('chart-monthly-trend');
    if (canvasTrend) {
      if (this.charts.trend) this.charts.trend.destroy();
      const isDark = document.documentElement.classList.contains('dark');
      const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
      const textColor = isDark ? '#a1a1aa' : '#64748b';

      this.charts.trend = new Chart(canvasTrend, {
        type: 'bar',
        data: {
          labels: months,
          datasets: [
            {
              label: 'ปี 2025',
              data: monthly2025,
              backgroundColor: isDark ? '#27272a' : '#cbd5e1',
              borderRadius: 4
            },
            {
              label: 'ปี 2026',
              data: monthly2026,
              backgroundColor: '#10b981',
              borderRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: {
                color: isDark ? '#e4e4e7' : '#334155',
                font: { family: "'Prompt', sans-serif" }
              }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ฿${ctx.raw.toLocaleString()}`
              }
            }
          },
          scales: {
            x: {
              grid: { color: gridColor },
              ticks: {
                color: textColor,
                font: { family: "'Prompt', sans-serif" }
              }
            },
            y: {
              beginAtZero: true,
              grid: { color: gridColor },
              ticks: {
                color: textColor,
                font: { family: "'Prompt', sans-serif" },
                callback: (val) => '฿' + (val >= 1000 ? (val/1000) + 'k' : val)
              }
            }
          }
        }
      });
    }
  },

  // ----------------- ⚠️ UNPAID TRACKER & SLIP GENERATOR -----------------
  updateUnpaidBadge: function() {
    const pending = this.state.transactions.filter(t => t.status === 'ค้างจ่าย');
    const badge = document.getElementById('nav-unpaid-badge');
    const mBadge = document.getElementById('m-nav-unpaid-badge');
    const studentCount = pending.length > 0 ? new Set(pending.map(t => t.studentName ? t.studentName.trim() : '')).size : 0;

    if (badge) {
      if (studentCount > 0) {
        badge.textContent = `${studentCount} คน`;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
    if (mBadge) {
      if (studentCount > 0) {
        mBadge.textContent = `${studentCount}`;
        mBadge.classList.remove('hidden');
      } else {
        mBadge.classList.add('hidden');
      }
    }
  },

  onUnpaidSearch: function(val) {
    this.state.unpaidSearch = val;
    this.renderUnpaidTracker();
  },

  onUnpaidSort: function(val) {
    this.state.unpaidSort = val;
    this.renderUnpaidTracker();
  },

  setUnpaidGradeFilter: function(grade) {
    this.state.unpaidGradeFilter = grade;
    this.renderUnpaidTracker();
  },

  getUnpaidStudentsData: function() {
    const pendingTxs = this.state.transactions.filter(t => t.status === 'ค้างจ่าย');
    const studentMap = {};

    pendingTxs.forEach(t => {
      const name = t.studentName ? t.studentName.trim() : 'ไม่ระบุชื่อ';
      if (!studentMap[name]) {
        const stRecord = this.state.students.find(s => s.name && s.name.trim() === name);
        studentMap[name] = {
          name: name,
          grade: (stRecord && stRecord.grade) || t.grade || '-',
          group: (stRecord && stRecord.group) || t.group || '-',
          transactions: [],
          totalAmount: 0
        };
      }
      studentMap[name].transactions.push(t);
      studentMap[name].totalAmount += (Number(t.amount) || 0);
    });

    Object.values(studentMap).forEach(s => {
      s.transactions.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    });

    return {
      pendingTxs,
      studentList: Object.values(studentMap)
    };
  },

  renderUnpaidTracker: function() {
    this.updateUnpaidBadge();
    const { pendingTxs, studentList } = this.getUnpaidStudentsData();

    // Update Stats
    const statStudentsEl = document.getElementById('unpaid-stat-students');
    const statSessionsEl = document.getElementById('unpaid-stat-sessions');
    const statAmountEl = document.getElementById('unpaid-stat-amount');

    const totalUnpaidSum = pendingTxs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    if (statStudentsEl) statStudentsEl.textContent = `${studentList.length} คน`;
    if (statSessionsEl) statSessionsEl.textContent = `${pendingTxs.length} รายการ`;
    if (statAmountEl) statAmountEl.textContent = `฿${totalUnpaidSum.toLocaleString()}`;

    // Render Grade Filter Chips
    const gradesSet = new Set();
    studentList.forEach(s => { if (s.grade && s.grade !== '-') gradesSet.add(s.grade); });
    const order = ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6', 'ป.6'];
    const sortedGrades = Array.from(gradesSet).sort((a, b) => {
      const idxA = order.indexOf(a);
      const idxB = order.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b, 'th');
    });

    const gradeChipsContainer = document.getElementById('unpaid-grade-chips');
    if (gradeChipsContainer) {
      const currentGrade = this.state.unpaidGradeFilter || 'all';
      const allGrades = ['all', ...sortedGrades];
      gradeChipsContainer.innerHTML = allGrades.map(g => {
        const isSelected = g === currentGrade;
        const label = g === 'all' ? 'ทั้งหมด' : g;
        return `
          <button type="button" onclick="App.setUnpaidGradeFilter('${g}')" class="px-3 py-1 rounded-full text-xs font-semibold transition ${isSelected ? 'bg-amber-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}">
            ${label}
          </button>
        `;
      }).join('');
    }

    // Filter by search & grade
    let filtered = studentList.filter(s => {
      if (this.state.unpaidGradeFilter !== 'all' && s.grade !== this.state.unpaidGradeFilter) {
        return false;
      }
      if (this.state.unpaidSearch) {
        const q = this.state.unpaidSearch.toLowerCase().trim();
        const matchesName = s.name.toLowerCase().includes(q);
        const matchesGrade = s.grade.toLowerCase().includes(q);
        return matchesName || matchesGrade;
      }
      return true;
    });

    // Sort students
    const sortMode = this.state.unpaidSort || 'amount-desc';
    if (sortMode === 'amount-desc') {
      filtered.sort((a, b) => b.totalAmount - a.totalAmount);
    } else if (sortMode === 'amount-asc') {
      filtered.sort((a, b) => a.totalAmount - b.totalAmount);
    } else if (sortMode === 'count-desc') {
      filtered.sort((a, b) => b.transactions.length - a.transactions.length);
    } else if (sortMode === 'name-asc') {
      filtered.sort((a, b) => a.name.localeCompare(b.name, 'th'));
    }

    // Render Student Cards Grid
    const gridEl = document.getElementById('unpaid-students-grid');
    if (!gridEl) return;

    if (filtered.length === 0) {
      if (studentList.length === 0) {
        gridEl.innerHTML = `
          <div class="col-span-full py-16 text-center bg-white rounded-2xl border border-slate-200">
            <div class="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-3xl mb-3 shadow-inner">🎉</div>
            <h4 class="text-base font-bold text-slate-800">ไม่มีรายการค้างชำระ</h4>
            <p class="text-xs text-slate-500 mt-1">ยอดเยี่ยมมาก! นักเรียนทุกคนชำระค่าเรียนครบถ้วนเรียบร้อยแล้ว</p>
          </div>
        `;
      } else {
        gridEl.innerHTML = `
          <div class="col-span-full py-12 text-center bg-white rounded-2xl border border-slate-200">
            <div class="text-3xl mb-2 text-slate-400">🔍</div>
            <h4 class="text-sm font-bold text-slate-700">ไม่พบนักเรียนตามเงื่อนไขที่ค้นหา</h4>
            <p class="text-xs text-slate-400 mt-1">ลองเปลี่ยนคำค้นหาหรือตัวกรองระดับชั้น</p>
          </div>
        `;
      }
      return;
    }

    gridEl.innerHTML = filtered.map(st => {
      const safeName = encodeURIComponent(st.name);
      const sessionsCount = st.transactions.length;
      const previewSessions = st.transactions.slice(0, 3);
      const remainingCount = sessionsCount - previewSessions.length;

      return `
        <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition space-y-3.5 flex flex-col justify-between">
          <div>
            <div class="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="font-bold text-slate-900 text-base leading-snug">${st.name}</h3>
                  <span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-bold">${st.grade}</span>
                </div>
                <div class="text-[11px] text-amber-700 font-semibold mt-0.5 flex items-center gap-1">
                  <span>⚠️ ค้าง ${sessionsCount} คาบ</span>
                  <span class="text-slate-300">•</span>
                  <span class="text-slate-500 font-normal">กลุ่ม: ${st.group}</span>
                </div>
              </div>

              <div class="text-right">
                <div class="text-[10px] text-slate-400 font-medium">ยอดค้างรวม</div>
                <div class="text-lg font-black text-red-600">฿${st.totalAmount.toLocaleString()}</div>
              </div>
            </div>

            <div class="space-y-1.5 pt-2 text-xs">
              ${previewSessions.map(tx => `
                <div class="flex items-center justify-between py-1 px-2.5 rounded-lg bg-slate-50 border border-slate-100 text-[11px]">
                  <div class="flex items-center gap-2">
                    <span class="text-slate-500 font-mono">${tx.date}</span>
                    <span class="text-slate-700 font-medium">${tx.group || '-'}</span>
                  </div>
                  <span class="font-bold text-slate-800">฿${(Number(tx.amount) || 0).toLocaleString()}</span>
                </div>
              `).join('')}

              ${remainingCount > 0 ? `
                <div class="text-center text-[10px] text-slate-400 py-0.5 font-medium">
                  + อีก ${remainingCount} รายการ
                </div>
              ` : ''}
            </div>
          </div>

          <div class="pt-2 border-t border-slate-100 space-y-2">
            <button type="button" onclick="App.openSlipModal(decodeURIComponent('${safeName}'))" class="w-full py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold rounded-xl shadow-sm shadow-emerald-200 transition flex items-center justify-center gap-1.5">
              <span>📸</span> สร้างรูปภาพทวงยอด
            </button>

            <div class="grid grid-cols-2 gap-1.5 text-[11px]">
              <button type="button" onclick="App.copySlipText(decodeURIComponent('${safeName}'))" class="py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition flex items-center justify-center gap-1">
                <span>💬</span> ส่ง LINE
              </button>
              <button type="button" onclick="App.markAllPaidForStudent(decodeURIComponent('${safeName}'))" class="py-1.5 px-2 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold rounded-lg border border-amber-200 transition flex items-center justify-center gap-1">
                <span>✓</span> ปิดยอด
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  openSlipModal: function(studentName) {
    this.state.currentSlipStudentName = studentName;
    const { studentList } = this.getUnpaidStudentsData();
    const st = studentList.find(s => s.name === studentName);
    if (!st) {
      this.showToast('ไม่พบข้อมูลรายการค้างจ่ายของนักเรียน', 'error');
      return;
    }

    this.state.currentSlipBlob = null;
    this.state.currentSlipFile = null;
    this.state.currentSlipDataUrl = null;

    this.generateSlipCanvas(st);
    const modal = document.getElementById('slip-modal');
    if (modal) modal.classList.remove('hidden');
  },

  closeSlipModal: function() {
    const modal = document.getElementById('slip-modal');
    if (modal) modal.classList.add('hidden');
    this.state.currentSlipStudentName = null;
  },

  generateSlipCanvas: function(st) {
    const canvas = document.getElementById('slip-canvas');
    if (!canvas) return;

    const txs = st.transactions || [];
    const scale = 2; // Retina sharpness

    const width = 450;
    const paddingX = 16;
    const innerWidth = width - (paddingX * 2); // 418
    const rowHeight = 28;
    const tableHeight = 32 + (txs.length * rowHeight);
    const height = 115 + 85 + tableHeight + 64 + 48 + 15;

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

    // 1. Base card background
    roundRect(0, 0, width, height, 16, true, true, '#cbd5e1', '#ffffff');

    // 2. Header Banner with Emerald Gradient
    const headerGrad = ctx.createLinearGradient(0, 0, width, 110);
    headerGrad.addColorStop(0, '#065f46');
    headerGrad.addColorStop(1, '#0f766e');

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(width - 16, 0);
    ctx.quadraticCurveTo(width, 0, width, 16);
    ctx.lineTo(width, 105);
    ctx.lineTo(0, 105);
    ctx.lineTo(0, 16);
    ctx.quadraticCurveTo(0, 0, 16, 0);
    ctx.closePath();
    ctx.fillStyle = headerGrad;
    ctx.fill();
    ctx.restore();

    // Header Logo Icon
    roundRect(20, 20, 42, 42, 10, true, false, null, '#ffffff');
    ctx.fillStyle = '#059669';
    ctx.font = 'bold 18px "Prompt", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('M+', 41, 41);

    // Header Titles
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#a7f3d0';
    ctx.font = '500 11px "Prompt", sans-serif';
    ctx.fillText('MONEY PLUS ACADEMY', 72, 33);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px "Prompt", sans-serif';
    ctx.fillText('ใบแจ้งยอดค้างชำระค่าเรียน', 72, 56);

    const now = new Date();
    const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const dateStr = `วันที่ออกเอกสาร: ${now.getDate()} ${thaiMonths[now.getMonth()]} ${now.getFullYear() + 543}`;
    ctx.fillStyle = '#d1fae5';
    ctx.font = '400 11px "Prompt", sans-serif';
    ctx.fillText(dateStr, 72, 74);

    let curY = 120;

    // 3. Student Information Card
    roundRect(paddingX, curY, innerWidth, 72, 12, true, true, '#e2e8f0', '#f8fafc');

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 16px "Prompt", sans-serif';
    ctx.fillText(`นักเรียน: ${st.name}`, paddingX + 14, curY + 28);

    // Grade Tag
    const gradeTagW = 74;
    const gradeTagX = width - paddingX - 12 - gradeTagW;
    roundRect(gradeTagX, curY + 12, gradeTagW, 22, 6, true, true, '#bbf7d0', '#f0fdf4');
    ctx.fillStyle = '#166534';
    ctx.font = 'bold 11px "Prompt", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`ชั้น: ${st.grade || '-'}`, gradeTagX + (gradeTagW / 2), curY + 27);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748b';
    ctx.font = '400 12px "Prompt", sans-serif';
    ctx.fillText(`กลุ่มเรียน: ${st.group || '-'}`, paddingX + 14, curY + 52);

    ctx.fillStyle = '#b45309';
    ctx.font = 'bold 12px "Prompt", sans-serif';
    ctx.fillText(`⚠️ ค้างชำระ: ${txs.length} คาบ`, paddingX + 155, curY + 52);

    curY += 84;

    // 4. Breakdown Table
    // Table Header
    roundRect(paddingX, curY, innerWidth, 26, 6, true, false, null, '#f1f5f9');
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 11px "Prompt", sans-serif';
    ctx.fillText('#', paddingX + 12, curY + 17);
    ctx.fillText('วันที่เรียน', paddingX + 38, curY + 17);
    ctx.fillText('รอบ / กลุ่ม', paddingX + 155, curY + 17);
    ctx.textAlign = 'right';
    ctx.fillText('จำนวนเงิน', width - paddingX - 14, curY + 17);
    ctx.textAlign = 'left';

    curY += 28;

    // Table Rows
    txs.forEach((tx, idx) => {
      const isEven = idx % 2 === 0;
      if (isEven) {
        roundRect(paddingX, curY, innerWidth, rowHeight - 2, 4, true, false, null, '#fafafa');
      }

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10.5px "Prompt", sans-serif';
      ctx.fillText(String(idx + 1), paddingX + 12, curY + 17);

      ctx.fillStyle = '#1e293b';
      ctx.font = '500 11px "Prompt", sans-serif';
      ctx.fillText(tx.date || '-', paddingX + 38, curY + 17);

      ctx.fillStyle = '#475569';
      ctx.font = '400 11px "Prompt", sans-serif';
      ctx.fillText(tx.group || '-', paddingX + 155, curY + 17);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 11.5px "Prompt", sans-serif';
      ctx.fillText(`฿${(Number(tx.amount) || 0).toLocaleString()}`, width - paddingX - 14, curY + 17);
      ctx.textAlign = 'left';

      curY += rowHeight;
    });

    curY += 8;

    // 5. Total Amount Due Box
    roundRect(paddingX, curY, innerWidth, 54, 12, true, true, '#a7f3d0', '#ecfdf5');
    ctx.fillStyle = '#065f46';
    ctx.font = 'bold 13px "Prompt", sans-serif';
    ctx.fillText('ยอดรวมที่ต้องชำระทั้งสิ้น', paddingX + 16, curY + 32);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#047857';
    ctx.font = '900 19px "Prompt", sans-serif';
    ctx.fillText(`฿${st.totalAmount.toLocaleString()}`, width - paddingX - 14, curY + 34);
    ctx.textAlign = 'left';

    curY += 62;

    // 6. Footer Notice
    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748b';
    ctx.font = '400 11px "Prompt", sans-serif';
    ctx.fillText('ขอบพระคุณครับ/ค่ะ 🙏', width / 2, curY + 14);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '400 9.5px "Prompt", sans-serif';
    ctx.fillText('ระบบบันทึกการสอน Money Plus v.3', width / 2, curY + 30);

    // Generate responsive preview img and pre-cache Blob & File
    const previewImg = document.getElementById('slip-preview-img');
    const dataUrl = canvas.toDataURL('image/png');
    this.state.currentSlipDataUrl = dataUrl;
    if (previewImg) {
      previewImg.src = dataUrl;
    }

    if (canvas.toBlob) {
      canvas.toBlob((blob) => {
        if (blob) {
          this.state.currentSlipBlob = blob;
          const studentName = st.name || 'นักเรียน';
          try {
            this.state.currentSlipFile = new File([blob], `ใบแจ้งยอด_${studentName}.png`, { type: 'image/png' });
          } catch (e) {
            console.warn('File constructor not supported, using Blob', e);
          }
        }
      }, 'image/png');
    }
  },

  downloadSlipImage: function() {
    const canvas = document.getElementById('slip-canvas');
    if (!canvas) return;

    const studentName = this.state.currentSlipStudentName || 'นักเรียน';
    const filename = `ใบแจ้งยอด_${studentName}.png`;

    // 1. Web Share API (Instant native sheet on iPadOS, iOS Safari & Android: lets user "Save Image" to Photos or send to LINE directly)
    if (this.state.currentSlipFile && navigator.canShare && navigator.canShare({ files: [this.state.currentSlipFile] })) {
      navigator.share({
        files: [this.state.currentSlipFile],
        title: `ใบแจ้งยอดค่าเรียน - ${studentName}`,
        text: `ใบแจ้งยอดค้างชำระค่าเรียนของ ${studentName}`
      }).then(() => {
        this.showToast('แชร์/บันทึกรูปภาพเรียบร้อย 🎉', 'success');
      }).catch(err => {
        if (err.name === 'AbortError') return; // User closed sheet
        console.warn('Share sheet dismissed, falling back to download', err);
        this._executeDirectDownload(canvas, filename);
      });
      return;
    }

    // 2. Fallback: try creating file if not ready yet
    if (navigator.share && navigator.canShare && canvas.toBlob) {
      canvas.toBlob(async (blob) => {
        if (blob) {
          try {
            const file = new File([blob], filename, { type: 'image/png' });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: `ใบแจ้งยอดค่าเรียน - ${studentName}`,
                text: `ใบแจ้งยอดค้างชำระค่าเรียนของ ${studentName}`
              });
              this.showToast('แชร์/บันทึกรูปภาพเรียบร้อย 🎉', 'success');
              return;
            }
          } catch (e) {
            console.warn('Async share failed:', e);
          }
        }
        this._executeDirectDownload(canvas, filename);
      }, 'image/png');
      return;
    }

    this._executeDirectDownload(canvas, filename);
  },

  _executeDirectDownload: function(canvas, filename) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (isIOS) {
      // On iOS Safari without WebShare, opening in new tab lets user long press and tap "Save Image"
      const dataUrl = this.state.currentSlipDataUrl || canvas.toDataURL('image/png');
      const win = window.open();
      if (win) {
        win.document.write(`<title>${filename}</title><body style="margin:0;background:#18181b;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;color:#fff;padding:16px;box-sizing:border-box;"><p style="margin-bottom:12px;font-size:14px;color:#a1a1aa;">แตะค้างที่รูปภาพด้านล่างเพื่อ <b>"บันทึกภาพ"</b> ลงอัลบั้ม</p><img src="${dataUrl}" style="max-width:100%;height:auto;border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,0.5);"></body>`);
        this.showToast('เปิดรูปในแท็บใหม่แล้ว แตะค้างเพื่อบันทึกรูป', 'info');
        return;
      }
    }

    if (canvas.toBlob) {
      canvas.toBlob(blob => {
        if (!blob) {
          this._fallbackDataUrlDownload(canvas, filename);
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = filename;
        link.href = url;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, 1500);
        this.showToast('ดาวน์โหลดรูปภาพเรียบร้อย (หรือแตะค้างที่รูปเพื่อบันทึก)', 'info');
      }, 'image/png');
    } else {
      this._fallbackDataUrlDownload(canvas, filename);
    }
  },

  _fallbackDataUrlDownload: function(canvas, filename) {
    const dataUrl = this.state.currentSlipDataUrl || canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
    }, 1500);
    this.showToast('ดาวน์โหลดรูปภาพเรียบร้อย', 'info');
  },

  copySlipImage: function() {
    const canvas = document.getElementById('slip-canvas');
    if (!canvas) return;

    const studentName = this.state.currentSlipStudentName || 'นักเรียน';
    const isTouchDevice = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // On iPad / iPhone, Web Share API lets users choose LINE directly
    if (isTouchDevice && this.state.currentSlipFile && navigator.canShare && navigator.canShare({ files: [this.state.currentSlipFile] })) {
      navigator.share({
        files: [this.state.currentSlipFile],
        title: `ใบแจ้งยอดค่าเรียน - ${studentName}`,
        text: `ใบแจ้งยอดค้างชำระค่าเรียนของ ${studentName}`
      }).then(() => {
        this.showToast('ส่งรูปภาพเรียบร้อย 🎉', 'success');
      }).catch((err) => {
        if (err.name === 'AbortError') return;
        this._tryClipboardCopy(canvas);
      });
      return;
    }

    this._tryClipboardCopy(canvas);
  },

  _tryClipboardCopy: function(canvas) {
    if (navigator.clipboard && window.ClipboardItem && canvas.toBlob) {
      canvas.toBlob(blob => {
        if (!blob) {
          this.downloadSlipImage();
          return;
        }
        navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]).then(() => {
          this.showToast('คัดลอกรูปภาพแล้ว! กดวาง (Ctrl+V) ใน LINE ได้เลย', 'success');
        }).catch(err => {
          console.warn('Clipboard write failed, downloading/sharing instead', err);
          this.downloadSlipImage();
        });
      }, 'image/png');
    } else {
      this.downloadSlipImage();
    }
  },

  copySlipText: function(studentName) {
    const { studentList } = this.getUnpaidStudentsData();
    const st = studentList.find(s => s.name === studentName);
    if (!st) {
      this.showToast('ไม่พบข้อมูลนักเรียน', 'error');
      return;
    }

    const settings = this.state.paymentSettings || {};
    let text = `📢 แจ้งยอดค้างชำระค่าเรียนพิเศษ\n`;
    text += `นักเรียน: ${st.name} (${st.grade})\n`;
    text += `------------------------------------\n`;
    text += `รายการค้างชำระ (${st.transactions.length} คาบ):\n`;
    st.transactions.forEach((tx, idx) => {
      text += `${idx + 1}. ${tx.date} (${tx.group}): ฿${(Number(tx.amount) || 0).toLocaleString()}\n`;
    });
    text += `------------------------------------\n`;
    text += `💰 ยอดรวมที่ต้องชำระ: ฿${st.totalAmount.toLocaleString()} บาท\n\n`;
    text += `ขอบพระคุณครับ/ค่ะ 🙏`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this.showToast(`คัดลอกข้อความสรุปของ ${st.name} แล้ว`, 'success');
      }).catch(() => {
        this.showToast('ไม่สามารถคัดลอกข้อความได้', 'error');
      });
    }
  },

  copySlipTextCurrent: function() {
    if (this.state.currentSlipStudentName) {
      this.copySlipText(this.state.currentSlipStudentName);
    }
  },

  markCurrentSlipStudentPaid: function() {
    if (this.state.currentSlipStudentName) {
      const name = this.state.currentSlipStudentName;
      this.closeSlipModal();
      this.markAllPaidForStudent(name);
    }
  },

  markAllPaidForStudent: function(studentName) {
    const pendingForStudent = this.state.transactions.filter(t => t.studentName === studentName && t.status === 'ค้างจ่าย');
    if (pendingForStudent.length === 0) {
      this.showToast('ไม่มีรายการค้างชำระสำหรับนักเรียนนี้', 'info');
      return;
    }

    this.openConfirmModal({
      title: 'ยืนยันการปิดยอดชำระ',
      message: `ต้องการเปลี่ยนสถานะรายการค้างจ่ายทั้งหมดของ "${studentName}" (${pendingForStudent.length} รายการ รวม ฿${pendingForStudent.reduce((s, c) => s + (Number(c.amount) || 0), 0).toLocaleString()}) เป็น "จ่ายแล้ว" ใช่หรือไม่?`,
      confirmText: '✓ ยืนยันชำระแล้ว',
      confirmClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
      onConfirm: () => {
        pendingForStudent.forEach(t => {
          t.status = 'จ่ายแล้ว';
          if (!t.paymentMethod || t.paymentMethod === '-') {
            t.paymentMethod = 'เงินโอน';
          }
        });
        this.saveData();
        this.updateUnpaidBadge();
        if (this.state.activeTab === 'unpaid') {
          this.renderUnpaidTracker();
        } else {
          this.render();
        }
        this.showToast(`บันทึกชำระเงินของ "${studentName}" เรียบร้อยแล้ว`, 'success');
      }
    });
  },

  openPaymentSettingsModal: function() {
    const s = this.state.paymentSettings || {};
    const accNameInput = document.getElementById('setting-account-name');
    const bankNameInput = document.getElementById('setting-bank-name');
    const accNumInput = document.getElementById('setting-account-number');
    const promptPayInput = document.getElementById('setting-promptpay');
    const noteInput = document.getElementById('setting-note');

    if (accNameInput) accNameInput.value = s.accountName || '';
    if (bankNameInput) bankNameInput.value = s.bankName || '';
    if (accNumInput) accNumInput.value = s.accountNumber || '';
    if (promptPayInput) promptPayInput.value = s.promptPay || '';
    if (noteInput) noteInput.value = s.note || '';

    const modal = document.getElementById('payment-settings-modal');
    if (modal) modal.classList.remove('hidden');
  },

  closePaymentSettingsModal: function() {
    const modal = document.getElementById('payment-settings-modal');
    if (modal) modal.classList.add('hidden');
  },

  savePaymentSettings: function() {
    const accNameInput = document.getElementById('setting-account-name');
    const bankNameInput = document.getElementById('setting-bank-name');
    const accNumInput = document.getElementById('setting-account-number');
    const promptPayInput = document.getElementById('setting-promptpay');
    const noteInput = document.getElementById('setting-note');

    this.state.paymentSettings = {
      accountName: accNameInput ? accNameInput.value.trim() : '',
      bankName: bankNameInput ? bankNameInput.value.trim() : '',
      accountNumber: accNumInput ? accNumInput.value.trim() : '',
      promptPay: promptPayInput ? promptPayInput.value.trim() : '',
      note: noteInput ? noteInput.value.trim() : ''
    };

    localStorage.setItem('money_plus_v3_payment_settings', JSON.stringify(this.state.paymentSettings));
    this.closePaymentSettingsModal();
    this.showToast('บันทึกข้อมูลบัญชีรับเงินเรียบร้อยแล้ว', 'success');

    if (this.state.currentSlipStudentName) {
      const { studentList } = this.getUnpaidStudentsData();
      const st = studentList.find(s => s.name === this.state.currentSlipStudentName);
      if (st) this.generateSlipCanvas(st);
    }
  },

  // ----------------- MASTER DATA RENDER & MODALS -----------------
  renderMaster: function() {
    const stuListContainer = document.getElementById('master-students-list');
    const grpListContainer = document.getElementById('master-groups-list');

    if (stuListContainer) {
      const currentFilter = this.state.masterGradeFilter || 'all';
      let displayedStudents = this.state.students;
      if (currentFilter === 'other') {
        const knownGrades = this.getAvailableGrades();
        displayedStudents = displayedStudents.filter(s => !s.grade || !knownGrades.includes(s.grade));
      } else if (currentFilter !== 'all') {
        displayedStudents = displayedStudents.filter(s => s.grade === currentFilter);
      }

      if (displayedStudents.length === 0) {
        stuListContainer.innerHTML = `
          <div class="col-span-2 p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            ไม่พบนักเรียนในระดับชั้นที่เลือก
          </div>
        `;
      } else {
        stuListContainer.innerHTML = displayedStudents.map((s, idx) => {
          const studentTx = this.state.transactions.filter(t => t.studentName === s.name);
          const totalPaid = studentTx.filter(t => t.status === 'จ่ายแล้ว').reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
          return `
            <div class="p-3.5 bg-white rounded-xl border border-slate-200 flex items-center justify-between gap-2 hover:border-emerald-300 transition">
              <div>
                <div class="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  ${s.name}
                  ${s.grade ? `<span class="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">${s.grade}</span>` : '<span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px]">ไม่ระบุชั้น</span>'}
                </div>
                <div class="text-[11px] text-slate-600 mt-1 flex items-center gap-1">
                  <span>ค่าเรียนมาตรฐาน: <strong class="text-emerald-700">฿${s.defaultFee || 200}</strong></span>
                </div>
                <div class="text-[10px] text-slate-400 font-medium mt-0.5">ประวัติ: รวมเรียน ${studentTx.length} คาบ (ชำระแล้ว ฿${totalPaid.toLocaleString()})</div>
              </div>
              <div class="flex items-center gap-1">
                <button onclick="App.openStudentModal('${s.id}')" class="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded text-xs transition" title="แก้ไข">✏️</button>
                <button onclick="App.deleteStudent('${s.id}')" class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-slate-100 rounded text-xs transition" title="ลบ">🗑️</button>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    if (grpListContainer) {
      grpListContainer.innerHTML = this.state.groups.map((g, idx) => {
        return `
          <div class="p-3.5 bg-white rounded-xl border border-slate-200 flex items-center justify-between hover:border-emerald-300 transition">
            <div>
              <div class="font-bold text-slate-900 text-sm">${g.name}</div>
              <div class="text-[11px] text-slate-400 mt-0.5">รอบวันเรียนสำหรับจัดตารางสอน / เช็คชื่อ</div>
            </div>
            <div class="flex items-center gap-1.5">
              <button onclick="App.deleteGroup('${g.id}')" class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-slate-100 rounded text-xs transition" title="ลบกลุ่ม">🗑️</button>
            </div>
          </div>
        `;
      }).join('');
    }
  },

  setMasterGradeFilter: function(gradeFilter) {
    this.state.masterGradeFilter = gradeFilter;
    
    // Update chip styling
    const container = document.getElementById('master-grade-filter-chips');
    if (container) {
      const buttons = container.querySelectorAll('button');
      buttons.forEach(b => {
        if (b.getAttribute('data-grade-filter') === gradeFilter) {
          b.className = "px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-600 text-white shadow-sm transition";
        } else {
          b.className = "px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition";
        }
      });
    }

    this.renderMaster();
  },

  // Student Modal (Add / Edit)
  openStudentModal: function(stuId = null) {
    this.state.editingStudentId = stuId;
    const titleEl = document.getElementById('student-modal-title');
    const nameInput = document.getElementById('student-modal-name');
    const gradeInput = document.getElementById('student-modal-grade');
    const feeInput = document.getElementById('student-modal-fee');

    if (stuId) {
      const s = this.state.students.find(x => x.id === stuId);
      if (!s) return;
      titleEl.textContent = 'แก้ไขข้อมูลนักเรียน';
      nameInput.value = s.name;
      gradeInput.value = s.grade || '';
      feeInput.value = s.defaultFee || 200;
    } else {
      titleEl.textContent = 'เพิ่มนักเรียนใหม่';
      nameInput.value = '';
      gradeInput.value = this.state.recordGrade !== 'all' && this.state.recordGrade !== 'other' ? this.state.recordGrade : 'ม.1';
      feeInput.value = 200;
    }

    const modal = document.getElementById('student-dialog-modal');
    if (modal) modal.classList.remove('hidden');
  },

  closeStudentModal: function() {
    this.state.editingStudentId = null;
    const modal = document.getElementById('student-dialog-modal');
    if (modal) modal.classList.add('hidden');
  },

  saveStudentModal: function() {
    const name = document.getElementById('student-modal-name').value.trim();
    if (!name) {
      this.showToast('กรุณากรอกชื่อนักเรียน', 'error');
      return;
    }

    const grade = document.getElementById('student-modal-grade').value.trim();
    const fee = Number(document.getElementById('student-modal-fee').value) || 200;

    if (this.state.editingStudentId) {
      const s = this.state.students.find(x => x.id === this.state.editingStudentId);
      if (s) {
        s.name = name;
        s.grade = grade;
        s.defaultFee = fee;
        this.showToast(`อัปเดตข้อมูล ${name} เรียบร้อย`, 'success');
      }
    } else {
      this.state.students.push({
        id: 'stu_' + Date.now(),
        name: name,
        grade: grade,
        defaultFee: fee
      });
      this.showToast(`เพิ่มนักเรียน ${name} เรียบร้อย`, 'success');
    }

    this.saveData();
    this.closeStudentModal();
    this.renderMaster();
    this.renderQuickRecord();
  },

  deleteStudent: function(stuId) {
    const s = this.state.students.find(x => x.id === stuId);
    if (!s) return;

    this.openConfirmModal({
      title: 'ลบรายชื่อนักเรียน',
      message: `คุณต้องการลบรายชื่อนักเรียน "${s.name}" หรือไม่? (ประวัติการเรียนเดิมในระบบจะไม่ถูกลบ)`,
      confirmText: 'ลบนักเรียน',
      confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
      onConfirm: () => {
        this.state.students = this.state.students.filter(x => x.id !== stuId);
        this.saveData();
        this.renderMaster();
        this.renderQuickRecord();
        this.showToast(`ลบ ${s.name} เรียบร้อย`, 'info');
      }
    });
  },

  // Group Modal (Add)
  openGroupModal: function() {
    document.getElementById('group-modal-name').value = '';
    const modal = document.getElementById('group-dialog-modal');
    if (modal) modal.classList.remove('hidden');
  },

  closeGroupModal: function() {
    const modal = document.getElementById('group-dialog-modal');
    if (modal) modal.classList.add('hidden');
  },

  saveGroupModal: function() {
    const name = document.getElementById('group-modal-name').value.trim();
    if (!name) {
      this.showToast('กรุณากรอกชื่อกลุ่มเรียน', 'error');
      return;
    }

    this.state.groups.push({
      id: 'grp_' + Date.now(),
      name: name
    });
    this.saveData();
    this.closeGroupModal();
    this.renderMaster();
    this.renderQuickRecord();
    this.showToast(`เพิ่มกลุ่ม "${name}" เรียบร้อย`, 'success');
  },

  deleteGroup: function(grpId) {
    const g = this.state.groups.find(x => x.id === grpId);
    if (!g) return;

    this.openConfirmModal({
      title: 'ลบกลุ่มรอบเรียน',
      message: `คุณต้องการลบกลุ่ม "${g.name}" ใช่หรือไม่?`,
      confirmText: 'ลบกลุ่ม',
      confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
      onConfirm: () => {
        this.state.groups = this.state.groups.filter(x => x.id !== grpId);
        this.saveData();
        this.renderMaster();
        this.renderQuickRecord();
        this.showToast('ลบกลุ่มเรียบร้อย', 'info');
      }
    });
  },

  // ----------------- TOAST SYSTEM -----------------
  showToast: function(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-msg');
    const toastIcon = document.getElementById('toast-icon');
    if (!toast || !toastMsg) return;

    toastMsg.textContent = message;
    if (type === 'success') {
      toast.className = 'fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-2xl transition-all transform translate-y-0 opacity-100';
      if (toastIcon) toastIcon.textContent = '✓';
    } else if (type === 'error') {
      toast.className = 'fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 bg-red-600 text-white text-xs font-semibold rounded-xl shadow-2xl transition-all transform translate-y-0 opacity-100';
      if (toastIcon) toastIcon.textContent = '✕';
    } else {
      toast.className = 'fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-2xl transition-all transform translate-y-0 opacity-100';
      if (toastIcon) toastIcon.textContent = 'ℹ';
    }

    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      toast.classList.add('translate-y-12', 'opacity-0');
    }, 3500);
  },

  // ----------------- EVENT BINDINGS -----------------
  bindEvents: function() {
    const gradeSelect = document.getElementById('record-grade-select');
    if (gradeSelect) {
      gradeSelect.addEventListener('change', (e) => {
        this.state.recordGrade = e.target.value;
        this.populateSessionStudents();
        this.renderQuickRecordList();
      });
    }

    const groupSelect = document.getElementById('record-group-select');
    if (groupSelect) {
      groupSelect.addEventListener('change', (e) => {
        this.state.recordGroup = e.target.value;
        this.state.sessionStudents.forEach(item => item.group = e.target.value);
      });
    }

    const dateInput = document.getElementById('record-date-input');
    if (dateInput) {
      dateInput.addEventListener('change', (e) => {
        this.state.recordDate = e.target.value;
      });
    }

    const searchInput = document.getElementById('filter-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.state.filter.search = e.target.value;
        this.state.page = 1;
        this.renderTransactions();
      });
    }

    ['year', 'month', 'group', 'grade', 'status', 'payment'].forEach(field => {
      const el = document.getElementById('filter-' + field);
      if (el) {
        el.addEventListener('change', (e) => {
          this.state.filter[field] = e.target.value;
          this.state.page = 1;
          this.renderTransactions();
        });
      }
    });

    const exportBtn = document.getElementById('btn-export-excel');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        if (window.ExcelService) {
          window.ExcelService.exportToExcel({
            transactions: this.state.transactions,
            students: this.state.students,
            groups: this.state.groups
          });
          this.showToast('ส่งออกไฟล์ Excel เรียบร้อยแล้ว', 'success');
        }
      });
    }

    const importInput = document.getElementById('excel-import-file');
    if (importInput) {
      importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (window.ExcelService) {
          window.ExcelService.importFromExcel(file, (err, result) => {
            if (err) {
              alert('เกิดข้อผิดพลาดในการนำเข้าไฟล์: ' + err.message);
              return;
            }
            this.openConfirmModal({
              title: 'นำเข้าข้อมูล Excel',
              message: `พบข้อมูล ${result.transactions.length} รายการ ต้องการนำเข้าข้อมูลเหล่านี้เข้าสู่ระบบหรือไม่?`,
              confirmText: 'นำเข้าข้อมูล',
              confirmClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
              onConfirm: () => {
                this.state.transactions = result.transactions;
                if (result.students.length > 0) this.state.students = result.students;
                if (result.groups.length > 0) this.state.groups = result.groups;
                this.saveData();
                this.render();
                this.showToast(`นำเข้าสำเร็จ ${result.transactions.length} รายการ`, 'success');
              }
            });
          });
        }
      });
    }
  },

  renderEditModal: function() {
    const modal = document.getElementById('edit-tx-modal');
    if (!modal || !this.state.editingTx) return;
    const tx = this.state.editingTx;

    document.getElementById('edit-date').value = tx.date;
    document.getElementById('edit-student').value = tx.studentName;
    document.getElementById('edit-grade').value = tx.grade || '';
    document.getElementById('edit-group').value = tx.group || '';
    document.getElementById('edit-amount').value = tx.amount;
    document.getElementById('edit-status').value = tx.status;
    document.getElementById('edit-payment').value = tx.paymentMethod;

    modal.classList.remove('hidden');
  },

  // ==================== FIREBASE CLOUD SYNC ====================
  initFirebase: function() {
    if (window.FirebaseService) {
      window.FirebaseService.init(
        (cloudData, isCloudEmpty) => this.handleCloudData(cloudData, isCloudEmpty),
        (status) => this.handleCloudStatus(status)
      );
    }
  },

  handleCloudStatus: function(status) {
    const dot = document.getElementById('cloud-status-dot');
    const text = document.getElementById('cloud-status-text');
    const modalDot = document.getElementById('modal-cloud-dot');
    const modalStatus = document.getElementById('modal-cloud-status');
    const modalTime = document.getElementById('modal-cloud-time');
    const modalCounts = document.getElementById('modal-cloud-counts');

    const isConnected = status && status.connected;
    const colorClass = isConnected ? 'bg-emerald-500' : 'bg-amber-500';
    const statusMsg = isConnected ? 'คลาวด์ออนไลน์' : 'ออฟไลน์';

    if (dot) {
      dot.className = `w-2.5 h-2.5 rounded-full ${colorClass} ${isConnected ? 'animate-pulse' : ''}`;
    }
    if (text) {
      text.textContent = statusMsg;
    }
    if (modalDot) {
      modalDot.className = `w-2.5 h-2.5 rounded-full ${colorClass}`;
    }
    if (modalStatus) {
      modalStatus.textContent = isConnected ? 'เชื่อมต่อ Google Firebase สำเร็จ (ซิงค์เรียลไทม์)' : (status.message || 'ออฟไลน์ (บันทึกลงเครื่อง)');
      modalStatus.className = isConnected ? 'font-bold text-emerald-700' : 'font-bold text-amber-700';
    }
    if (modalTime) {
      const timeVal = (status && status.lastCloudUpdate) || (window.FirebaseService && window.FirebaseService.lastCloudUpdate);
      if (timeVal) {
        try {
          const d = new Date(timeVal);
          modalTime.textContent = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } catch (e) {
          modalTime.textContent = timeVal;
        }
      } else {
        modalTime.textContent = 'ยังไม่มีประวัติซิงค์';
      }
    }
    if (modalCounts) {
      modalCounts.textContent = `${this.state.transactions.length} รายการ / ${this.state.students.length} นักเรียน / ${this.state.groups.length} กลุ่ม`;
    }
  },

  handleCloudData: function(cloudData, isCloudEmpty) {
    if (isCloudEmpty) {
      // Firebase cloud is completely empty, initialize it with current local dataset
      console.log('Firebase cloud is empty. Initializing with local data...');
      this.syncToCloud(true);
      return;
    }

    if (!cloudData) return;

    // Check if cloud data has transactions
    if (cloudData.transactions && Array.isArray(cloudData.transactions)) {
      // Normalize transactions
      cloudData.transactions.forEach(t => {
        if (t && t.status === 'ค้างชำระ') t.status = 'ค้างจ่าย';
        if (t && t.id === 'tx_181' && t.status === 'จ่ายแล้ว' && t.paymentMethod === '-') t.status = 'ค้างจ่าย';
      });

      this.state.transactions = cloudData.transactions;
      if (cloudData.students && Array.isArray(cloudData.students)) {
        this.state.students = cloudData.students;
      }
      if (cloudData.groups && Array.isArray(cloudData.groups)) {
        this.state.groups = cloudData.groups;
      }
      if (cloudData.paymentSettings) {
        this.state.paymentSettings = Object.assign(this.state.paymentSettings, cloudData.paymentSettings);
      }

      // Save to localStorage as offline cache
      const payload = {
        transactions: this.state.transactions,
        students: this.state.students,
        groups: this.state.groups,
        paymentSettings: this.state.paymentSettings,
        lastUpdated: cloudData.lastUpdated || new Date().toISOString()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      localStorage.setItem(STORAGE_KEY + '_last_sync', payload.lastUpdated);

      this.populateSessionStudents();
      this.render();
      this.updateUnpaidBadge();
      this.handleCloudStatus({ connected: true, lastCloudUpdate: cloudData.lastUpdated });
    }
  },

  syncToCloud: function(silent = false) {
    if (!window.FirebaseService || !window.FirebaseService.db) {
      if (!silent) this.showToast('Firebase ยังไม่พร้อมใช้งาน', 'error');
      return;
    }
    const payload = {
      transactions: this.state.transactions,
      students: this.state.students,
      groups: this.state.groups,
      paymentSettings: this.state.paymentSettings,
      lastUpdated: new Date().toISOString()
    };
    window.FirebaseService.saveData(payload).then(success => {
      if (success) {
        localStorage.setItem(STORAGE_KEY + '_last_sync', payload.lastUpdated);
        this.handleCloudStatus({ connected: true, lastCloudUpdate: payload.lastUpdated });
        if (!silent) {
          this.showToast('ซิงค์ข้อมูลขึ้น Google Firebase เรียบร้อยแล้ว ☁️', 'success');
        }
      } else {
        if (!silent) {
          this.showToast('ไม่สามารถซิงค์ขึ้นคลาวด์ได้ โปรดตรวจ Firebase Rules', 'error');
        }
      }
    });
  },

  showCloudStatusModal: function() {
    const modal = document.getElementById('cloud-status-modal');
    if (modal) modal.classList.remove('hidden');
    this.handleCloudStatus({
      connected: window.FirebaseService ? window.FirebaseService.isConnectedToCloud : false,
      lastCloudUpdate: window.FirebaseService ? window.FirebaseService.lastCloudUpdate : null
    });
  },

  closeCloudStatusModal: function() {
    const modal = document.getElementById('cloud-status-modal');
    if (modal) modal.classList.add('hidden');
  },

  forcePushToCloud: function() {
    this.syncToCloud(false);
    this.closeCloudStatusModal();
  },

  showPwaInstallModal: function() {
    const modal = document.getElementById('pwa-install-modal');
    if (modal) modal.classList.remove('hidden');
  },

  closePwaInstallModal: function() {
    const modal = document.getElementById('pwa-install-modal');
    if (modal) modal.classList.add('hidden');
  },

  // ----------------- 🌙 THEME MANAGEMENT (MIDNIGHT OLED) -----------------
  initTheme: function() {
    const saved = localStorage.getItem('money_plus_theme');
    if (saved === 'dark' || (!saved && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    this.updateThemeUI();
  },

  toggleTheme: function() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('money_plus_theme', isDark ? 'dark' : 'light');
    this.updateThemeUI();
    if (this.charts && this.charts.trend) {
      this.renderCharts();
    }
    this.showToast(isDark ? 'เปิดใช้งาน Dark Mode 🌙 (Midnight OLED)' : 'สลับเป็น Light Mode ☀️ เรียบร้อย', 'info');
  },

  updateThemeUI: function() {
    const isDark = document.documentElement.classList.contains('dark');
    const icon = document.getElementById('theme-toggle-icon');
    if (icon) {
      icon.textContent = isDark ? '☀️' : '🌙';
    }
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) {
      btn.title = isDark ? 'คลิกเพื่อสลับเป็นโหมดสว่าง (Light Mode)' : 'คลิกเพื่อสลับเป็นโหมดมืด (Dark Mode)';
      if (isDark) {
        btn.classList.add('text-amber-400', 'bg-zinc-800', 'border-zinc-700');
        btn.classList.remove('text-slate-700', 'bg-slate-100', 'border-slate-200');
      } else {
        btn.classList.remove('text-amber-400', 'bg-zinc-800', 'border-zinc-700');
        btn.classList.add('text-slate-700', 'bg-slate-100', 'border-slate-200');
      }
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', isDark ? '#09090b' : '#059669');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
