// Money Plus v.3 - Firebase Realtime Database Service
// Handles real-time cloud synchronization, connection status, and offline caching

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

const FirebaseService = {
  db: null,
  app: null,
  isOnline: false,
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
      this.updateStatus(false, 'SDK ไม่พร้อมใช้งาน (ทำงานแบบออฟไลน์)');
      return false;
    }

    try {
      if (!firebase.apps.length) {
        this.app = firebase.initializeApp(FIREBASE_CONFIG);
      } else {
        this.app = firebase.app();
      }

      this.db = firebase.database();
      
      // Monitor connection status via .info/connected
      this.db.ref('.info/connected').on('value', (snap) => {
        const connected = snap.val() === true;
        this.isConnectedToCloud = connected;
        this.updateStatus(connected, connected ? 'เชื่อมต่อคลาวด์แล้ว (Realtime Sync)' : 'ออฟไลน์ (บันทึกลงเครื่อง)');
      });

      // Listen for data updates on money_plus_v3 root
      this.listenToCloudData();
      return true;
    } catch (err) {
      console.error('Firebase initialization error:', err);
      this.updateStatus(false, 'เชื่อมต่อไม่สำเร็จ: ' + (err.message || 'Error'));
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

    const dataRef = this.db.ref('money_plus_v3');
    dataRef.on('value', (snapshot) => {
      const data = snapshot.val();
      this.isInitialLoadDone = true;

      if (!data) {
        // Cloud has no data yet, signal to app to push initial data
        console.log('Firebase cloud is empty. Ready for initial upload.');
        if (this.onDataChangeCallback) {
          this.onDataChangeCallback(null, true); // (data, isCloudEmpty)
        }
        return;
      }

      this.lastCloudUpdate = data.lastUpdated || new Date().toISOString();
      if (this.onDataChangeCallback) {
        this.onDataChangeCallback(data, false);
      }
    }, (error) => {
      console.error('Firebase read error (check Rules):', error);
      this.updateStatus(false, 'อ่านข้อมูลไม่สำเร็จ (ตรวจ Rules ใน Firebase)');
    });
  },

  saveData: async function(payload) {
    if (!this.db) {
      console.warn('Firebase DB not initialized, skipping cloud save');
      return false;
    }

    try {
      this.isSyncing = true;
      const cleanPayload = {
        transactions: payload.transactions || [],
        students: payload.students || [],
        groups: payload.groups || [],
        paymentSettings: payload.paymentSettings || {},
        lastUpdated: payload.lastUpdated || new Date().toISOString()
      };

      await this.db.ref('money_plus_v3').set(cleanPayload);
      this.lastCloudUpdate = cleanPayload.lastUpdated;
      this.isSyncing = false;
      this.updateStatus(true, 'ซิงค์ข้อมูลกับคลาวด์เรียบร้อยแล้ว');
      return true;
    } catch (err) {
      this.isSyncing = false;
      console.error('Firebase save error:', err);
      this.updateStatus(false, 'บันทึกลงคลาวด์ไม่สำเร็จ: ' + (err.message || 'Error'));
      return false;
    }
  },

  manualSyncToCloud: async function(payload) {
    return await this.saveData(payload);
  },

  manualFetchFromCloud: async function() {
    if (!this.db) return null;
    const snap = await this.db.ref('money_plus_v3').once('value');
    return snap.val();
  }
};

// Expose globally
window.FirebaseService = FirebaseService;
