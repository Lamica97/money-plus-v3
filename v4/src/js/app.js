// Money Plus v.4 - Core Application Controller (Clean, Modular, Progressive Disclosure UI)
const STORAGE_KEY_V4 = 'money_plus_v4_data';
const THEME_KEY_V4 = 'money_plus_v4_theme';
const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const THAI_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

function getThaiMonth(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 2) return '';
  const m = parseInt(parts[1], 10);
  return (m >= 1 && m <= 12) ? THAI_MONTHS[m - 1] : '';
}

function getTodayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const App = {
  state: {
    activeTab: 'quick-record', // 'quick-record' | 'unpaid' | 'history' | 'dashboard' | 'master'
    historyViewMode: 'table',  // 'table' | 'calendar'
    showAdvancedFilters: false,

    transactions: [],
    students: [],
    groups: [],
    paymentSettings: {
      accountName: 'ครูผู้สอน (Money Plus)',
      bankName: 'ธนาคารกสิกรไทย',
      accountNumber: '',
      promptPay: ''
    },

    // Tab 1: Quick Record State
    recordDate: getTodayISO(),
    recordGrade: 'ม.4',
    recordGroup: 'วันจันทร์',
    sessionStudents: [],

    // Tab 2: Unpaid Tracker & Slip Studio
    unpaidSearch: '',
    unpaidGrade: 'all',
    unpaidSort: 'amount-desc',
    slipStudentName: null,
    slipMode: 'active-months',
    slipShowBank: false,

    // Tab 3: History & Calendar
    filter: {
      search: '',
      year: String(new Date().getFullYear()),
      month: 'all',
      group: 'all',
      grade: 'all',
      quickChip: 'all' // 'all' | 'pending' | 'transfer' | 'cash'
    },
    page: 1,
    pageSize: 35,
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth(),
    selectedCalendarDate: null,

    // Tab 4: Dashboard
    dashYear: String(new Date().getFullYear()),
    dashMonth: THAI_MONTHS[new Date().getMonth()],

    // Tab 5: Master Data
    masterGradeFilter: 'all',
    masterSearch: '',
    editingStudentId: null,
    editingStudentOriginalName: null,

    // Modals
    payingTxId: null,
    editingTxId: null,
    confirmCallback: null
  },

  charts: {
    trend: null
  },

  init: function() {
    this.initTheme();
    this.loadData();

    const now = new Date();
    const curYear = String(now.getFullYear());
    const curMonthShort = THAI_MONTHS[now.getMonth()];
    const hasCurYearTx = this.state.transactions.some(t => t.year === curYear || (t.date && t.date.startsWith(curYear)));
    const activeYear = hasCurYearTx ? curYear : '2026';

    this.state.dashYear = activeYear;
    this.state.dashMonth = curMonthShort;
    this.state.filter.year = 'all';
    this.state.filter.month = 'all';

    // Default grade & group
    const dayMap = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
    const todayGroup = dayMap[now.getDay()];
    if (this.state.groups.some(g => g.name === todayGroup)) {
      this.state.recordGroup = todayGroup;
    } else if (this.state.groups.length > 0) {
      this.state.recordGroup = this.state.groups[0].name;
    }

    this.populateSessionStudents();
    this.bindEvents();
    this.render();
    this.initFirebase();
  },

  // ==================== 🌙 THEME (DARK MODE DEFAULT) ====================
  initTheme: function() {
    const saved = localStorage.getItem(THEME_KEY_V4);
    // Default to Dark Mode (Midnight OLED) unless explicitly set to 'light'
    if (saved === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
    this.updateThemeUI();
  },

  toggleTheme: function() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem(THEME_KEY_V4, isDark ? 'dark' : 'light');
    this.updateThemeUI();
    if (this.state.activeTab === 'dashboard') {
      this.renderCharts();
    }
    this.showToast(isDark ? 'โหมดมืด (Midnight OLED) 🌙' : 'โหมดสว่าง (Light Mode) ☀️', 'info');
  },

  updateThemeUI: function() {
    const isDark = document.documentElement.classList.contains('dark');
    const icon = document.getElementById('theme-toggle-icon');
    if (icon) icon.textContent = isDark ? '☀️' : '🌙';
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', isDark ? '#09090b' : '#059669');
  },

  // ==================== 💾 DATA & SMART SYNC ====================
  loadData: function() {
    const saved = localStorage.getItem(STORAGE_KEY_V4);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.transactions && parsed.transactions.length > 0) {
          this.state.transactions = parsed.transactions;
          this.state.students = parsed.students || [];
          this.state.groups = parsed.groups || [];
          if (parsed.paymentSettings) {
            this.state.paymentSettings = Object.assign(this.state.paymentSettings, parsed.paymentSettings);
          }
          this.normalizeData();
          return;
        }
      } catch (e) {
        console.warn('Error parsing local v4 data:', e);
      }
    }
    // Check if v3 local storage exists on same device and migrate automatically
    const savedV3 = localStorage.getItem('money_plus_v3_data');
    if (savedV3) {
      try {
        const parsedV3 = JSON.parse(savedV3);
        if (parsedV3.transactions && parsedV3.transactions.length > 0) {
          this.state.transactions = parsedV3.transactions;
          this.state.students = parsedV3.students || [];
          this.state.groups = parsedV3.groups || [];
          if (parsedV3.paymentSettings) {
            this.state.paymentSettings = Object.assign(this.state.paymentSettings, parsedV3.paymentSettings);
          }
          this.normalizeData();
          this.saveData(true);
          return;
        }
      } catch (e) {}
    }
    this.loadInitial();
  },

  loadInitial: function() {
    if (window.INITIAL_DATA) {
      this.state.transactions = JSON.parse(JSON.stringify(window.INITIAL_DATA.transactions || []));
      this.state.students = JSON.parse(JSON.stringify(window.INITIAL_DATA.students || []));
      this.state.groups = JSON.parse(JSON.stringify(window.INITIAL_DATA.groups || []));
      if (window.INITIAL_DATA.paymentSettings) {
        this.state.paymentSettings = Object.assign(this.state.paymentSettings, window.INITIAL_DATA.paymentSettings);
      }
      this.normalizeData();
      this.saveData(true);
    }
  },

  normalizeData: function() {
    this.state.transactions.forEach(t => {
      if (t.status === 'ค้างชำระ') t.status = 'ค้างจ่าย';
      if (!t.month && t.date) t.month = getThaiMonth(t.date);
      if (!t.year && t.date) t.year = t.date.split('-')[0];
    });
    // Filter out placeholder "ลบด้วย" if present
    this.state.students = this.state.students.filter(s => s.name && s.name !== 'ลบด้วย');
  },

  saveData: function(skipCloud = false) {
    const payload = {
      transactions: this.state.transactions,
      students: this.state.students,
      groups: this.state.groups,
      paymentSettings: this.state.paymentSettings,
      lastUpdated: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY_V4, JSON.stringify(payload));
    this.updateUnpaidBadges();

    if (!skipCloud && window.FirebaseService && window.FirebaseService.db) {
      window.FirebaseService.saveData(payload);
    }
  },

  initFirebase: function() {
    if (window.FirebaseService) {
      window.FirebaseService.init(
        (cloudData, isCloudEmpty) => this.handleCloudData(cloudData, isCloudEmpty),
        (status) => this.handleCloudStatus(status)
      );
    }
  },

  handleCloudStatus: function(status) {
    const isConnected = status && status.connected;
    const dot = document.getElementById('cloud-status-dot');
    const text = document.getElementById('cloud-status-text');
    const drawerStatus = document.getElementById('drawer-cloud-status');

    if (dot) {
      dot.className = `w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`;
    }
    if (text) {
      text.textContent = isConnected ? 'Cloud v.4' : 'ออฟไลน์';
    }
    if (drawerStatus) {
      drawerStatus.textContent = isConnected
        ? `เชื่อมต่อคลาวด์ v.4 แล้ว (${this.state.transactions.length} รายการ)`
        : 'โหมดออฟไลน์ (บันทึกในเครื่อง)';
    }
  },

  handleCloudData: function(cloudData, isCloudEmpty) {
    if (isCloudEmpty) {
      this.saveData(false);
      return;
    }
    if (!cloudData || !Array.isArray(cloudData.transactions)) return;

    // Smart Merge Protection: Preserve any local_ transactions not yet in cloudData
    const cloudTxList = cloudData.transactions;
    const cloudIds = new Set(cloudTxList.map(t => t.firebaseId || t.id));
    const unsyncedLocals = this.state.transactions.filter(t => {
      const key = t.firebaseId || t.id;
      return key && String(key).startsWith('local_') && !cloudIds.has(key);
    });

    if (unsyncedLocals.length > 0 && cloudTxList.length < this.state.transactions.length) {
      console.log(`[Smart Sync] Merging ${unsyncedLocals.length} local transactions into cloud data`);
      this.state.transactions = [...unsyncedLocals, ...cloudTxList];
      this.normalizeData();
      this.saveData(false);
    } else {
      this.state.transactions = cloudTxList;
      if (Array.isArray(cloudData.students)) this.state.students = cloudData.students;
      if (Array.isArray(cloudData.groups)) this.state.groups = cloudData.groups;
      if (cloudData.paymentSettings) {
        this.state.paymentSettings = Object.assign(this.state.paymentSettings, cloudData.paymentSettings);
      }
      this.normalizeData();
      this.saveData(true);
    }

    this.populateSessionStudents();
    this.render();
  },

  pullFromV3: async function() {
    if (!window.FirebaseService || !window.FirebaseService.db) {
      this.showToast('ไม่สามารถเชื่อมต่อ Firebase ได้ในขณะนี้', 'error');
      return;
    }
    this.showToast('กำลังดึงข้อมูลล่าสุดจาก Money Plus v.3...', 'info');
    const v3Data = await window.FirebaseService.pullFromV3Cloud();
    if (!v3Data || !Array.isArray(v3Data.transactions)) {
      this.showToast('ไม่พบข้อมูลบนโหนด v.3', 'error');
      return;
    }

    this.openConfirmModal({
      title: 'ซิงค์ข้อมูลจาก Money Plus v.3',
      message: `พบข้อมูลจาก v.3 จำนวน ${v3Data.transactions.length} รายการ (${(v3Data.students || []).length} นักเรียน) ต้องการนำมาอัปเดตเข้าสู่ระบบ v.4 หรือไม่?`,
      confirmText: '🔄 อัปเดตเข้า v.4',
      confirmClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
      onConfirm: () => {
        this.state.transactions = v3Data.transactions;
        if (Array.isArray(v3Data.students)) this.state.students = v3Data.students;
        if (Array.isArray(v3Data.groups)) this.state.groups = v3Data.groups;
        if (v3Data.paymentSettings) {
          this.state.paymentSettings = Object.assign(this.state.paymentSettings, v3Data.paymentSettings);
        }
        this.normalizeData();
        this.saveData(false);
        this.populateSessionStudents();
        this.render();
        this.closeSettingsDrawer();
        this.showToast(`ดึงข้อมูลจาก v.3 สำเร็จ (${this.state.transactions.length} รายการ) 🎉`, 'success');
      }
    });
  },

  // ==================== 🧭 NAVIGATION & TABS ====================
  switchTab: function(tabId) {
    this.state.activeTab = tabId;
    const tabs = ['quick-record', 'unpaid', 'history', 'dashboard', 'master'];

    tabs.forEach(t => {
      const panel = document.getElementById('tab-panel-' + t);
      const navBtn = document.getElementById('nav-' + t);
      const mobBtn = document.getElementById('mob-nav-' + t);

      if (panel) {
        if (t === tabId) panel.classList.remove('hidden');
        else panel.classList.add('hidden');
      }

      if (navBtn) {
        if (t === tabId) {
          navBtn.className = 'px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 transition flex items-center gap-1.5 whitespace-nowrap';
        } else {
          navBtn.className = 'px-3.5 py-2 rounded-xl text-xs font-medium text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800/60 transition flex items-center gap-1.5 whitespace-nowrap';
        }
      }

      if (mobBtn) {
        if (t === tabId) {
          mobBtn.className = 'flex flex-col items-center justify-center py-1.5 px-2 text-emerald-400 font-bold transition relative';
        } else {
          mobBtn.className = 'flex flex-col items-center justify-center py-1.5 px-2 text-slate-400 dark:text-zinc-500 font-medium transition relative';
        }
      }
    });

    this.render();
  },

  render: function() {
    this.updateUnpaidBadges();
    const tab = this.state.activeTab;
    if (tab === 'quick-record') this.renderQuickRecord();
    else if (tab === 'unpaid') this.renderUnpaidTracker();
    else if (tab === 'history') this.renderHistoryAndCalendar();
    else if (tab === 'dashboard') this.renderDashboard();
    else if (tab === 'master') this.renderMaster();
  },

  updateUnpaidBadges: function() {
    const pendingTxs = this.state.transactions.filter(t => t.status === 'ค้างจ่าย');
    const uniqueStudents = new Set(pendingTxs.map(t => t.studentName)).size;

    ['nav-unpaid-badge', 'mob-unpaid-badge'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        if (uniqueStudents > 0) {
          el.textContent = uniqueStudents;
          el.classList.remove('hidden');
        } else {
          el.classList.add('hidden');
        }
      }
    });
  },

  // ==================== ⚡ TAB 1: QUICK RECORD (PROGRESSIVE DISCLOSURE) ====================
  getGradeList: function() {
    const defaultGrades = ['ป.6', 'ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'];
    const stuGrades = this.state.students.map(s => (s.grade || '').trim()).filter(Boolean);
    const merged = Array.from(new Set([...defaultGrades, ...stuGrades]));
    // Keep only grades that actually have students, plus common ones
    const activeGrades = merged.filter(g => this.state.students.some(s => (s.grade || '').trim() === g));
    return activeGrades.length > 0 ? activeGrades : ['ม.1', 'ม.4', 'ม.5', 'ม.6'];
  },

  populateSessionStudents: function() {
    const grade = this.state.recordGrade;
    const filtered = this.state.students.filter(s => {
      const g = (s.grade || '').trim();
      if (grade === 'all') return true;
      if (grade === 'other') return !g;
      return g === grade;
    });

    this.state.sessionStudents = filtered.map(s => ({
      id: s.id,
      name: s.name,
      grade: s.grade || '',
      group: this.state.recordGroup,
      amount: Number(s.defaultFee) || 200,
      present: false,
      payMode: 'ค้างจ่าย' // 'ค้างจ่าย' | 'เงินโอน' | 'เงินสด'
    }));
  },

  setRecordGrade: function(grade) {
    this.state.recordGrade = grade;
    this.populateSessionStudents();
    this.renderQuickRecord();
  },

  setRecordDateQuick: function(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    this.state.recordDate = `${y}-${m}-${day}`;
    const dateInput = document.getElementById('record-date-input');
    if (dateInput) dateInput.value = this.state.recordDate;

    const dayMap = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
    const matchGrp = dayMap[d.getDay()];
    if (this.state.groups.some(g => g.name === matchGrp)) {
      this.state.recordGroup = matchGrp;
      const grpSelect = document.getElementById('record-group-select');
      if (grpSelect) grpSelect.value = matchGrp;
    }
  },

  renderQuickRecord: function() {
    const dateInput = document.getElementById('record-date-input');
    if (dateInput && dateInput.value !== this.state.recordDate) {
      dateInput.value = this.state.recordDate;
    }

    // 1. Render Quick Grade Chips
    const gradeChipsEl = document.getElementById('record-grade-chips');
    if (gradeChipsEl) {
      const grades = this.getGradeList();
      const chips = [
        ...grades.map(g => ({ key: g, label: g })),
        { key: 'all', label: 'ทั้งหมด' }
      ];
      gradeChipsEl.innerHTML = chips.map(c => {
        const active = this.state.recordGrade === c.key;
        const count = this.state.students.filter(s => c.key === 'all' ? true : (s.grade || '').trim() === c.key).length;
        return `
          <button type="button" onclick="App.setRecordGrade('${c.key}')"
            class="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              active
                ? 'bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20'
                : 'surface-elevated text-slate-600 dark:text-zinc-300 hover:border-emerald-500/40'
            }">
            <span>${c.label}</span>
            <span class="text-[10px] px-1.5 py-0.2 rounded-full ${active ? 'bg-zinc-950/20 text-zinc-950' : 'bg-slate-200 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400'}">${count}</span>
          </button>
        `;
      }).join('');
    }

    // 2. Render Group Select
    const grpSelect = document.getElementById('record-group-select');
    if (grpSelect) {
      grpSelect.innerHTML = this.state.groups.map(g =>
        `<option value="${g.name}" ${g.name === this.state.recordGroup ? 'selected' : ''}>${g.name}</option>`
      ).join('') + `<option value="วันอื่น_ๆ" ${this.state.recordGroup === 'วันอื่น_ๆ' ? 'selected' : ''}>วันอื่น ๆ</option>`;
    }

    this.renderQuickRecordCards();
  },

  renderQuickRecordCards: function() {
    const container = document.getElementById('session-students-list');
    if (!container) return;

    const list = this.state.sessionStudents;
    if (list.length === 0) {
      container.innerHTML = `
        <div class="col-span-full py-12 text-center text-slate-400 dark:text-zinc-500 text-xs">
          ไม่พบรายชื่อนักเรียนในระดับชั้นนี้ · กดปุ่ม "+ เพิ่มคนแทรก / บันทึกเดี่ยว" ด้านบนได้ครับ
        </div>
      `;
      this.updateQuickRecordSummary();
      return;
    }

    container.innerHTML = list.map((item, idx) => {
      const isPresent = item.present;
      const isPending = item.payMode === 'ค้างจ่าย';
      const isTransfer = item.payMode === 'เงินโอน';
      const isCash = item.payMode === 'เงินสด';

      return `
        <div class="rounded-2xl p-3.5 transition-all select-none flex flex-col justify-between ${
          isPresent ? 'stu-card-active' : 'stu-card-idle'
        }">
          <!-- Top Clickable Area: Toggles Attendance -->
          <div onclick="App.toggleStudentAttendance(${idx})" class="flex items-center justify-between gap-2 cursor-pointer">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition flex-shrink-0 ${
                isPresent
                  ? 'bg-emerald-500 text-zinc-950 shadow-sm shadow-emerald-500/30'
                  : 'border-2 border-slate-300 dark:border-zinc-700 text-transparent'
              }">
                ✓
              </div>
              <div class="truncate">
                <div class="font-bold text-sm text-slate-900 dark:text-zinc-100 truncate">${item.name}</div>
                <div class="text-[10px] text-slate-400 dark:text-zinc-400 font-medium">${item.grade || 'ไม่ระบุชั้น'}</div>
              </div>
            </div>

            <!-- Price Badge (When Idle) or Editable Price Input (When Present) -->
            ${!isPresent ? `
              <span class="text-xs font-bold text-slate-400 dark:text-zinc-500 whitespace-nowrap">฿${item.amount}</span>
            ` : `
              <div onclick="event.stopPropagation()" class="flex items-center bg-slate-100 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg px-2 py-0.5">
                <span class="text-[10px] text-emerald-500 font-bold mr-0.5">฿</span>
                <input type="number" value="${item.amount}" step="25" min="0"
                  onchange="App.updateSessionStudentAmount(${idx}, this.value)"
                  class="w-14 text-right text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-transparent focus:outline-none">
              </div>
            `}
          </div>

          <!-- Progressive Disclosure: 1-Tap Status & Payment Selector (Shown ONLY when present!) -->
          ${isPresent ? `
            <div class="mt-3 pt-2.5 border-t border-emerald-500/20 grid grid-cols-3 gap-1.5">
              <button type="button" onclick="App.setSessionStudentPayMode(${idx}, 'ค้างจ่าย')"
                class="py-1.5 px-1.5 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 ${
                  isPending
                    ? 'bg-amber-500 text-zinc-950 shadow-sm'
                    : 'bg-slate-100 dark:bg-zinc-800/80 text-slate-500 dark:text-zinc-400 hover:text-amber-400'
                }">
                ⏳ ค้าง
              </button>
              <button type="button" onclick="App.setSessionStudentPayMode(${idx}, 'เงินโอน')"
                class="py-1.5 px-1.5 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 ${
                  isTransfer
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-zinc-800/80 text-slate-500 dark:text-zinc-400 hover:text-blue-400'
                }">
                📱 โอน
              </button>
              <button type="button" onclick="App.setSessionStudentPayMode(${idx}, 'เงินสด')"
                class="py-1.5 px-1.5 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 ${
                  isCash
                    ? 'bg-emerald-500 text-zinc-950 shadow-sm'
                    : 'bg-slate-100 dark:bg-zinc-800/80 text-slate-500 dark:text-zinc-400 hover:text-emerald-400'
                }">
                💵 สด
              </button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    this.updateQuickRecordSummary();
  },

  toggleStudentAttendance: function(idx) {
    const item = this.state.sessionStudents[idx];
    if (!item) return;
    item.present = !item.present;
    this.renderQuickRecordCards();
  },

  setSessionStudentPayMode: function(idx, mode) {
    const item = this.state.sessionStudents[idx];
    if (!item) return;
    item.payMode = mode;
    this.renderQuickRecordCards();
  },

  updateSessionStudentAmount: function(idx, val) {
    const item = this.state.sessionStudents[idx];
    if (!item) return;
    item.amount = Number(val) || 0;
    this.updateQuickRecordSummary();
  },

  setAllPresent: function(present) {
    this.state.sessionStudents.forEach(s => s.present = present);
    this.renderQuickRecordCards();
  },

  updateQuickRecordSummary: function() {
    const presentList = this.state.sessionStudents.filter(s => s.present);
    const count = presentList.length;
    const total = presentList.reduce((s, c) => s + (Number(c.amount) || 0), 0);

    const countEl = document.getElementById('session-count');
    const totalEl = document.getElementById('session-total-amount');
    const saveBtn = document.getElementById('btn-save-session');

    if (countEl) countEl.textContent = `${count} คน`;
    if (totalEl) totalEl.textContent = `฿${total.toLocaleString()}`;
    if (saveBtn) {
      saveBtn.textContent = count > 0 ? `💾 บันทึกการสอน (${count} คน · ฿${total.toLocaleString()})` : '💾 บันทึกการสอน';
      if (count > 0) {
        saveBtn.classList.remove('opacity-50');
      } else {
        saveBtn.classList.add('opacity-50');
      }
    }
  },

  saveSessionRecords: function() {
    const presentList = this.state.sessionStudents.filter(s => s.present);
    if (presentList.length === 0) {
      this.showToast('กรุณาแตะเลือกนักเรียนที่มาเรียนอย่างน้อย 1 คน', 'error');
      return;
    }

    const dateVal = this.state.recordDate || getTodayISO();
    const yearVal = dateVal.split('-')[0];
    const monthVal = getThaiMonth(dateVal);
    const sessionGroup = this.state.recordGroup || 'วันอื่น_ๆ';

    const newTxList = presentList.map((item, idx) => {
      const isPending = item.payMode === 'ค้างจ่าย';
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
        status: isPending ? 'ค้างจ่าย' : 'จ่ายแล้ว',
        paymentMethod: isPending ? '-' : item.payMode,
        firebaseId: 'local_' + Math.random().toString(36).substr(2, 9)
      };
    });

    this.state.transactions.unshift(...newTxList);
    this.saveData(false);

    // Reset attendance selection after saving
    this.state.sessionStudents.forEach(s => s.present = false);
    this.renderQuickRecordCards();

    const sumAmt = newTxList.reduce((s, c) => s + c.amount, 0);
    this.showToast(`บันทึกเรียบร้อย ${newTxList.length} คน (รวม ฿${sumAmt.toLocaleString()}) 🎉`, 'success');
  },

  // Single / Extra Student Modal
  openSingleRecordModal: function() {
    document.getElementById('single-student-name').value = '';
    document.getElementById('single-date').value = this.state.recordDate || getTodayISO();
    document.getElementById('single-grade').value = this.state.recordGrade !== 'all' ? this.state.recordGrade : 'ม.4';
    document.getElementById('single-amount').value = 200;

    const grpSelect = document.getElementById('single-group');
    if (grpSelect) {
      grpSelect.innerHTML = this.state.groups.map(g =>
        `<option value="${g.name}" ${g.name === this.state.recordGroup ? 'selected' : ''}>${g.name}</option>`
      ).join('') + `<option value="วันอื่น_ๆ">วันอื่น ๆ</option>`;
    }

    // Populate datalist for autocomplete
    const dataList = document.getElementById('students-datalist');
    if (dataList) {
      dataList.innerHTML = this.state.students.map(s => `<option value="${s.name}">${s.grade || ''}</option>`).join('');
    }

    this.setSinglePayMode('ค้างจ่าย');
    const modal = document.getElementById('single-record-modal');
    if (modal) modal.classList.remove('hidden');
  },

  closeSingleRecordModal: function() {
    const modal = document.getElementById('single-record-modal');
    if (modal) modal.classList.add('hidden');
  },

  onSingleStudentInput: function(val) {
    const match = this.state.students.find(s => s.name.toLowerCase() === val.trim().toLowerCase());
    if (match) {
      document.getElementById('single-grade').value = match.grade || '';
      document.getElementById('single-amount').value = match.defaultFee || 200;
    }
  },

  setSinglePayMode: function(mode) {
    this.state.singlePayMode = mode;
    ['ค้างจ่าย', 'เงินโอน', 'เงินสด'].forEach(m => {
      const btn = document.getElementById('single-pay-' + m);
      if (btn) {
        if (m === mode) {
          btn.className = 'py-2 px-3 rounded-xl text-xs font-bold bg-emerald-500 text-zinc-950 shadow-sm transition';
        } else {
          btn.className = 'py-2 px-3 rounded-xl text-xs font-medium surface-elevated text-slate-500 dark:text-zinc-400 transition';
        }
      }
    });
  },

  saveSingleRecordModal: function(mode) {
    const name = document.getElementById('single-student-name').value.trim();
    if (!name) {
      this.showToast('กรุณาระบุชื่อนักเรียน', 'error');
      return;
    }
    const dateVal = document.getElementById('single-date').value || getTodayISO();
    const gradeVal = document.getElementById('single-grade').value.trim();
    const groupVal = document.getElementById('single-group').value || 'วันอื่น_ๆ';
    const amountVal = Number(document.getElementById('single-amount').value) || 200;
    const payMode = this.state.singlePayMode || 'ค้างจ่าย';

    // Ensure student exists in master list
    if (!this.state.students.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      this.state.students.push({
        id: 'stu_' + Date.now(),
        name: name,
        grade: gradeVal,
        group: groupVal,
        defaultFee: amountVal
      });
    }

    if (mode === 'add-to-grid') {
      // Just add to current session attendance grid
      this.state.sessionStudents.unshift({
        id: 'stu_' + Date.now(),
        name: name,
        grade: gradeVal,
        group: groupVal,
        amount: amountVal,
        present: true,
        payMode: payMode
      });
      this.closeSingleRecordModal();
      this.renderQuickRecordCards();
      this.showToast(`เพิ่ม "${name}" เข้าในรอบเช็คชื่อนี้แล้ว`, 'info');
      return;
    }

    // Immediately save transaction
    const isPending = payMode === 'ค้างจ่าย';
    const newTx = {
      id: 'tx_' + Date.now(),
      seq: this.state.transactions.length + 1,
      date: dateVal,
      year: dateVal.split('-')[0],
      month: getThaiMonth(dateVal),
      group: groupVal,
      grade: gradeVal,
      studentName: name,
      amount: amountVal,
      status: isPending ? 'ค้างจ่าย' : 'จ่ายแล้ว',
      paymentMethod: isPending ? '-' : payMode,
      firebaseId: 'local_' + Math.random().toString(36).substr(2, 9)
    };

    this.state.transactions.unshift(newTx);
    this.saveData(false);
    this.closeSingleRecordModal();
    this.render();
    this.showToast(`บันทึก "${name}" (฿${amountVal.toLocaleString()}) เรียบร้อย 🎉`, 'success');
  },

  // ==================== ⚠️ TAB 2: UNPAID TRACKER & SLIP STUDIO ====================
  getUnpaidStudentsData: function() {
    const pendingTxs = this.state.transactions.filter(t => t.status === 'ค้างจ่าย');
    const map = {};

    pendingTxs.forEach(tx => {
      const name = tx.studentName || 'ไม่ระบุชื่อ';
      if (!map[name]) {
        const profile = this.state.students.find(s => s.name === name);
        map[name] = {
          name: name,
          grade: tx.grade || (profile ? profile.grade : '') || '-',
          group: tx.group || (profile ? profile.group : '') || '-',
          totalAmount: 0,
          transactions: []
        };
      }
      map[name].totalAmount += (Number(tx.amount) || 0);
      map[name].transactions.push(tx);
    });

    let studentList = Object.values(map);
    studentList.forEach(st => {
      st.transactions.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    });

    return {
      studentList,
      totalStudents: studentList.length,
      totalSessions: pendingTxs.length,
      totalAmount: pendingTxs.reduce((s, c) => s + (Number(c.amount) || 0), 0)
    };
  },

  renderUnpaidTracker: function() {
    const { studentList, totalStudents, totalSessions, totalAmount } = this.getUnpaidStudentsData();

    const elStu = document.getElementById('unpaid-stat-students');
    const elSes = document.getElementById('unpaid-stat-sessions');
    const elAmt = document.getElementById('unpaid-stat-amount');
    if (elStu) elStu.textContent = `${totalStudents} คน`;
    if (elSes) elSes.textContent = `${totalSessions} คาบ`;
    if (elAmt) elAmt.textContent = `฿${totalAmount.toLocaleString()}`;

    // Grade Chips
    const grades = ['all', ...Array.from(new Set(studentList.map(s => s.grade).filter(g => g && g !== '-')))];
    const chipContainer = document.getElementById('unpaid-grade-chips');
    if (chipContainer) {
      chipContainer.innerHTML = grades.map(g => {
        const active = this.state.unpaidGrade === g;
        return `
          <button type="button" onclick="App.setUnpaidGrade('${g}')"
            class="px-2.5 py-1 rounded-lg text-xs font-bold transition ${
              active
                ? 'bg-amber-500 text-zinc-950'
                : 'surface-elevated text-slate-500 dark:text-zinc-400'
            }">
            ${g === 'all' ? 'ทุกชั้น' : g}
          </button>
        `;
      }).join('');
    }

    let filtered = studentList.filter(s => {
      if (this.state.unpaidGrade !== 'all' && s.grade !== this.state.unpaidGrade) return false;
      if (this.state.unpaidSearch) {
        return s.name.toLowerCase().includes(this.state.unpaidSearch.toLowerCase());
      }
      return true;
    });

    const sort = this.state.unpaidSort;
    filtered.sort((a, b) => {
      if (sort === 'amount-desc') return b.totalAmount - a.totalAmount;
      if (sort === 'amount-asc') return a.totalAmount - b.totalAmount;
      if (sort === 'count-desc') return b.transactions.length - a.transactions.length;
      return a.name.localeCompare(b.name, 'th');
    });

    const grid = document.getElementById('unpaid-students-grid');
    if (!grid) return;

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full surface-card p-12 text-center text-slate-400 dark:text-zinc-500 text-sm">
          🎉 ไม่มีรายการค้างชำระในหมวดที่เลือก
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map(st => {
      const safeName = encodeURIComponent(st.name);
      // Count total paid sessions in active months for context
      const allStuTxs = this.state.transactions.filter(t => t.studentName === st.name);
      const paidCount = allStuTxs.filter(t => t.status === 'จ่ายแล้ว').length;

      return `
        <div class="surface-card p-4 flex flex-col justify-between space-y-3 hover:border-amber-500/40 transition">
          <div>
            <!-- Student Header -->
            <div class="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-zinc-800">
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="font-bold text-base text-slate-900 dark:text-zinc-100">${st.name}</h3>
                  <span class="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">${st.grade}</span>
                </div>
                <p class="text-[11px] text-slate-400 dark:text-zinc-400 mt-0.5">
                  ค้างชำระ <strong class="amber-high-contrast text-amber-600">${st.transactions.length} คาบ</strong> · (จ่ายแล้วสะสม ${paidCount} คาบ)
                </p>
              </div>
              <div class="text-right">
                <div class="text-lg font-black amber-high-contrast text-amber-600">฿${st.totalAmount.toLocaleString()}</div>
                <div class="text-[10px] text-slate-400">ยอดค้างรวม</div>
              </div>
            </div>

            <!-- Unpaid Sessions List with Individual 1-Click Pay -->
            <div class="mt-2.5 space-y-1.5 max-h-40 overflow-y-auto pr-1">
              ${st.transactions.map(tx => `
                <div class="flex items-center justify-between text-xs py-1 px-2 rounded-lg surface-elevated">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-slate-700 dark:text-zinc-200">${tx.date}</span>
                    <span class="text-[10px] text-slate-400">(${tx.group || '-'})</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="font-bold amber-high-contrast text-amber-600">฿${(Number(tx.amount) || 0).toLocaleString()}</span>
                    <button type="button" onclick="App.openQuickPayModal('${tx.id}')"
                      title="รับชำระเฉพาะคาบนี้"
                      class="px-1.5 py-0.5 text-[10px] font-bold rounded bg-emerald-500/15 hover:bg-emerald-500 text-emerald-400 hover:text-zinc-950 transition">
                      ✓ รับเงิน
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="pt-2.5 border-t border-slate-100 dark:border-zinc-800 space-y-2">
            <button type="button" onclick="App.openSlipModal(decodeURIComponent('${safeName}'))"
              class="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold rounded-xl shadow-md shadow-emerald-500/10 transition flex items-center justify-center gap-1.5">
              📸 สร้างใบแจ้งยอด (แสดงวันเรียน + สรุปยอดค้าง)
            </button>
            <div class="grid grid-cols-2 gap-2">
              <button type="button" onclick="App.copySlipText(decodeURIComponent('${safeName}'))"
                class="py-1.5 px-2 surface-elevated hover:border-slate-400 text-slate-600 dark:text-zinc-300 text-[11px] font-semibold rounded-lg transition">
                💬 คัดลอกข้อความ
              </button>
              <button type="button" onclick="App.markAllPaidForStudent(decodeURIComponent('${safeName}'))"
                class="py-1.5 px-2 bg-amber-500/15 hover:bg-amber-500/25 amber-high-contrast text-amber-700 border border-amber-500/30 text-[11px] font-bold rounded-lg transition">
                ✓ ปิดยอดทั้งหมด
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  setUnpaidGrade: function(g) {
    this.state.unpaidGrade = g;
    this.renderUnpaidTracker();
  },

  openSlipModal: function(studentName) {
    this.state.slipStudentName = studentName;
    this.renderSlipPreview();
    const modal = document.getElementById('slip-modal');
    if (modal) modal.classList.remove('hidden');
  },

  closeSlipModal: function() {
    const modal = document.getElementById('slip-modal');
    if (modal) modal.classList.add('hidden');
    this.state.slipStudentName = null;
  },

  setSlipMode: function(mode) {
    this.state.slipMode = mode;
    ['active-months', 'unpaid-only', 'recent-12'].forEach(m => {
      const btn = document.getElementById('slip-mode-' + m);
      if (btn) {
        if (m === mode) {
          btn.className = 'px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-500 text-zinc-950 transition';
        } else {
          btn.className = 'px-2.5 py-1.5 rounded-lg text-[11px] font-medium surface-elevated text-slate-500 dark:text-zinc-400 transition';
        }
      }
    });
    this.renderSlipPreview();
  },

  toggleSlipBankInfo: function(checked) {
    this.state.slipShowBank = checked;
    this.renderSlipPreview();
  },

  renderSlipPreview: function() {
    const name = this.state.slipStudentName;
    if (!name || !window.SlipService) return;

    const { studentList } = this.getUnpaidStudentsData();
    let st = studentList.find(s => s.name === name);
    if (!st) {
      const profile = this.state.students.find(s => s.name === name);
      st = {
        name: name,
        grade: profile ? profile.grade : '-',
        group: profile ? profile.group : '-',
        totalAmount: 0,
        transactions: []
      };
    }

    window.SlipService.renderCanvas({
      canvas: document.getElementById('slip-canvas'),
      previewImg: document.getElementById('slip-preview-img'),
      student: st,
      allTransactions: this.state.transactions,
      mode: this.state.slipMode,
      paymentSettings: this.state.paymentSettings,
      showBankInfo: this.state.slipShowBank
    });
  },

  downloadSlipImage: function() {
    const canvas = document.getElementById('slip-canvas');
    if (!canvas || !window.SlipService) return;
    const studentName = this.state.slipStudentName || 'นักเรียน';
    const filename = `ใบแจ้งยอด_${studentName}.png`;

    const file = window.SlipService.currentFile;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({
        files: [file],
        title: `ใบแจ้งยอดค่าเรียน - ${studentName}`,
        text: `สรุปประวัติการเรียนและยอดค้างชำระของ ${studentName}`
      }).then(() => {
        this.showToast('แชร์/บันทึกรูปภาพเรียบร้อย 🎉', 'success');
      }).catch(err => {
        if (err.name !== 'AbortError') this.fallbackDownloadSlip(canvas, filename);
      });
      return;
    }
    this.fallbackDownloadSlip(canvas, filename);
  },

  fallbackDownloadSlip: function(canvas, filename) {
    const dataUrl = window.SlipService.currentDataUrl || canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => document.body.removeChild(link), 1000);
    this.showToast('ดาวน์โหลดรูปภาพเรียบร้อย', 'success');
  },

  copySlipImage: function() {
    const canvas = document.getElementById('slip-canvas');
    if (!canvas) return;
    const isTouch = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isTouch && window.SlipService && window.SlipService.currentFile && navigator.canShare && navigator.canShare({ files: [window.SlipService.currentFile] })) {
      this.downloadSlipImage();
      return;
    }

    if (navigator.clipboard && window.ClipboardItem && canvas.toBlob) {
      canvas.toBlob(blob => {
        if (!blob) return this.downloadSlipImage();
        navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          .then(() => this.showToast('คัดลอกรูปภาพแล้ว! กดวาง (Ctrl+V) ใน LINE ได้เลย', 'success'))
          .catch(() => this.downloadSlipImage());
      }, 'image/png');
    } else {
      this.downloadSlipImage();
    }
  },

  copySlipText: function(studentName) {
    const targetName = studentName || this.state.slipStudentName;
    if (!targetName) return;

    const displayTxs = window.SlipService.getSlipTransactions(targetName, this.state.transactions, this.state.slipMode);
    const unpaidTxs = displayTxs.filter(t => t.status === 'ค้างจ่าย');
    const paidTxs = displayTxs.filter(t => t.status === 'จ่ายแล้ว');
    const unpaidSum = unpaidTxs.reduce((s, c) => s + (Number(c.amount) || 0), 0);

    let text = `📢 สรุปประวัติการเรียนและแจ้งยอดค่าเรียน\n`;
    text += `นักเรียน: ${targetName}\n`;
    text += `------------------------------------\n`;
    displayTxs.forEach((tx, idx) => {
      const badge = tx.status === 'จ่ายแล้ว' ? '✓ จ่ายแล้ว' : '⏳ ค้างจ่าย';
      text += `${idx + 1}. ${tx.date} (${tx.group}): ฿${(Number(tx.amount) || 0).toLocaleString()} [${badge}]\n`;
    });
    text += `------------------------------------\n`;
    text += `รวมเรียน: ${displayTxs.length} คาบ (ชำระแล้ว ${paidTxs.length} คาบ / ค้างชำระ ${unpaidTxs.length} คาบ)\n`;
    text += `💰 ยอดค้างชำระที่ต้องโอนทั้งสิ้น: ฿${unpaidSum.toLocaleString()} บาท\n`;
    text += `ขอบพระคุณผู้ปกครองครับ/ค่ะ 🙏`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this.showToast(`คัดลอกข้อความแจ้งยอดของ ${targetName} แล้ว`, 'success');
      });
    }
  },

  markAllPaidForStudent: function(studentName) {
    const targetName = studentName || this.state.slipStudentName;
    const pending = this.state.transactions.filter(t => t.studentName === targetName && t.status === 'ค้างจ่าย');
    if (pending.length === 0) return;

    const sum = pending.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    this.openConfirmModal({
      title: 'ยืนยันการปิดยอดชำระทั้งหมด',
      message: `ต้องการเปลี่ยนสถานะค้างจ่ายทั้งหมดของ "${targetName}" (${pending.length} คาบ รวม ฿${sum.toLocaleString()}) เป็น "จ่ายแล้ว (เงินโอน)" ใช่หรือไม่?`,
      confirmText: '✓ ยืนยันรับชำระแล้ว',
      confirmClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
      onConfirm: () => {
        pending.forEach(t => {
          t.status = 'จ่ายแล้ว';
          if (!t.paymentMethod || t.paymentMethod === '-') t.paymentMethod = 'เงินโอน';
        });
        this.saveData(false);
        this.closeSlipModal();
        this.render();
        this.showToast(`ปิดยอดชำระของ ${targetName} เรียบร้อย 🎉`, 'success');
      }
    });
  },

  // ==================== 📋 TAB 3: UNIFIED HISTORY & CALENDAR ====================
  setHistoryViewMode: function(mode) {
    this.state.historyViewMode = mode;
    const btnTable = document.getElementById('btn-view-table');
    const btnCal = document.getElementById('btn-view-calendar');
    const secTable = document.getElementById('history-table-section');
    const secCal = document.getElementById('history-calendar-section');

    if (mode === 'table') {
      if (secTable) secTable.classList.remove('hidden');
      if (secCal) secCal.classList.add('hidden');
      if (btnTable) btnTable.className = 'px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-zinc-950 shadow-sm transition';
      if (btnCal) btnCal.className = 'px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-zinc-400 transition';
    } else {
      if (secTable) secTable.classList.add('hidden');
      if (secCal) secCal.classList.remove('hidden');
      if (btnCal) btnCal.className = 'px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-zinc-950 shadow-sm transition';
      if (btnTable) btnTable.className = 'px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-zinc-400 transition';
    }
    this.renderHistoryAndCalendar();
  },

  toggleAdvancedFilters: function() {
    this.state.showAdvancedFilters = !this.state.showAdvancedFilters;
    const panel = document.getElementById('advanced-filters-panel');
    if (panel) {
      if (this.state.showAdvancedFilters) panel.classList.remove('hidden');
      else panel.classList.add('hidden');
    }
  },

  renderHistoryAndCalendar: function() {
    if (this.state.historyViewMode === 'calendar') {
      this.renderCalendar();
    } else {
      this.renderTransactionsTable();
    }
  },

  getFilteredTransactions: function() {
    const f = this.state.filter;
    return this.state.transactions.filter(t => {
      if (f.year !== 'all' && t.year !== f.year) return false;
      if (f.month !== 'all' && t.month !== f.month) return false;
      if (f.group !== 'all' && t.group !== f.group) return false;
      if (f.grade !== 'all' && t.grade !== f.grade) return false;

      if (f.quickChip === 'pending' && t.status !== 'ค้างจ่าย') return false;
      if (f.quickChip === 'transfer' && (t.status !== 'จ่ายแล้ว' || t.paymentMethod !== 'เงินโอน')) return false;
      if (f.quickChip === 'cash' && (t.status !== 'จ่ายแล้ว' || t.paymentMethod !== 'เงินสด')) return false;

      if (f.search) {
        const q = f.search.toLowerCase();
        const matchName = (t.studentName || '').toLowerCase().includes(q);
        const matchGroup = (t.group || '').toLowerCase().includes(q);
        const matchDate = (t.date || '').includes(q);
        if (!matchName && !matchGroup && !matchDate) return false;
      }
      return true;
    });
  },

  setQuickChip: function(chip) {
    this.state.filter.quickChip = chip;
    this.state.page = 1;
    this.renderTransactionsTable();
  },

  resetFilters: function() {
    this.state.filter = {
      search: '',
      year: 'all',
      month: 'all',
      group: 'all',
      grade: 'all',
      quickChip: 'all'
    };
    const sInput = document.getElementById('filter-search');
    if (sInput) sInput.value = '';
    const mSel = document.getElementById('filter-month');
    if (mSel) mSel.value = 'all';
    const ySel = document.getElementById('filter-year');
    if (ySel) ySel.value = 'all';
    this.state.page = 1;
    this.renderTransactionsTable();
  },

  renderTransactionsTable: function() {
    const filtered = this.getFilteredTransactions();
    const totalAmt = filtered.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const paidAmt = filtered.filter(t => t.status === 'จ่ายแล้ว').reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const pendAmt = filtered.filter(t => t.status === 'ค้างจ่าย').reduce((s, c) => s + (Number(c.amount) || 0), 0);

    const elCount = document.getElementById('tx-filter-count');
    const elSum = document.getElementById('tx-filter-sum');
    const elPaid = document.getElementById('tx-filter-paid');
    const elPend = document.getElementById('tx-filter-pending');

    if (elCount) elCount.textContent = `${filtered.length} รายการ`;
    if (elSum) elSum.textContent = `฿${totalAmt.toLocaleString()}`;
    if (elPaid) elPaid.textContent = `฿${paidAmt.toLocaleString()}`;
    if (elPend) elPend.textContent = `฿${pendAmt.toLocaleString()}`;

    ['all', 'pending', 'transfer', 'cash'].forEach(c => {
      const btn = document.getElementById('chip-' + c);
      if (btn) {
        if (this.state.filter.quickChip === c) {
          btn.className = 'px-3 py-1 rounded-full text-xs font-bold bg-emerald-500 text-zinc-950 shadow-sm transition whitespace-nowrap';
        } else {
          btn.className = 'px-3 py-1 rounded-full text-xs font-medium surface-elevated text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 transition whitespace-nowrap';
        }
      }
    });

    // Populate Group filter dropdown
    const grpFilter = document.getElementById('filter-group');
    if (grpFilter && grpFilter.options.length <= 1) {
      const allGrps = Array.from(new Set(this.state.transactions.map(t => t.group).filter(Boolean)));
      grpFilter.innerHTML = `<option value="all">👥 ทุกกลุ่มเรียน</option>` +
        allGrps.map(g => `<option value="${g}">${g}</option>`).join('');
    }

    const totalPages = Math.ceil(filtered.length / this.state.pageSize) || 1;
    if (this.state.page > totalPages) this.state.page = 1;
    const startIdx = (this.state.page - 1) * this.state.pageSize;
    const pageItems = filtered.slice(startIdx, startIdx + this.state.pageSize);

    const tbody = document.getElementById('tx-table-body');
    if (!tbody) return;

    if (pageItems.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="py-12 text-center text-slate-400 dark:text-zinc-500">ไม่พบรายการที่ค้นหา</td></tr>`;
    } else {
      tbody.innerHTML = pageItems.map((tx, idx) => {
        const isPaid = tx.status === 'จ่ายแล้ว';
        return `
          <tr class="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition border-b border-slate-100 dark:border-zinc-800/60">
            <td class="py-2.5 px-3 text-slate-400 dark:text-zinc-500 font-mono text-[11px]">${startIdx + idx + 1}</td>
            <td class="py-2.5 px-3 whitespace-nowrap font-medium text-slate-700 dark:text-zinc-300">${tx.date}</td>
            <td class="py-2.5 px-3 whitespace-nowrap font-bold text-slate-900 dark:text-zinc-100">${tx.studentName}</td>
            <td class="py-2.5 px-3 whitespace-nowrap"><span class="px-2 py-0.5 rounded-md surface-elevated text-[11px] font-medium">${tx.grade || '-'}</span></td>
            <td class="py-2.5 px-3 whitespace-nowrap text-slate-500 dark:text-zinc-400">${tx.group || '-'}</td>
            <td class="py-2.5 px-3 whitespace-nowrap text-right font-bold ${isPaid ? 'text-emerald-500' : 'amber-high-contrast text-amber-600'}">฿${(Number(tx.amount) || 0).toLocaleString()}</td>
            <td class="py-2.5 px-3 whitespace-nowrap text-center">
              ${isPaid ? `
                <button onclick="App.toggleTxToPending('${tx.id}')" title="คลิกเพื่อสลับเป็นค้างจ่าย"
                  class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition">
                  ✓ ${tx.paymentMethod === 'เงินสด' ? 'สด' : 'โอน'}
                </button>
              ` : `
                <button onclick="App.openQuickPayModal('${tx.id}')"
                  class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 amber-high-contrast text-amber-600 border border-amber-500/30 hover:bg-amber-500/25 transition">
                  ⏳ ค้างจ่าย
                </button>
              `}
            </td>
            <td class="py-2.5 px-3 whitespace-nowrap text-center">
              <div class="flex items-center justify-center gap-1">
                <button onclick="App.openEditTxModal('${tx.id}')" class="p-1 rounded hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 transition" title="แก้ไข">✏️</button>
                <button onclick="App.deleteTx('${tx.id}')" class="p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition" title="ลบ">🗑️</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    // Pagination
    const pagEl = document.getElementById('tx-pagination');
    if (pagEl) {
      if (totalPages <= 1) {
        pagEl.innerHTML = '';
      } else {
        pagEl.innerHTML = `
          <div class="flex items-center justify-between pt-2 text-xs text-slate-500 dark:text-zinc-400">
            <span>หน้า ${this.state.page} จาก ${totalPages}</span>
            <div class="flex items-center gap-1.5">
              <button onclick="App.setPage(${this.state.page - 1})" ${this.state.page <= 1 ? 'disabled' : ''} class="px-3 py-1 rounded-lg surface-elevated disabled:opacity-40">◀ ก่อนหน้า</button>
              <button onclick="App.setPage(${this.state.page + 1})" ${this.state.page >= totalPages ? 'disabled' : ''} class="px-3 py-1 rounded-lg surface-elevated disabled:opacity-40">ถัดไป ▶</button>
            </div>
          </div>
        `;
      }
    }
  },

  setPage: function(p) {
    this.state.page = p;
    this.renderTransactionsTable();
  },

  // Quick Pay Modal (1-Tap Transfer or Cash)
  openQuickPayModal: function(txId) {
    const tx = this.state.transactions.find(t => t.id === txId);
    if (!tx) return;
    this.state.payingTxId = txId;
    document.getElementById('pay-modal-student').textContent = tx.studentName;
    document.getElementById('pay-modal-info').textContent = `${tx.date} · ${tx.group || '-'}`;
    document.getElementById('pay-modal-amount').textContent = `฿${(Number(tx.amount) || 0).toLocaleString()}`;
    const modal = document.getElementById('payment-method-modal');
    if (modal) modal.classList.remove('hidden');
  },

  closePaymentMethodModal: function() {
    this.state.payingTxId = null;
    const modal = document.getElementById('payment-method-modal');
    if (modal) modal.classList.add('hidden');
  },

  selectPaymentMethod: function(method) {
    const tx = this.state.transactions.find(t => t.id === this.state.payingTxId);
    if (tx) {
      tx.status = 'จ่ายแล้ว';
      tx.paymentMethod = method;
      this.saveData(false);
      this.render();
      this.showToast(`บันทึกการชำระเงิน (${tx.studentName} · ${method}) เรียบร้อย`, 'success');
    }
    this.closePaymentMethodModal();
  },

  toggleTxToPending: function(txId) {
    const tx = this.state.transactions.find(t => t.id === txId);
    if (!tx) return;
    tx.status = 'ค้างจ่าย';
    tx.paymentMethod = '-';
    this.saveData(false);
    this.render();
    this.showToast(`สลับรายการของ ${tx.studentName} เป็นค้างจ่าย`, 'info');
  },

  openEditTxModal: function(txId) {
    const tx = this.state.transactions.find(t => t.id === txId);
    if (!tx) return;
    this.state.editingTxId = txId;
    document.getElementById('edit-date').value = tx.date || '';
    document.getElementById('edit-student').value = tx.studentName || '';
    document.getElementById('edit-grade').value = tx.grade || '';
    document.getElementById('edit-group').value = tx.group || '';
    document.getElementById('edit-amount').value = tx.amount || 0;
    document.getElementById('edit-status').value = tx.status || 'จ่ายแล้ว';
    document.getElementById('edit-payment').value = tx.paymentMethod || 'เงินโอน';
    const modal = document.getElementById('edit-tx-modal');
    if (modal) modal.classList.remove('hidden');
  },

  closeEditModal: function() {
    this.state.editingTxId = null;
    const modal = document.getElementById('edit-tx-modal');
    if (modal) modal.classList.add('hidden');
  },

  saveEditTxModal: function() {
    const tx = this.state.transactions.find(t => t.id === this.state.editingTxId);
    if (!tx) return;
    const dVal = document.getElementById('edit-date').value;
    tx.date = dVal;
    tx.year = dVal ? dVal.split('-')[0] : tx.year;
    tx.month = getThaiMonth(dVal);
    tx.studentName = document.getElementById('edit-student').value.trim();
    tx.grade = document.getElementById('edit-grade').value.trim();
    tx.group = document.getElementById('edit-group').value.trim();
    tx.amount = Number(document.getElementById('edit-amount').value) || 0;
    tx.status = document.getElementById('edit-status').value;
    tx.paymentMethod = tx.status === 'ค้างจ่าย' ? '-' : document.getElementById('edit-payment').value;

    this.saveData(false);
    this.closeEditModal();
    this.render();
    this.showToast('บันทึกการแก้ไขเรียบร้อย', 'success');
  },

  deleteTx: function(txId) {
    const tx = this.state.transactions.find(t => t.id === txId);
    if (!tx) return;
    this.openConfirmModal({
      title: 'ลบรายการบันทึก',
      message: `ต้องการลบรายการของ "${tx.studentName}" วันที่ ${tx.date} (฿${tx.amount}) ใช่หรือไม่?`,
      confirmText: 'ลบรายการ',
      confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
      onConfirm: () => {
        this.state.transactions = this.state.transactions.filter(t => t.id !== txId);
        this.saveData(false);
        this.render();
        this.showToast('ลบรายการเรียบร้อย', 'info');
      }
    });
  },

  // Calendar View
  changeCalendarMonth: function(delta) {
    let m = this.state.calendarMonth + delta;
    let y = this.state.calendarYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    this.state.calendarMonth = m;
    this.state.calendarYear = y;
    this.renderCalendar();
  },

  setCalendarToday: function() {
    const now = new Date();
    this.state.calendarYear = now.getFullYear();
    this.state.calendarMonth = now.getMonth();
    this.renderCalendar();
  },

  renderCalendar: function() {
    const y = this.state.calendarYear;
    const m = this.state.calendarMonth;
    const titleEl = document.getElementById('calendar-month-title');
    if (titleEl) {
      titleEl.textContent = `📅 ${THAI_MONTHS_FULL[m]} ${y + 543} (${y})`;
    }

    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const todayIso = getTodayISO();

    const grid = document.getElementById('calendar-days-grid');
    if (!grid) return;

    let html = '';
    for (let i = 0; i < firstDay; i++) {
      html += `<div class="h-20 sm:h-24 rounded-xl bg-slate-100/40 dark:bg-zinc-900/30 border border-transparent"></div>`;
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayTxs = this.state.transactions.filter(t => t.date === iso);
      const total = dayTxs.reduce((s, c) => s + (Number(c.amount) || 0), 0);
      const hasUnpaid = dayTxs.some(t => t.status === 'ค้างจ่าย');
      const isToday = iso === todayIso;

      html += `
        <div onclick="App.openDayDetailModal('${iso}')"
          class="h-20 sm:h-24 rounded-xl p-1.5 sm:p-2 surface-card hover:border-emerald-500/50 transition cursor-pointer flex flex-col justify-between overflow-hidden ${
            isToday ? 'ring-2 ring-emerald-500' : ''
          }">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold ${isToday ? 'text-emerald-400' : 'text-slate-700 dark:text-zinc-300'}">${d}</span>
            ${dayTxs.length > 0 ? `<span class="text-[10px] px-1.5 rounded-full font-bold ${hasUnpaid ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}">${dayTxs.length} คน</span>` : ''}
          </div>
          ${dayTxs.length > 0 ? `
            <div>
              <div class="text-[10px] text-slate-400 dark:text-zinc-400 truncate">${dayTxs.map(t => t.studentName).join(', ')}</div>
              <div class="text-xs font-bold text-emerald-500 mt-0.5">฿${total.toLocaleString()}</div>
            </div>
          ` : `<div class="text-[10px] text-slate-300 dark:text-zinc-700">-</div>`}
        </div>
      `;
    }

    grid.innerHTML = html;
  },

  openDayDetailModal: function(isoDate) {
    this.state.selectedCalendarDate = isoDate;
    const dayTxs = this.state.transactions.filter(t => t.date === isoDate);
    const total = dayTxs.reduce((s, c) => s + (Number(c.amount) || 0), 0);

    document.getElementById('day-modal-date').textContent = `📅 รายการวันที่ ${isoDate}`;
    document.getElementById('day-modal-summary').textContent = `ผู้เรียน ${dayTxs.length} คน · ยอดรวม ฿${total.toLocaleString()}`;

    const listEl = document.getElementById('day-modal-list');
    if (dayTxs.length === 0) {
      listEl.innerHTML = `<div class="py-8 text-center text-slate-400 text-xs">ยังไม่มีรายการบันทึกในวันนี้</div>`;
    } else {
      listEl.innerHTML = dayTxs.map(tx => {
        const isPaid = tx.status === 'จ่ายแล้ว';
        return `
          <div class="flex items-center justify-between p-2.5 rounded-xl surface-elevated text-xs">
            <div>
              <span class="font-bold text-slate-900 dark:text-zinc-100">${tx.studentName}</span>
              <span class="text-[10px] text-slate-400 ml-1">(${tx.grade || '-'} · ${tx.group || '-'})</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-bold ${isPaid ? 'text-emerald-400' : 'amber-high-contrast text-amber-500'}">฿${tx.amount}</span>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${isPaid ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 amber-high-contrast'}">${tx.status}</span>
            </div>
          </div>
        `;
      }).join('');
    }

    const modal = document.getElementById('day-detail-modal');
    if (modal) modal.classList.remove('hidden');
  },

  closeDayDetailModal: function() {
    const modal = document.getElementById('day-detail-modal');
    if (modal) modal.classList.add('hidden');
  },

  jumpToQuickRecordForDate: function() {
    if (this.state.selectedCalendarDate) {
      this.state.recordDate = this.state.selectedCalendarDate;
    }
    this.closeDayDetailModal();
    this.switchTab('quick-record');
  },

  // ==================== 📊 TAB 4: ANALYTICS DASHBOARD ====================
  renderDashboard: function() {
    const y = this.state.dashYear;
    const m = this.state.dashMonth;

    const mSelect = document.getElementById('dash-month-select');
    const ySelect = document.getElementById('dash-year-select');
    if (mSelect) mSelect.value = m;
    if (ySelect) ySelect.value = y;

    const allPaid = this.state.transactions.filter(t => t.status === 'จ่ายแล้ว').reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const periodTxs = this.state.transactions.filter(t => {
      if (y !== 'all' && t.year !== y) return false;
      if (m !== 'all' && t.month !== m) return false;
      return true;
    });

    const periodTotal = periodTxs.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const periodTransfer = periodTxs.filter(t => t.status === 'จ่ายแล้ว' && t.paymentMethod === 'เงินโอน').reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const periodCash = periodTxs.filter(t => t.status === 'จ่ายแล้ว' && t.paymentMethod === 'เงินสด').reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const periodPendingTxs = periodTxs.filter(t => t.status === 'ค้างจ่าย');
    const periodPendingAmt = periodPendingTxs.reduce((s, c) => s + (Number(c.amount) || 0), 0);

    document.getElementById('dash-total-income').textContent = `฿${allPaid.toLocaleString()}`;
    document.getElementById('dash-month-income').textContent = `฿${periodTotal.toLocaleString()}`;
    document.getElementById('dash-month-transfer').textContent = `฿${periodTransfer.toLocaleString()}`;
    document.getElementById('dash-month-cash').textContent = `฿${periodCash.toLocaleString()}`;
    document.getElementById('dash-pending-amount').textContent = `฿${periodPendingAmt.toLocaleString()}`;

    // Grade revenue breakdown in period
    const gradeMap = {};
    periodTxs.forEach(t => {
      const g = t.grade || 'ไม่ระบุชั้น';
      gradeMap[g] = (gradeMap[g] || 0) + (Number(t.amount) || 0);
    });
    const gradeEntries = Object.entries(gradeMap).sort((a, b) => b[1] - a[1]);
    const gradeListEl = document.getElementById('dash-grade-breakdown');
    if (gradeListEl) {
      if (gradeEntries.length === 0) {
        gradeListEl.innerHTML = `<div class="py-6 text-center text-slate-400 text-xs">ไม่มีข้อมูลในช่วงเวลานี้</div>`;
      } else {
        gradeListEl.innerHTML = gradeEntries.map(([g, amt]) => {
          const pct = periodTotal > 0 ? Math.round((amt / periodTotal) * 100) : 0;
          return `
            <div class="py-2">
              <div class="flex justify-between text-xs mb-1">
                <span class="font-bold text-slate-700 dark:text-zinc-200">ชั้น ${g}</span>
                <span class="font-bold text-emerald-400">฿${amt.toLocaleString()} (${pct}%)</span>
              </div>
              <div class="w-full h-1.5 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div class="h-full bg-emerald-500 rounded-full" style="width: ${pct}%"></div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    this.renderCharts();
  },

  renderCharts: function() {
    const canvas = document.getElementById('chart-monthly-trend');
    if (!canvas || typeof Chart === 'undefined') return;

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#a1a1aa' : '#64748b';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

    const data2025 = THAI_MONTHS.map(m =>
      this.state.transactions
        .filter(t => t.year === '2025' && t.month === m)
        .reduce((s, c) => s + (Number(c.amount) || 0), 0)
    );

    const data2026 = THAI_MONTHS.map(m =>
      this.state.transactions
        .filter(t => t.year === '2026' && t.month === m)
        .reduce((s, c) => s + (Number(c.amount) || 0), 0)
    );

    if (this.charts.trend) {
      this.charts.trend.destroy();
    }

    this.charts.trend = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: THAI_MONTHS,
        datasets: [
          {
            label: 'ปี 2025',
            data: data2025,
            backgroundColor: isDark ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.5)',
            borderRadius: 6
          },
          {
            label: 'ปี 2026',
            data: data2026,
            backgroundColor: '#10b981',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: textColor, font: { family: 'Prompt', size: 11 } } }
        },
        scales: {
          x: { ticks: { color: textColor, font: { family: 'Prompt', size: 10 } }, grid: { display: false } },
          y: { ticks: { color: textColor, font: { family: 'Prompt', size: 10 } }, grid: { color: gridColor } }
        }
      }
    });
  },

  // ==================== 👥 TAB 5: STUDENTS & GROUPS (WITH HISTORY RENAME CASCADE) ====================
  setMasterGradeFilter: function(g) {
    this.state.masterGradeFilter = g;
    this.renderMaster();
  },

  renderMaster: function() {
    // Grade Filter Chips
    const chipContainer = document.getElementById('master-grade-chips');
    if (chipContainer) {
      const grades = ['all', ...this.getGradeList()];
      chipContainer.innerHTML = grades.map(g => {
        const active = this.state.masterGradeFilter === g;
        return `
          <button type="button" onclick="App.setMasterGradeFilter('${g}')"
            class="px-3 py-1 rounded-full text-xs font-bold transition ${
              active
                ? 'bg-emerald-500 text-zinc-950'
                : 'surface-elevated text-slate-500 dark:text-zinc-400'
            }">
            ${g === 'all' ? 'ทั้งหมด (' + this.state.students.length + ')' : g}
          </button>
        `;
      }).join('');
    }

    const stuContainer = document.getElementById('master-students-list');
    if (stuContainer) {
      const q = (this.state.masterSearch || '').toLowerCase();
      const filtered = this.state.students.filter(s => {
        if (this.state.masterGradeFilter !== 'all' && (s.grade || '').trim() !== this.state.masterGradeFilter) return false;
        if (q && !s.name.toLowerCase().includes(q)) return false;
        return true;
      });

      stuContainer.innerHTML = filtered.map(s => {
        const stuTxs = this.state.transactions.filter(t => t.studentName === s.name);
        const unpaidAmt = stuTxs.filter(t => t.status === 'ค้างจ่าย').reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
        return `
          <div class="surface-elevated p-3.5 rounded-xl flex items-center justify-between gap-2">
            <div>
              <div class="flex items-center gap-2">
                <span class="font-bold text-sm text-slate-900 dark:text-zinc-100">${s.name}</span>
                <span class="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-500/15 text-emerald-400">${s.grade || '-'}</span>
                <span class="text-xs font-bold text-slate-500 dark:text-zinc-400">฿${s.defaultFee || 200}/คาบ</span>
              </div>
              <div class="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">
                ประวัติเรียน ${stuTxs.length} คาบ ${unpaidAmt > 0 ? `· <span class="amber-high-contrast font-bold">ค้าง ฿${unpaidAmt.toLocaleString()}</span>` : ''}
              </div>
            </div>
            <div class="flex items-center gap-1">
              <button onclick="App.openStudentModal('${s.id}')" class="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-700 text-xs transition" title="แก้ไข">✏️</button>
              <button onclick="App.deleteStudent('${s.id}')" class="p-1.5 rounded-lg hover:bg-red-500/20 text-xs text-red-400 transition" title="ลบ">🗑️</button>
            </div>
          </div>
        `;
      }).join('');
    }

    const grpContainer = document.getElementById('master-groups-list');
    if (grpContainer) {
      grpContainer.innerHTML = this.state.groups.map(g => `
        <div class="surface-elevated p-3 rounded-xl flex items-center justify-between">
          <span class="font-semibold text-xs text-slate-800 dark:text-zinc-200">👥 ${g.name}</span>
          <button onclick="App.deleteGroup('${g.id}')" class="text-xs text-slate-400 hover:text-red-400 p-1">🗑️</button>
        </div>
      `).join('');
    }
  },

  openStudentModal: function(stuId) {
    this.state.editingStudentId = stuId;
    const titleEl = document.getElementById('student-modal-title');
    const nameInput = document.getElementById('student-modal-name');
    const gradeInput = document.getElementById('student-modal-grade');
    const feeInput = document.getElementById('student-modal-fee');
    const cascadeWrap = document.getElementById('student-cascade-wrap');
    const cascadeCheck = document.getElementById('student-cascade-history');

    if (stuId) {
      const s = this.state.students.find(x => x.id === stuId);
      if (!s) return;
      this.state.editingStudentOriginalName = s.name;
      titleEl.textContent = 'แก้ไขข้อมูลนักเรียน';
      nameInput.value = s.name;
      gradeInput.value = s.grade || '';
      feeInput.value = s.defaultFee || 200;
      if (cascadeWrap) cascadeWrap.classList.remove('hidden');
      if (cascadeCheck) cascadeCheck.checked = true;
    } else {
      this.state.editingStudentOriginalName = null;
      titleEl.textContent = 'เพิ่มนักเรียนใหม่';
      nameInput.value = '';
      gradeInput.value = this.state.recordGrade !== 'all' ? this.state.recordGrade : 'ม.4';
      feeInput.value = 200;
      if (cascadeWrap) cascadeWrap.classList.add('hidden');
    }

    const modal = document.getElementById('student-dialog-modal');
    if (modal) modal.classList.remove('hidden');
  },

  closeStudentModal: function() {
    this.state.editingStudentId = null;
    this.state.editingStudentOriginalName = null;
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
    const cascadeCheck = document.getElementById('student-cascade-history');
    const shouldCascade = cascadeCheck ? cascadeCheck.checked : false;

    if (this.state.editingStudentId) {
      const s = this.state.students.find(x => x.id === this.state.editingStudentId);
      if (s) {
        const oldName = this.state.editingStudentOriginalName || s.name;
        s.name = name;
        s.grade = grade;
        s.defaultFee = fee;

        let updatedCount = 0;
        if (shouldCascade && oldName) {
          this.state.transactions.forEach(t => {
            if (t.studentName === oldName) {
              t.studentName = name;
              if (grade) t.grade = grade;
              updatedCount++;
            }
          });
        }

        this.showToast(
          updatedCount > 0
            ? `อัปเดต "${name}" และเปลี่ยนชื่อในประวัติเดิม ${updatedCount} รายการแล้ว`
            : `อัปเดตข้อมูล "${name}" เรียบร้อย`,
          'success'
        );
      }
    } else {
      this.state.students.push({
        id: 'stu_' + Date.now(),
        name: name,
        grade: grade,
        defaultFee: fee
      });
      this.showToast(`เพิ่มนักเรียน "${name}" เรียบร้อย`, 'success');
    }

    this.saveData(false);
    this.closeStudentModal();
    this.populateSessionStudents();
    this.render();
  },

  deleteStudent: function(stuId) {
    const s = this.state.students.find(x => x.id === stuId);
    if (!s) return;
    this.openConfirmModal({
      title: 'ลบรายชื่อนักเรียน',
      message: `ต้องการลบ "${s.name}" ออกจากรายชื่อเช็คชื่อหรือไม่? (ประวัติการเรียนเดิมจะไม่ถูกลบ)`,
      confirmText: 'ลบรายชื่อ',
      confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
      onConfirm: () => {
        this.state.students = this.state.students.filter(x => x.id !== stuId);
        this.saveData(false);
        this.populateSessionStudents();
        this.render();
        this.showToast(`ลบ "${s.name}" เรียบร้อย`, 'info');
      }
    });
  },

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
    if (!name) return;
    this.state.groups.push({ id: 'grp_' + Date.now(), name });
    this.saveData(false);
    this.closeGroupModal();
    this.render();
    this.showToast(`เพิ่มกลุ่ม "${name}" เรียบร้อย`, 'success');
  },

  deleteGroup: function(grpId) {
    this.state.groups = this.state.groups.filter(g => g.id !== grpId);
    this.saveData(false);
    this.render();
    this.showToast('ลบกลุ่มเรียนแล้ว', 'info');
  },

  // ==================== ⚙️ SETTINGS & DATA DRAWER ====================
  openSettingsDrawer: function() {
    document.getElementById('bank-acc-name').value = this.state.paymentSettings.accountName || '';
    document.getElementById('bank-name').value = this.state.paymentSettings.bankName || '';
    document.getElementById('bank-acc-no').value = this.state.paymentSettings.accountNumber || '';
    document.getElementById('bank-promptpay').value = this.state.paymentSettings.promptPay || '';

    const modal = document.getElementById('settings-drawer-modal');
    if (modal) modal.classList.remove('hidden');
  },

  closeSettingsDrawer: function() {
    const modal = document.getElementById('settings-drawer-modal');
    if (modal) modal.classList.add('hidden');
  },

  savePaymentSettings: function() {
    this.state.paymentSettings = {
      accountName: document.getElementById('bank-acc-name').value.trim(),
      bankName: document.getElementById('bank-name').value.trim(),
      accountNumber: document.getElementById('bank-acc-no').value.trim(),
      promptPay: document.getElementById('bank-promptpay').value.trim()
    };
    this.saveData(false);
    this.showToast('บันทึกข้อมูลบัญชีรับเงินเรียบร้อย', 'success');
  },

  exportExcel: function() {
    if (window.ExportService) {
      window.ExportService.exportToExcel({
        transactions: this.state.transactions,
        students: this.state.students,
        groups: this.state.groups
      });
      this.showToast('ส่งออกไฟล์ Excel (.xlsx) เรียบร้อย', 'success');
    }
  },

  exportCSV: function() {
    if (window.ExportService) {
      window.ExportService.exportToCSV({
        transactions: this.state.transactions
      });
      this.showToast('ส่งออกไฟล์ CSV สำหรับ Google Sheets เรียบร้อย', 'success');
    }
  },

  // Confirm Dialog
  openConfirmModal: function({ title, message, confirmText, confirmClass, onConfirm }) {
    document.getElementById('confirm-modal-title').textContent = title || 'ยืนยัน';
    document.getElementById('confirm-modal-message').textContent = message || '';
    const btn = document.getElementById('confirm-modal-action-btn');
    btn.textContent = confirmText || 'ยืนยัน';
    btn.className = `px-4 py-2 text-xs font-bold rounded-xl shadow-sm ${confirmClass || 'bg-emerald-600 text-white'}`;
    this.state.confirmCallback = onConfirm;
    document.getElementById('confirm-dialog-modal').classList.remove('hidden');
  },

  closeConfirmModal: function() {
    this.state.confirmCallback = null;
    document.getElementById('confirm-dialog-modal').classList.add('hidden');
  },

  executeConfirmModalAction: function() {
    if (typeof this.state.confirmCallback === 'function') {
      this.state.confirmCallback();
    }
    this.closeConfirmModal();
  },

  showToast: function(message, type = 'info') {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-msg');
    if (!toast || !msgEl) return;
    msgEl.textContent = message;
    toast.className = `fixed bottom-20 md:bottom-6 right-5 z-50 flex items-center gap-2 px-4 py-3 text-xs font-bold rounded-xl shadow-2xl transition-all ${
      type === 'success'
        ? 'bg-emerald-500 text-zinc-950'
        : type === 'error'
        ? 'bg-red-600 text-white'
        : 'bg-zinc-800 text-zinc-100 border border-zinc-700'
    }`;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-8', 'pointer-events-none');
    }, 3200);
  },

  bindEvents: function() {
    const dateInput = document.getElementById('record-date-input');
    if (dateInput) {
      dateInput.addEventListener('change', (e) => {
        this.state.recordDate = e.target.value;
      });
    }

    const grpSelect = document.getElementById('record-group-select');
    if (grpSelect) {
      grpSelect.addEventListener('change', (e) => {
        this.state.recordGroup = e.target.value;
        this.state.sessionStudents.forEach(s => s.group = e.target.value);
      });
    }

    const importInput = document.getElementById('excel-import-file');
    if (importInput) {
      importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file || !window.ExportService) return;
        window.ExportService.importFromExcel(file, (err, res) => {
          if (err) {
            this.showToast('นำเข้าไฟล์ไม่สำเร็จ: ' + err.message, 'error');
            return;
          }
          this.openConfirmModal({
            title: 'นำเข้าข้อมูลจากไฟล์ Excel',
            message: `พบรายการสอน ${res.transactions.length} รายการ ต้องการนำเข้าสู่ระบบ v.4 หรือไม่?`,
            confirmText: 'นำเข้าข้อมูล',
            confirmClass: 'bg-emerald-600 text-white',
            onConfirm: () => {
              this.state.transactions = res.transactions;
              if (res.students.length > 0) this.state.students = res.students;
              if (res.groups.length > 0) this.state.groups = res.groups;
              this.normalizeData();
              this.saveData(false);
              this.populateSessionStudents();
              this.render();
              this.closeSettingsDrawer();
              this.showToast(`นำเข้าสำเร็จ ${res.transactions.length} รายการ 🎉`, 'success');
            }
          });
        });
      });
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
