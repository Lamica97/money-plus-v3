// Money Plus v.4 - Firebase Realtime Database Service (Isolated Node: money_plus_v4)
// Supports 1-click Live Migration / Pull from money_plus_v3 without affecting v.3

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCUUhACcQ-eZq_yWRPxx_nwH8MgTLbB8XM",
  authDomain: "money-plus-v3.firebaseapp.com",
  databaseURL: "https://money-plus-v3-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "money-plus-v3",
  storageBucket: "money-plus-v3.firebasestorage.app",
  messagingSenderId: "165718163790",
  appId: "1:165718163790:web:588a0d1bfa0dc76ef8de1f",
  measurementId: "G-Q2Y1ME9252"
};

const DB_NODE_V4 = 'money_plus_v4';
const DB_NODE_V3 = 'money_plus_v3';

const FirebaseService = {
  db: null,
  app: null,
  isConnectedToCloud: false,
  lastCloudUpdate: null,
  isSyncing: false,
  onDataChangeCallback: null,
  onStatusChangeCallback: null,
  isInitialLoadDone: false,

  init: function(onDataChange, onStatusChange) {
    this.onDataChangeCallback = onDataChange;
    this.onStatusChangeCallback = onStatusChange;

    if (typeof firebase === 'undefined') {
      console.warn('Firebase SDK not loaded, working in LocalStorage offline mode');
      this.updateStatus(false, 'โหมดออฟไลน์ (ไม่มี SDK)');
      return false;
    }

    try {
      if (!firebase.apps.length) {
        this.app = firebase.initializeApp(FIREBASE_CONFIG);
      } else {
        this.app = firebase.app();
      }

      this.db = firebase.database();

      this.db.ref('.info/connected').on('value', (snap) => {
        const connected = snap.val() === true;
        this.isConnectedToCloud = connected;
        this.updateStatus(connected, connected ? 'ออนไลน์ (Realtime v.4)' : 'ออฟไลน์ (บันทึกในเครื่อง)');
      });

      this.listenToCloudData();
      return true;
    } catch (err) {
      console.error('Firebase init error:', err);
      this.updateStatus(false, 'เชื่อมต่อไม่สำเร็จ');
      return false;
    }
  },

  updateStatus: function(connected, message) {
    this.isConnectedToCloud = connected;
    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback({
        connected: connected,
        message: message,
        lastCloudUpdate: this.lastCloudUpdate
      });
    }
  },

  listenToCloudData: function() {
    if (!this.db) return;

    const dataRef = this.db.ref(DB_NODE_V4);
    dataRef.on('value', async (snapshot) => {
      const data = snapshot.val();
      this.isInitialLoadDone = true;

      if (!data) {
        console.log('[v.4] money_plus_v4 node is empty. Auto-cloning initial data from money_plus_v3...');
        try {
          const v3Snap = await this.db.ref(DB_NODE_V3).once('value');
          const v3Data = v3Snap.val();
          if (v3Data && v3Data.transactions) {
            await this.saveData(v3Data);
            return;
          }
        } catch (e) {
          console.warn('[v.4] Could not read money_plus_v3, falling back to local dataset', e);
        }
        if (this.onDataChangeCallback) {
          this.onDataChangeCallback(null, true);
        }
        return;
      }

      this.lastCloudUpdate = data.lastUpdated || new Date().toISOString();
      if (this.onDataChangeCallback) {
        this.onDataChangeCallback(data, false);
      }
    }, (error) => {
      console.error('Firebase v4 read error:', error);
      this.updateStatus(false, 'อ่านคลาวด์ไม่สำเร็จ (ตรวจ Rules)');
    });
  },

  saveData: async function(payload) {
    if (!this.db) return false;

    try {
      this.isSyncing = true;
      const cleanPayload = {
        transactions: payload.transactions || [],
        students: payload.students || [],
        groups: payload.groups || [],
        paymentSettings: payload.paymentSettings || {},
        lastUpdated: payload.lastUpdated || new Date().toISOString()
      };

      await this.db.ref(DB_NODE_V4).set(cleanPayload);
      this.lastCloudUpdate = cleanPayload.lastUpdated;
      this.isSyncing = false;
      this.updateStatus(true, 'ซิงค์คลาวด์ v.4 เรียบร้อย');
      return true;
    } catch (err) {
      this.isSyncing = false;
      console.error('Firebase v4 save error:', err);
      this.updateStatus(false, 'ซิงค์ไม่สำเร็จ');
      return false;
    }
  },

  pullFromV3Cloud: async function() {
    if (!this.db) return null;
    try {
      const snap = await this.db.ref(DB_NODE_V3).once('value');
      return snap.val();
    } catch (err) {
      console.error('Error pulling from v3:', err);
      return null;
    }
  }
};

window.FirebaseService = FirebaseService;
