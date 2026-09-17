/**
 * NEUMOREMIEND - Full-Stack Desktop PWA Reminder Application Script
 * Features: IndexedDB Persistence, REST API Integration, Persistent DB Sync, VAPID Web Push,
 * Multi-Tab Synchronization, Recurrence Engine, Dev QA Test Suite, Real-Time Alarms.
 */

// Dynamic and resilient API_BASE detection
const getApiBase = () => {
  const custom = localStorage.getItem('neumoremind_api_base');
  if (custom) return custom.replace(/\/$/, '');
  if (window.location.port === '3001') return '/api';
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3001/api';
  }
  return '/api';
};

const API_BASE = getApiBase();

// ==========================================================================
// 1. INDEXEDDB PERSISTENCE ENGINE (LOCAL-FIRST STORE)
// ==========================================================================

class LocalDBManager {
  constructor() {
    this.dbName = 'neumoremind_idb_v2';
    this.storeName = 'reminders';
    this.db = null;
  }

  async init() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onerror = (e) => {
        console.error('[IndexedDB] Open error:', e);
        reject(e);
      };
      request.onsuccess = (e) => {
        this.db = e.target.result;
        console.log('[IndexedDB] Persistent storage connected:', this.dbName);
        resolve(this.db);
      };
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('date', 'date', { unique: false });
          store.createIndex('completionStatus', 'completionStatus', { unique: false });
          store.createIndex('priority', 'priority', { unique: false });
        }
      };
    });
  }

  async getAll() {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = (e) => reject(e);
      });
    } catch (e) {
      console.warn('[IndexedDB] getAll fallback:', e);
      return [];
    }
  }

  async getById(id) {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = (e) => reject(e);
      });
    } catch (e) {
      console.warn('[IndexedDB] getById error:', e);
      return null;
    }
  }

  async save(reminder) {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const req = store.put(reminder);
        req.onsuccess = () => resolve(reminder);
        req.onerror = (e) => reject(e);
      });
    } catch (e) {
      console.warn('[IndexedDB] save fallback:', e);
      return reminder;
    }
  }

  async bulkSave(reminders) {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        reminders.forEach(r => store.put(r));
        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => reject(e);
      });
    } catch (e) {
      console.warn('[IndexedDB] bulkSave error:', e);
      return false;
    }
  }

  async delete(id) {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const req = store.delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = (e) => reject(e);
      });
    } catch (e) {
      console.warn('[IndexedDB] delete error:', e);
      return false;
    }
  }

  async clear() {
    try {
      await this.init();
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const req = store.clear();
        req.onsuccess = () => resolve(true);
        req.onerror = (e) => reject(e);
      });
    } catch (e) {
      console.warn('[IndexedDB] clear error:', e);
      return false;
    }
  }
}

const localDB = new LocalDBManager();

function normalizeReminder(raw) {
  const isCompleted = raw.completed === 1 || raw.completed === true || raw.completionStatus === 'completed';
  const prioRaw = (raw.priority || 'Medium').toString();
  const formattedPrio = prioRaw.charAt(0).toUpperCase() + prioRaw.slice(1).toLowerCase();
  const priority = ['Low', 'Medium', 'High', 'Critical'].includes(formattedPrio) ? formattedPrio : 'Medium';
  
  const now = Date.now();
  const createdAt = raw.createdAt || raw.created_at || now;
  const updatedAt = raw.updatedAt || raw.updated_at || now;

  let reminderStatus = raw.reminderStatus;
  if (isCompleted) {
    reminderStatus = 'completed';
  } else if (!reminderStatus) {
    reminderStatus = raw.snoozed_until ? 'snoozed' : 'pending';
  }

  const completionStatus = isCompleted ? 'completed' : 'pending';
  const date = (raw.date || getFormattedDate(0)).trim();
  const time = (raw.time || '18:00').trim();
  const scheduled_at = raw.scheduled_at || `${date}T${time}:00`;

  return {
    id: raw.id || `task-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    title: (raw.title || '').trim() || 'Untitled Reminder',
    description: (raw.description || raw.notes || '').trim(),
    notes: (raw.notes || raw.description || '').trim(),
    date,
    time,
    scheduled_at,
    priority,
    reminderStatus,
    completionStatus,
    completed: isCompleted ? 1 : 0,
    completed_at: isCompleted ? (raw.completed_at || new Date().toISOString()) : null,
    createdAt,
    updatedAt,
    created_at: createdAt,
    updated_at: updatedAt,
    category: raw.category || 'Personal',
    tag: (raw.tag || '').trim(),
    location: (raw.location || '').trim(),
    recurrence: raw.recurrence || raw.recurrence_type || 'once',
    recurrence_type: raw.recurrence_type || raw.recurrence || 'once',
    soundEnabled: raw.soundEnabled !== undefined ? !!raw.soundEnabled : (raw.sound_enabled !== 0),
    sound_enabled: raw.sound_enabled !== undefined ? (raw.sound_enabled ? 1 : 0) : 1,
    notificationEnabled: raw.notificationEnabled !== undefined ? !!raw.notificationEnabled : (raw.notification_enabled !== 0),
    notification_enabled: raw.notification_enabled !== undefined ? (raw.notification_enabled ? 1 : 0) : 1,
    pinned: !!raw.pinned,
    snoozed_until: raw.snoozed_until || null,
    last_notified_at: raw.last_notified_at || null
  };
}

// ==========================================================================
// 1.5. CLIENT REMINDER SCHEDULER & NOTIFICATION TIMERS
// ==========================================================================

class ClientReminderScheduler {
  constructor() {
    this.activeTimers = new Map(); // taskId -> timerId
    this.checkInterval = null;
  }

  schedule(task) {
    if (!task || !task.id) return;

    // If completed or notifications disabled, cancel and do not schedule
    if (task.completed === 1 || task.completionStatus === 'completed' || task.notificationEnabled === false) {
      this.cancel(task.id);
      return;
    }

    this.cancel(task.id); // clear any existing timer for this ID

    const scheduledDate = new Date(task.scheduled_at || `${task.date}T${task.time}:00`);
    const now = Date.now();
    const diffMs = scheduledDate.getTime() - now;

    // Schedule if in the future (within 24.8 days JS setTimeout limit)
    if (diffMs > 0 && diffMs < 2147483647) {
      const timerId = setTimeout(() => {
        this.activeTimers.delete(task.id);
        this.triggerReminder(task);
      }, diffMs);
      this.activeTimers.set(task.id, timerId);
    }
  }

  reschedule(task) {
    this.cancel(task.id);
    this.schedule(task);
  }

  cancel(taskId) {
    if (this.activeTimers.has(taskId)) {
      clearTimeout(this.activeTimers.get(taskId));
      this.activeTimers.delete(taskId);
      return true;
    }
    return false;
  }

  hasTimer(taskId) {
    return this.activeTimers.has(taskId);
  }

  clearAll() {
    for (const [id, timerId] of this.activeTimers.entries()) {
      clearTimeout(timerId);
    }
    this.activeTimers.clear();
  }

  init(tasks = []) {
    this.clearAll();
    tasks.forEach(task => this.schedule(task));
    this.reconcileMissedReminders(tasks);

    if (!this.checkInterval) {
      this.checkInterval = setInterval(() => {
        if (state && state.rawTasks) {
          this.checkDueTasks(state.rawTasks);
        }
      }, 15000);
    }
  }

  checkDueTasks(tasks) {
    const now = new Date();
    const currentIsoDate = getFormattedDate(0);
    const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    for (const task of tasks) {
      if (task.completed === 1 || task.completionStatus === 'completed' || task.notificationEnabled === false) continue;
      if (task.date === currentIsoDate && task.time === currentHHMM) {
        if (task.last_notified_at) {
          const lastDate = new Date(task.last_notified_at);
          if (now.getTime() - lastDate.getTime() < 55000) continue;
        }
        this.triggerReminder(task);
      }
    }
  }

  reconcileMissedReminders(tasks) {
    const now = Date.now();
    let missedCount = 0;
    for (const task of tasks) {
      if (task.completed === 1 || task.completionStatus === 'completed') continue;
      const scheduledTime = new Date(task.scheduled_at || `${task.date}T${task.time}:00`).getTime();
      // If overdue by more than 2 minutes and not marked missed or notified
      if (scheduledTime < now - 120000 && task.reminderStatus !== 'missed') {
        task.reminderStatus = 'missed';
        localDB.save(task);
        missedCount++;
      }
    }
    if (missedCount > 0) {
      console.log(`[Reconciliation] Identified ${missedCount} missed reminder(s).`);
      if (typeof showToast === 'function') {
        showToast(`⏰ You have ${missedCount} missed reminder(s) from when the app was closed.`, 'warning', 6000);
      }
    }
  }

  triggerReminder(task) {
    console.log(`[Scheduler] ⏰ Triggering reminder: "${task.title}" (ID: ${task.id})`);
    task.last_notified_at = new Date().toISOString();
    task.reminderStatus = 'fired';
    localDB.save(task);

    // Play Sound if enabled
    if (task.soundEnabled !== false && state.soundEnabled) {
      if (typeof playAlarmChime === 'function') playAlarmChime();
    }

    // Show Alarm Modal in UI
    if (typeof AlarmEngine !== 'undefined' && AlarmEngine.startRinging) {
      AlarmEngine.startRinging(task);
    }

    // Show Native Desktop Notification
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'SHOW_NOTIFICATION',
            task: {
              id: task.id,
              title: task.title,
              body: task.description || task.notes || `Scheduled for ${task.time}`,
              priority: task.priority
            }
          });
        } else {
          new Notification(`⏰ ${task.title}`, {
            body: task.description || task.notes || `Scheduled for ${task.time}`,
            icon: 'assets/icons/favicon.svg',
            tag: task.id,
            requireInteraction: true
          });
        }
      } catch (e) {
        console.warn('Notification trigger error:', e);
      }
    }
  }
}

const clientScheduler = new ClientReminderScheduler();


class AppState {
  constructor() {
    this.rawTasks = [];
    this.tasks = [];
    this.metrics = {
      total: 0,
      completed: 0,
      today: 0,
      upcoming: 0,
      overdue: 0,
      highCritical: 0,
      categories: { Work: 0, Personal: 0, Health: 0, Finance: 0, Shopping: 0 },
      progressPercent: 0
    };
    this.currentFilter = 'all';
    this.currentCategory = 'all';
    this.currentPriority = 'all';
    this.currentSort = 'dueDateAsc';
    this.searchQuery = '';
    this.soundEnabled = localStorage.getItem('neumoremind_sound_v1') !== 'false';
    this.audioCtx = null;
    this.broadcast = 'BroadcastChannel' in window ? new BroadcastChannel('neumoremind_sync') : null;

    if (this.broadcast) {
      this.broadcast.onmessage = (e) => {
        if (e.data && e.data.type === 'TASK_MUTATED') {
          this.fetchReminders().then(() => renderApp());
        }
      };
    }
  }

  async fetchReminders() {
    // 1. First load from IndexedDB for zero latency & offline capability
    try {
      const localItems = await localDB.getAll();
      if (localItems && localItems.length > 0) {
        this.rawTasks = localItems.map(normalizeReminder);
        this.recalculateFilteredTasksAndMetrics();
        clientScheduler.init(this.rawTasks);
      }
    } catch (e) {
      console.warn('[AppState] IndexedDB read error:', e);
    }

    // 2. Fetch from backend REST API if available and merge
    try {
      const queryParams = new URLSearchParams({
        filter: this.currentFilter,
        category: this.currentCategory,
        priority: this.currentPriority,
        search: this.searchQuery,
        sort: this.currentSort
      });

      const res = await fetch(`${API_BASE}/reminders?${queryParams}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.reminders) {
          const normalized = data.reminders.map(normalizeReminder);
          this.rawTasks = normalized;
          await localDB.bulkSave(normalized);
          this.recalculateFilteredTasksAndMetrics();
          clientScheduler.init(this.rawTasks);
        }
        updateOnlineStatus(true);
        return true;
      }
    } catch (err) {
      console.warn('Backend REST API offline, operating on IndexedDB local storage');
      updateOnlineStatus(false);
    }

    return true;
  }

  recalculateFilteredTasksAndMetrics() {
    let filtered = [...this.rawTasks];
    const todayStr = getFormattedDate(0);

    // Filter by Completion / View status
    if (this.currentFilter === 'today') {
      filtered = filtered.filter(t => t.date === todayStr && t.completionStatus !== 'completed');
    } else if (this.currentFilter === 'upcoming') {
      filtered = filtered.filter(t => t.date > todayStr && t.completionStatus !== 'completed');
    } else if (this.currentFilter === 'overdue') {
      filtered = filtered.filter(t => t.date < todayStr && t.completionStatus !== 'completed');
    } else if (this.currentFilter === 'completed') {
      filtered = filtered.filter(t => t.completionStatus === 'completed');
    }

    // Filter by Category
    if (this.currentCategory !== 'all') {
      filtered = filtered.filter(t => (t.category || '').toLowerCase() === this.currentCategory.toLowerCase());
    }

    // Filter by Priority
    if (this.currentPriority !== 'all') {
      filtered = filtered.filter(t => (t.priority || '').toLowerCase() === this.currentPriority.toLowerCase());
    }

    // Filter by Search Query (title, description, notes, category, priority, tag)
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter(t => 
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        (t.notes && t.notes.toLowerCase().includes(q)) ||
        (t.category && t.category.toLowerCase().includes(q)) ||
        (t.priority && t.priority.toLowerCase().includes(q)) ||
        (t.tag && t.tag.toLowerCase().includes(q))
      );
    }

    // Sort Tasks
    const prioWeight = { Critical: 4, High: 3, Medium: 2, Low: 1 };
    filtered.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;

      if (this.currentSort === 'dueDateAsc') return (a.date + a.time).localeCompare(b.date + b.time);
      if (this.currentSort === 'dueDateDesc') return (b.date + b.time).localeCompare(a.date + a.time);
      if (this.currentSort === 'priorityHigh' || this.currentSort === 'priority') {
        return (prioWeight[b.priority] || 0) - (prioWeight[a.priority] || 0);
      }
      if (this.currentSort === 'titleAsc') return (a.title || '').localeCompare(b.title || '');
      if (this.currentSort === 'createdDesc') return (b.createdAt || 0) - (a.createdAt || 0);
      return 0;
    });

    this.tasks = filtered;

    // Metrics Calculation
    const total = this.rawTasks.length;
    const completed = this.rawTasks.filter(t => t.completionStatus === 'completed').length;
    const today = this.rawTasks.filter(t => t.date === todayStr && t.completionStatus !== 'completed').length;
    const upcoming = this.rawTasks.filter(t => t.date > todayStr && t.completionStatus !== 'completed').length;
    const overdue = this.rawTasks.filter(t => t.date < todayStr && t.completionStatus !== 'completed').length;
    const highCritical = this.rawTasks.filter(t => (t.priority === 'High' || t.priority === 'Critical') && t.completionStatus !== 'completed').length;

    const categories = { Work: 0, Personal: 0, Health: 0, Finance: 0, Shopping: 0 };
    this.rawTasks.forEach(t => {
      const cat = t.category || 'Personal';
      if (categories[cat] !== undefined) categories[cat]++;
    });

    const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

    this.metrics = { total, completed, today, upcoming, overdue, highCritical, categories, progressPercent };
  }

  async addTask(taskData) {
    const taskId = taskData.id || `task-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const newTask = normalizeReminder({
      ...taskData,
      id: taskId,
      reminderStatus: 'pending',
      completionStatus: 'pending',
      completed: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    // Save to IndexedDB
    await localDB.save(newTask);

    // Update in-memory state without duplicates
    const existingIndex = this.rawTasks.findIndex(t => t.id === newTask.id);
    if (existingIndex !== -1) {
      this.rawTasks[existingIndex] = newTask;
    } else {
      this.rawTasks.unshift(newTask);
    }
    this.recalculateFilteredTasksAndMetrics();

    // Schedule notification timer
    clientScheduler.schedule(newTask);

    // Sync to backend REST API
    try {
      fetch(`${API_BASE}/reminders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTask)
      }).catch(() => {});
    } catch (e) {}

    if (this.broadcast) this.broadcast.postMessage({ type: 'TASK_MUTATED' });
    return newTask;
  }

  async updateTask(id, updates) {
    const existing = this.rawTasks.find(t => t.id === id);
    if (!existing) return null;

    const updatedTask = normalizeReminder({
      ...existing,
      ...updates,
      id, // Preserve immutable ID
      createdAt: existing.createdAt || existing.created_at,
      updatedAt: Date.now(),
      updated_at: Date.now()
    });

    if (updates.date || updates.time) {
      const d = updates.date || existing.date;
      const t = updates.time || existing.time;
      updatedTask.scheduled_at = `${d}T${t}:00`;
    }

    // Save to IndexedDB
    await localDB.save(updatedTask);

    // Update in-memory state in-place (no duplicate entries)
    const idx = this.rawTasks.findIndex(t => t.id === id);
    if (idx !== -1) {
      this.rawTasks[idx] = updatedTask;
    }
    this.recalculateFilteredTasksAndMetrics();

    // Reschedule notification timer
    clientScheduler.reschedule(updatedTask);

    // Sync to backend REST API
    try {
      fetch(`${API_BASE}/reminders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedTask)
      }).catch(() => {});
    } catch (e) {}

    if (this.broadcast) this.broadcast.postMessage({ type: 'TASK_MUTATED' });
    return updatedTask;
  }

  async deleteTask(id) {
    // Cancel any active notification timer immediately
    clientScheduler.cancel(id);

    // Delete from IndexedDB
    await localDB.delete(id);

    // Update in-memory state
    this.rawTasks = this.rawTasks.filter(t => t.id !== id);
    this.recalculateFilteredTasksAndMetrics();

    // Sync to backend REST API
    try {
      fetch(`${API_BASE}/reminders/${id}`, { method: 'DELETE' }).catch(() => {});
    } catch (e) {}

    if (this.broadcast) this.broadcast.postMessage({ type: 'TASK_MUTATED' });
    return true;
  }

  async toggleComplete(id) {
    const existing = this.rawTasks.find(t => t.id === id);
    if (!existing) return null;

    const isDone = existing.completionStatus === 'completed' || existing.completed === 1;
    const newCompletedState = isDone ? 'pending' : 'completed';
    const isCompleted = newCompletedState === 'completed';

    const updated = await this.updateTask(id, {
      completionStatus: newCompletedState,
      completed: isCompleted ? 1 : 0,
      reminderStatus: isCompleted ? 'completed' : 'pending',
      completed_at: isCompleted ? new Date().toISOString() : null
    });

    if (isCompleted) {
      clientScheduler.cancel(id);
    } else {
      clientScheduler.schedule(updated);
    }

    return updated;
  }
}

const state = new AppState();

// Helper to format YYYY-MM-DD
function getFormattedDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}


// ==========================================================================
// 2. WEB AUDIO SYNTHESIZER (TACTILE CLICKS & ALARMS)
// ==========================================================================

function getAudioContext() {
  try {
    if (!state.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        state.audioCtx = new AudioContextClass();
      }
    }
    if (state.audioCtx && state.audioCtx.state === 'suspended') {
      state.audioCtx.resume().catch(() => {});
    }
    return state.audioCtx;
  } catch (e) {
    return null;
  }
}

function playClickSound() {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  } catch (e) {}
}

function playSuccessChime() {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    const playNote = (freq, delay, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + delay);
      gain.gain.setValueAtTime(0.12, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + duration);
    };

    playNote(523.25, 0, 0.15); // C5
    playNote(659.25, 0.1, 0.2); // E5
    playNote(783.99, 0.2, 0.3); // G5
  } catch (e) {}
}

function playAlarmChime() {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    const playBell = (freq, start, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + start);
      gain.gain.setValueAtTime(0.2, now + start);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + duration);
    };

    playBell(880, 0, 0.5);   // A5
    playBell(1108.73, 0.2, 0.5); // C#6
    playBell(1318.51, 0.4, 0.8); // E6
  } catch (e) {}
}


// ==========================================================================
// 3. THEME MANAGER & ONLINE/OFFLINE BADGE
// ==========================================================================

function initTheme() {
  const savedTheme = localStorage.getItem('neumoremind_theme_v1');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initialTheme = savedTheme || (systemPrefersDark ? 'dark' : 'light');

  setTheme(initialTheme);
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('neumoremind_theme_v1', theme);

  const metaThemeColor = document.getElementById('theme-color-meta');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', theme === 'dark' ? '#191c24' : '#e6ecf5');
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  setTheme(next);
  playClickSound();
}

function updateOnlineStatus(isOnline = navigator.onLine) {
  const bar = document.getElementById('online-status-bar');
  const text = document.getElementById('status-text');
  if (!bar || !text) return;

  if (isOnline) {
    bar.className = 'online-status-bar online';
    text.textContent = 'Online — DB Sync Active';
  } else {
    bar.className = 'online-status-bar offline';
    text.textContent = 'Offline Mode (Local Cache)';
  }
}


// ==========================================================================
// 4. WEB PUSH NOTIFICATIONS & REAL-TIME ALARM ENGINE
// ==========================================================================

async function subscribeUserToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Web Push is not supported in this browser.');
    return false;
  }

  try {
    const swReg = await navigator.serviceWorker.ready;

    const keyRes = await fetch(`${API_BASE}/vapid-public-key`);
    const { publicKey } = await keyRes.json();

    if (!publicKey) {
      console.warn('VAPID Public Key not returned by backend server.');
      return false;
    }

    const applicationServerKey = urlBase64ToUint8Array(publicKey);

    let subscription = await swReg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await swReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });
    }

    await fetch(`${API_BASE}/push-subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON())
    });

    console.log('✅ Web Push Subscription registered with backend!');
    updateNotificationBtnState('granted');
    return true;
  } catch (err) {
    console.error('Push Subscription failed:', err);
    return false;
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function requestNotificationPermission() {
  if (!('Notification' in window)) {
    showToast('⚠️ Desktop notifications are not supported by this browser.', 'warning');
    return;
  }

  if (Notification.permission === 'denied') {
    showToast('🚫 Notifications are blocked in your browser! Click the lock/tune icon in your address bar to re-enable.', 'danger', 6000);
    updateNotificationBtnState('denied');
    return;
  }

  if (Notification.permission === 'granted') {
    subscribeUserToPush();
    showToast('🔔 Web Push Notifications are active!', 'info');
    updateNotificationBtnState('granted');
    return;
  }

  Notification.requestPermission().then(permission => {
    updateNotificationBtnState(permission);
    if (permission === 'granted') {
      subscribeUserToPush();
      showToast('🔔 Web Push Notifications Enabled!', 'success');
    } else if (permission === 'denied') {
      showToast('🚫 Notifications blocked by user. Re-enable anytime in browser site settings.', 'warning', 5000);
    }
  });
}

function updateNotificationBtnState(permission = (('Notification' in window) ? Notification.permission : 'default')) {
  const btn = document.getElementById('btn-toggle-notif');
  if (!btn) return;
  if (permission === 'granted') {
    btn.classList.add('active');
    btn.classList.remove('denied');
    btn.title = 'Web Push Notifications Active';
  } else if (permission === 'denied') {
    btn.classList.remove('active');
    btn.classList.add('denied');
    btn.title = 'Notifications Blocked in Browser Settings';
  } else {
    btn.classList.remove('active');
    btn.classList.remove('denied');
    btn.title = 'Click to Enable Web Push Notifications';
  }
}

class RealTimeAlarmEngine {
  constructor() {
    this.activeTask = null;
    this.ringInterval = null;
  }

  startRinging(task) {
    this.stopRinging();
    this.activeTask = task;

    const modal = document.getElementById('alarm-modal');
    const title = document.getElementById('alarm-task-title');
    const notes = document.getElementById('alarm-task-notes');

    if (title) title.textContent = task.title;
    if (notes) notes.textContent = task.notes || task.description || `Scheduled for ${task.time || 'today'} (${task.category || 'General'})`;

    if (modal) modal.classList.remove('hidden');

    playAlarmChime();
    this.ringInterval = setInterval(() => {
      playAlarmChime();
    }, 1600);

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`⏰ ALARM RINGING: ${task.title}`, {
        body: task.notes || task.description || `Scheduled time reached (${task.time})`,
        icon: 'assets/icons/favicon.svg',
        tag: task.id,
        requireInteraction: true
      });
    }
  }

  stopRinging() {
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
    this.activeTask = null;
    const modal = document.getElementById('alarm-modal');
    if (modal) modal.classList.add('hidden');
  }

  async snooze(minutes = 5) {
    if (this.activeTask) {
      const id = this.activeTask.id;
      this.stopRinging();

      try {
        await fetch(`${API_BASE}/reminders/${id}/snooze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ minutes })
        });
        await state.fetchReminders();
        renderApp();
        showToast(`💤 Alarm Snoozed for ${minutes} minutes`, 'info');
      } catch (err) {
        showToast('⚠️ Failed to snooze reminder', 'danger');
      }
    } else {
      this.stopRinging();
    }
  }

  async stopAndComplete() {
    if (this.activeTask) {
      const id = this.activeTask.id;
      this.stopRinging();
      await state.toggleComplete(id);
      renderApp();
      showToast('⏹️ Alarm Stopped & Reminder Marked Complete!', 'success');
    } else {
      this.stopRinging();
    }
  }
}

const AlarmEngine = new RealTimeAlarmEngine();


// ==========================================================================
// 5. DOM RENDERING & FILTERS
// ==========================================================================

async function renderApp() {
  await state.fetchReminders();
  renderTaskList();
  renderCountersAndProgress();
}

function renderTaskList() {
  const container = document.getElementById('task-list-container');
  const emptyState = document.getElementById('empty-state');
  const tasks = state.tasks;

  const existingCards = container.querySelectorAll('.task-card');
  existingCards.forEach(card => card.remove());

  if (tasks.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  } else {
    emptyState.classList.add('hidden');
  }

  const todayStr = getFormattedDate(0);

  tasks.forEach(task => {
    const card = document.createElement('div');
    const isCompleted = task.completed === 1 || task.completed === true;
    const isPinned = !!task.pinned;

    card.className = `neu-card task-card ${isCompleted ? 'completed' : ''} ${isPinned ? 'pinned' : ''}`;
    card.dataset.id = task.id;

    let dateStatusClass = '';
    let formattedDateText = '';
    if (task.date) {
      if (task.date === todayStr) {
        dateStatusClass = 'due-today';
        formattedDateText = `Today${task.time ? ' at ' + task.time : ''}`;
      } else if (task.date < todayStr && !isCompleted) {
        dateStatusClass = 'due-overdue';
        formattedDateText = `Overdue (${task.date})`;
      } else {
        formattedDateText = `${task.date}${task.time ? ' ' + task.time : ''}`;
      }
    }

    card.innerHTML = `
      <div class="task-header-row">
        <button type="button" class="task-checkbox-btn" data-action="complete" data-id="${task.id}" title="${isCompleted ? 'Mark pending' : 'Mark completed'}">
          ${isCompleted ? '✓' : ''}
        </button>

        <div class="task-title-group">
          <h4 class="task-title">${escapeHtml(task.title)}</h4>
          <div class="task-meta-top">
            <span class="priority-pill priority-${task.priority || 'medium'}">● ${(task.priority || 'medium').toUpperCase()}</span>
            ${task.category ? `<span class="category-tag">#${escapeHtml(task.category)}</span>` : ''}
            ${task.tag ? `<span class="category-tag">🏷️ ${escapeHtml(task.tag)}</span>` : ''}
            ${task.recurrence_type && task.recurrence_type !== 'once' ? `<span class="category-tag">🔄 ${escapeHtml(task.recurrence_type)}</span>` : ''}
          </div>
        </div>

        <button type="button" class="neu-icon-btn action-btn-sm" data-action="pin" data-id="${task.id}" title="${isPinned ? 'Unpin task' : 'Pin task'}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="${isPinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
        </button>
      </div>

      ${(task.notes || task.description) ? `<p class="task-notes">${escapeHtml(task.notes || task.description)}</p>` : ''}
      ${task.location ? `<p class="task-notes" style="font-size:0.8rem;">📍 ${escapeHtml(task.location)}</p>` : ''}

      <div class="task-footer-row">
        <div class="due-date-badge ${dateStatusClass}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          <span>${formattedDateText || 'No due date'}</span>
        </div>

        <div class="task-actions">
          <button type="button" class="neu-btn neu-btn-sm action-btn-sm" data-action="test-alarm" data-id="${task.id}" title="Test Real-Time Alarm Ringing">
            🔔 Test Ring
          </button>
          <button type="button" class="neu-icon-btn action-btn-sm" data-action="edit" data-id="${task.id}" title="Edit Reminder">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button type="button" class="neu-icon-btn action-btn-sm" data-action="delete" data-id="${task.id}" title="Delete Reminder">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>
    `;

    container.insertBefore(card, emptyState);
  });

  renderFilterChips();
}

function renderCountersAndProgress() {
  const m = state.metrics;

  document.getElementById('count-all').textContent = m.total;
  document.getElementById('count-today').textContent = m.today;
  document.getElementById('count-upcoming').textContent = m.upcoming;
  document.getElementById('count-overdue').textContent = m.overdue;
  document.getElementById('count-completed').textContent = m.completed;

  // Category counts
  if (m.categories) {
    const c = m.categories;
    const updateCatCount = (catId, count) => {
      const el = document.getElementById(catId);
      if (el) {
        let badge = el.querySelector('.badge');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'badge';
          el.appendChild(badge);
        }
        badge.textContent = count || 0;
      }
    };
    updateCatCount('cat-work', c.Work);
    updateCatCount('cat-personal', c.Personal);
    updateCatCount('cat-health', c.Health);
    updateCatCount('cat-finance', c.Finance);
    updateCatCount('cat-shopping', c.Shopping);
  }

  document.getElementById('stats-percent').textContent = `${m.progressPercent}%`;
  document.getElementById('progress-text').textContent = `${m.completed} / ${m.total}`;

  const circle = document.getElementById('progress-circle');
  if (circle) {
    const circumference = 2 * Math.PI * 38; // r=38
    const offset = circumference - (m.progressPercent / 100) * circumference;
    circle.style.strokeDashoffset = offset;
  }
}

function renderFilterChips() {
  const chipsRow = document.getElementById('filter-chips-row');
  chipsRow.innerHTML = '';

  if (state.currentFilter !== 'all') {
    chipsRow.appendChild(createChip(`View: ${capitalize(state.currentFilter)}`, () => setFilter('all')));
  }

  if (state.currentCategory !== 'all') {
    chipsRow.appendChild(createChip(`Category: ${state.currentCategory}`, () => setCategory('all')));
  }

  if (state.searchQuery) {
    chipsRow.appendChild(createChip(`Search: "${state.searchQuery}"`, () => {
      document.getElementById('search-input').value = '';
      state.searchQuery = '';
      document.getElementById('clear-search-btn').classList.add('hidden');
      renderApp();
    }));
  }
}

function createChip(label, onRemove) {
  const chip = document.createElement('div');
  chip.className = 'chip active';
  chip.innerHTML = `<span>${escapeHtml(label)}</span> <span>&times;</span>`;
  chip.onclick = () => {
    playClickSound();
    onRemove();
  };
  return chip;
}

function setFilter(filter) {
  state.currentFilter = filter;

  document.querySelectorAll('.nav-menu .nav-item').forEach(btn => {
    if (btn.dataset.filter === filter) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const titles = {
    all: 'All Reminders',
    today: 'Today\'s Reminders',
    upcoming: 'Upcoming Tasks',
    overdue: 'Overdue Reminders',
    completed: 'Completed Tasks'
  };

  document.getElementById('current-view-title').textContent = titles[filter] || 'Reminders';
  renderApp();
}

function setCategory(category) {
  state.currentCategory = category;

  document.querySelectorAll('.category-item').forEach(btn => {
    if (btn.dataset.category === category) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  renderApp();
}


// ==========================================================================
// 6. TASK MODAL & FORM HANDLERS
// ==========================================================================

function openTaskModal(taskId = null) {
  playClickSound();
  const modal = document.getElementById('task-modal');
  const form = document.getElementById('task-form');
  const modalTitle = document.getElementById('modal-title');

  form.reset();

  const titleInput = document.getElementById('task-title');
  const notesInput = document.getElementById('task-notes');
  const tagInput = document.getElementById('task-tag');
  const locationInput = document.getElementById('task-location');
  const notifToggle = document.getElementById('task-notif-enabled');
  const soundToggle = document.getElementById('task-sound-enabled');

  if (titleInput) {
    titleInput.value = '';
    titleInput.style.border = '';
  }
  if (notesInput) notesInput.value = '';
  if (tagInput) tagInput.value = '';
  if (locationInput) locationInput.value = '';

  if (taskId) {
    const task = state.rawTasks.find(t => t.id === taskId) || state.tasks.find(t => t.id === taskId);
    if (task) {
      modalTitle.textContent = 'Edit Reminder';
      document.getElementById('task-id').value = task.id;
      if (titleInput) titleInput.value = task.title;
      if (notesInput) notesInput.value = task.notes || task.description || '';
      if (tagInput) tagInput.value = task.tag || '';
      if (locationInput) locationInput.value = task.location || '';
      if (notifToggle) notifToggle.checked = task.notification_enabled !== 0;
      if (soundToggle) soundToggle.checked = task.sound_enabled !== 0;

      selectDateValue(task.date || getFormattedDate(0));
      selectTimeValue(task.time || '18:00');
      setCustomDropdownValue('priority-custom-dropdown', 'task-priority', task.priority || 'Medium');
      setCustomDropdownValue('category-custom-dropdown', 'task-category', task.category || 'Personal');
      setCustomDropdownValue('recurrence-custom-dropdown', 'task-recurrence', task.recurrence_type || task.recurrence || 'once');
      document.getElementById('task-pinned').checked = !!task.pinned;
    }
  } else {
    modalTitle.textContent = 'New Reminder';
    document.getElementById('task-id').value = '';
    selectDateValue(getFormattedDate(0));
    selectTimeValue('18:00');
    setCustomDropdownValue('priority-custom-dropdown', 'task-priority', 'Medium');
    setCustomDropdownValue('category-custom-dropdown', 'task-category', 'Personal');
    setCustomDropdownValue('recurrence-custom-dropdown', 'task-recurrence', 'once');
    if (notifToggle) notifToggle.checked = true;
    if (soundToggle) soundToggle.checked = true;
  }

  modal.classList.remove('hidden');
  if (titleInput) titleInput.focus();
}

function closeTaskModal() {
  playClickSound();
  document.getElementById('task-modal').classList.add('hidden');
}

let isSubmittingTaskForm = false;

async function handleSaveTask(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  // Prevent duplicate submissions / rapid clicks
  if (isSubmittingTaskForm) return;

  const idInput = document.getElementById('task-id');
  const titleInput = document.getElementById('task-title');
  const notesInput = document.getElementById('task-notes');
  const dueDateInput = document.getElementById('task-due-date');
  const dueTimeInput = document.getElementById('task-due-time');
  const priorityInput = document.getElementById('task-priority');
  const categoryInput = document.getElementById('task-category');
  const recurrenceInput = document.getElementById('task-recurrence');
  const tagInput = document.getElementById('task-tag');
  const locationInput = document.getElementById('task-location');
  const notifInput = document.getElementById('task-notif-enabled');
  const soundInput = document.getElementById('task-sound-enabled');
  const pinnedInput = document.getElementById('task-pinned');
  const saveBtn = document.getElementById('modal-save-btn');

  // 1. Title Validation
  const title = (titleInput ? titleInput.value : '').trim();
  if (!title) {
    if (titleInput) {
      titleInput.style.border = '2px solid var(--danger-color)';
      titleInput.focus();
    }
    showToast('⚠️ Reminder title is required!', 'warning');
    return;
  }
  if (titleInput) titleInput.style.border = '';

  // 2. Date Validation
  const selectedDateStr = (dueDateInput ? dueDateInput.value : '').trim();
  if (!selectedDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(selectedDateStr) || isNaN(new Date(selectedDateStr).getTime())) {
    showToast('⚠️ Valid due date (YYYY-MM-DD) is required!', 'warning');
    return;
  }

  // 3. Time Validation
  const rawTimeStr = (dueTimeInput ? dueTimeInput.value : '').trim();
  if (!rawTimeStr || !/^\d{1,2}:\d{2}$/.test(rawTimeStr)) {
    showToast('⚠️ Valid due time (HH:MM) is required!', 'warning');
    return;
  }
  const [h, m] = rawTimeStr.split(':').map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) {
    showToast('⚠️ Valid due time (00:00 - 23:59) is required!', 'warning');
    return;
  }
  const selectedTimeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  const selectedDateTime = new Date(`${selectedDateStr}T${selectedTimeStr}:00`);
  const now = new Date();
  const id = idInput ? idInput.value : '';

  // 4. Accidental past-date validation check for NEW reminders (allow 60s grace)
  if (!id && selectedDateTime.getTime() < now.getTime() - 60000) {
    showToast('⚠️ Cannot schedule a reminder in the past! Pick a future date & time.', 'warning');
    return;
  }

  const payload = {
    title,
    description: notesInput ? notesInput.value.trim() : '',
    notes: notesInput ? notesInput.value.trim() : '',
    date: selectedDateStr,
    time: selectedTimeStr,
    scheduled_at: `${selectedDateStr}T${selectedTimeStr}:00`,
    priority: priorityInput ? priorityInput.value : 'Medium',
    category: categoryInput ? categoryInput.value : 'Personal',
    recurrence_type: recurrenceInput ? recurrenceInput.value : 'once',
    recurrence: recurrenceInput ? recurrenceInput.value : 'once',
    tag: tagInput ? tagInput.value.trim() : '',
    location: locationInput ? locationInput.value.trim() : '',
    notification_enabled: notifInput ? (notifInput.checked ? 1 : 0) : 1,
    sound_enabled: soundInput ? (soundInput.checked ? 1 : 0) : 1,
    pinned: pinnedInput ? pinnedInput.checked : false
  };

  isSubmittingTaskForm = true;
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
  }

  try {
    if (id) {
      await state.updateTask(id, payload);
      showToast('✅ Reminder Updated Successfully!', 'success');
    } else {
      await state.addTask(payload);
      showToast('✨ New Reminder Saved to DB!', 'success');
    }
    playClickSound();
    closeTaskModal();
    renderApp();
  } catch (err) {
    console.error('Save task error:', err);
    showToast('❌ Error saving task to database', 'danger');
  } finally {
    isSubmittingTaskForm = false;
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Reminder';
    }
  }
}


// ==========================================================================
// 7. DEVELOPER QA TEST SUITE & PWA INSTALL
// ==========================================================================

function setupDevTestMode() {
  const modal = document.getElementById('dev-test-modal');
  const statusBox = document.getElementById('dev-status-output');
  if (!modal) return;

  const logStatus = (msg) => {
    if (statusBox) statusBox.innerHTML = `<strong>Status:</strong> ${msg}`;
  };

  document.getElementById('btn-dev-test').addEventListener('click', () => {
    playClickSound();
    modal.classList.remove('hidden');
    logStatus('Developer Test Suite Ready.');
  });

  document.getElementById('dev-test-close-btn').addEventListener('click', () => {
    playClickSound();
    modal.classList.add('hidden');
  });

  document.getElementById('btn-test-send-push').addEventListener('click', async () => {
    playClickSound();
    logStatus('Sending Test Web Push to server...');
    try {
      const res = await fetch(`${API_BASE}/test-push`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        logStatus(`✅ Web Push Sent! Response: ${data.message}`);
        showToast('🔔 Test Web Push Dispatched!', 'success');
      } else {
        logStatus(`❌ Push Error: ${data.error}`);
        showToast(`⚠️ Push Error: ${data.error}`, 'warning');
      }
    } catch (e) {
      logStatus(`❌ Fetch Error: ${e.message}`);
    }
  });

  document.getElementById('btn-test-sound').addEventListener('click', () => {
    logStatus('🔊 Testing Audio Alarm Chime...');
    playAlarmChime();
    showToast('🔊 Audio Chime Playing', 'info');
  });

  document.getElementById('btn-test-create-1min').addEventListener('click', async () => {
    playClickSound();
    logStatus('Creating test reminder 1 minute in future...');

    const now = new Date();
    now.setMinutes(now.getMinutes() + 1);

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');

    const testTask = {
      title: '⚡ 1-Minute QA Test Alarm',
      notes: 'This test reminder was scheduled 1 minute ago to verify real-time alarms.',
      date: `${year}-${month}-${day}`,
      time: `${h}:${m}`,
      priority: 'high',
      category: 'Work'
    };

    try {
      await state.addTask(testTask);
      logStatus(`✅ Created test reminder for ${h}:${m}! Close tab to test background push.`);
      showToast(`⚡ Test Reminder set for ${h}:${m}!`, 'success');
      modal.classList.add('hidden');
      renderApp();
    } catch (e) {
      logStatus(`❌ Error creating task: ${e.message}`);
    }
  });

  document.getElementById('btn-test-check-sw').addEventListener('click', async () => {
    if (!('serviceWorker' in navigator)) {
      logStatus('❌ Service Worker NOT supported');
      return;
    }
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      logStatus(`✅ Service Worker Active! Scope: ${reg.scope}`);
    } else {
      logStatus('⚠️ No active Service Worker registration found.');
    }
  });

  document.getElementById('btn-test-check-push').addEventListener('click', async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      logStatus('❌ Web Push NOT supported');
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      logStatus(`✅ Active Push Subscription found!\nEndpoint: ${sub.endpoint.slice(0, 45)}...`);
    } else {
      logStatus('⚠️ No Push Subscription found. Click Notification Bell icon in header to subscribe.');
    }
  });
}

function exportBackupJSON() {
  playClickSound();
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.tasks, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `neumoremind_backup_${getFormattedDate(0)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

function importBackupJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(event) {
    try {
      const importedTasks = JSON.parse(event.target.result);
      if (Array.isArray(importedTasks)) {
        for (const t of importedTasks) {
          await state.addTask(t);
        }
        await renderApp();
        showToast('✅ Reminders imported to database!', 'success');
        document.getElementById('backup-modal').classList.add('hidden');
      } else {
        alert('Invalid backup file format.');
      }
    } catch (err) {
      alert('Error parsing JSON file.');
    }
  };
  reader.readAsText(file);
}

let deferredPwaPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPwaPrompt = e;
  const installBtn = document.getElementById('btn-pwa-install');
  if (installBtn) installBtn.classList.remove('hidden');
});

function handlePwaInstall() {
  if (!deferredPwaPrompt) {
    alert('PWA installation is supported via Chrome / Edge address bar icon.');
    return;
  }
  deferredPwaPrompt.prompt();
  deferredPwaPrompt.userChoice.then((result) => {
    if (result.outcome === 'accepted') {
      console.log('User accepted PWA installation');
    }
    deferredPwaPrompt = null;
    document.getElementById('btn-pwa-install').classList.add('hidden');
  });
}


// ==========================================================================
// 8. EVENT LISTENERS SETUP
// ==========================================================================

function startReminderScheduler() {
  setInterval(() => {
    try {
      if (state && typeof state.recalculateFilteredTasksAndMetrics === 'function') {
        state.recalculateFilteredTasksAndMetrics();
      }
    } catch (e) {}
  }, 30000);
}

document.addEventListener('DOMContentLoaded', async () => {
  try { initTheme(); } catch (e) {}
  try { updateOnlineStatus(); } catch (e) {}

  window.addEventListener('online', () => updateOnlineStatus(true));
  window.addEventListener('offline', () => updateOnlineStatus(false));

  try { await renderApp(); } catch (e) {}
  try { startReminderScheduler(); } catch (e) {}
  try { updateNotificationBtnState(); } catch (e) {}

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => {
        console.log('Service Worker Registered!', reg);
        if (Notification.permission === 'granted') {
          subscribeUserToPush();
        }
      })
      .catch(err => console.error('Service Worker Registration Failed!', err));
  }

  // Mobile touch audio unlock
  window.addEventListener('touchstart', () => {
    try {
      if (state.audioCtx && state.audioCtx.state === 'suspended') {
        state.audioCtx.resume().catch(() => {});
      }
    } catch (e) {}
  }, { passive: true, once: true });

  const addSafeListener = (id, event, handler) => {
    const el = typeof id === 'string' ? document.getElementById(id) : id;
    if (el) el.addEventListener(event, handler);
  };

  // Header Actions
  addSafeListener('btn-theme-toggle', 'click', toggleTheme);

  const soundBtn = document.getElementById('btn-toggle-sound');
  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      state.soundEnabled = !state.soundEnabled;
      localStorage.setItem('neumoremind_sound_v1', state.soundEnabled);
      if (state.soundEnabled) {
        soundBtn.classList.add('active');
        playClickSound();
      } else {
        soundBtn.classList.remove('active');
      }
    });
  }

  addSafeListener('btn-toggle-notif', 'click', () => {
    playClickSound();
    requestNotificationPermission();
  });

  // Navigation Filter Buttons
  document.querySelectorAll('.nav-menu .nav-item[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      playClickSound();
      setFilter(btn.dataset.filter);
    });
  });

  // Category Filter Buttons
  document.querySelectorAll('.category-item').forEach(btn => {
    btn.addEventListener('click', () => {
      playClickSound();
      setCategory(btn.dataset.category);
    });
  });

  // Custom Neumorphic Dropdowns Setup
  setupCustomDropdown('priority-filter-dropdown', null, (val) => {
    state.currentPriority = val;
    renderApp();
  });
  setupCustomDropdown('sort-custom-dropdown', null, (val) => {
    state.currentSort = val;
    renderApp();
  });
  setupCustomDropdown('priority-custom-dropdown', 'task-priority', null);
  setupCustomDropdown('category-custom-dropdown', 'task-category', null);
  setupCustomDropdown('recurrence-custom-dropdown', 'task-recurrence', null);

  // Custom Neumorphic Date & Time Pickers Setup
  setupCustomDatePicker();
  setupCustomTimePicker();

  // Close custom popovers on click outside
  document.addEventListener('click', () => {
    closeAllPopovers();
  });

  // Search Input
  const searchInput = document.getElementById('search-input');
  const clearSearchBtn = document.getElementById('clear-search-btn');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      if (clearSearchBtn) {
        if (state.searchQuery) {
          clearSearchBtn.classList.remove('hidden');
        } else {
          clearSearchBtn.classList.add('hidden');
        }
      }
      renderApp();
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      playClickSound();
      if (searchInput) searchInput.value = '';
      state.searchQuery = '';
      clearSearchBtn.classList.add('hidden');
      renderApp();
    });
  }

  // Add Task Buttons
  addSafeListener('sidebar-add-btn', 'click', () => openTaskModal());
  addSafeListener('btn-header-add', 'click', () => openTaskModal());
  addSafeListener('empty-add-btn', 'click', () => openTaskModal());

  // Modal Cancel & Close
  addSafeListener('modal-close-btn', 'click', closeTaskModal);
  addSafeListener('modal-cancel-btn', 'click', closeTaskModal);
  addSafeListener('task-form', 'submit', handleSaveTask);

  // Backup Modal
  const backupModal = document.getElementById('backup-modal');
  addSafeListener('btn-backup', 'click', () => {
    playClickSound();
    if (backupModal) backupModal.classList.remove('hidden');
  });
  addSafeListener('backup-close-btn', 'click', () => {
    playClickSound();
    if (backupModal) backupModal.classList.add('hidden');
  });
  addSafeListener('btn-export-json', 'click', exportBackupJSON);

  const importInput = document.getElementById('import-file-input');
  addSafeListener('btn-import-json', 'click', () => { if (importInput) importInput.click(); });
  if (importInput) importInput.addEventListener('change', importBackupJSON);

  // Task Cards Event Delegation (Complete, Pin, Edit, Delete, Test Ring)
  const taskContainer = document.getElementById('task-list-container');
  if (taskContainer) {
    taskContainer.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (!id) return;

      if (action === 'complete') {
        const updated = await state.toggleComplete(id);
        if (updated && updated.completed === 1) playSuccessChime();
        else playClickSound();
        renderApp();
      } else if (action === 'pin') {
        playClickSound();
        const task = state.tasks.find(t => t.id === id);
        if (task) {
          await state.updateTask(id, { pinned: !task.pinned });
          renderApp();
        }
      } else if (action === 'edit') {
        openTaskModal(id);
      } else if (action === 'delete') {
        playClickSound();
        const taskToDelete = state.tasks.find(t => t.id === id);
        await state.deleteTask(id);
        renderApp();
        showToast(`🗑️ "${taskToDelete ? taskToDelete.title : 'Reminder'}" Deleted`, 'danger', 4000);
      } else if (action === 'test-alarm') {
        const taskToTest = state.tasks.find(t => t.id === id);
        if (taskToTest) {
          AlarmEngine.startRinging(taskToTest);
        }
      }
    });
  }

  // Alarm Modal Controls
  document.getElementById('btn-snooze-alarm').addEventListener('click', () => {
    AlarmEngine.snooze(5);
  });
  document.getElementById('btn-stop-alarm').addEventListener('click', () => {
    AlarmEngine.stopAndComplete();
  });

  // Setup Dev Test Mode
  setupDevTestMode();

  // PWA Install Button
  document.getElementById('btn-pwa-install').addEventListener('click', handlePwaInstall);
});


// ==========================================================================
// 9. UTILITY HELPERS & CUSTOM DROPDOWNS/PICKERS
// ==========================================================================

function showToast(message, type = 'info', duration = 4000, action = null) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `neu-toast toast-${type}`;

  let actionHtml = '';
  if (action) {
    actionHtml = `<button type="button" class="neu-btn neu-btn-primary neu-toast-action" id="toast-action-btn">${escapeHtml(action.label)}</button>`;
  }

  toast.innerHTML = `
    <div class="neu-toast-content">
      <span class="neu-toast-title">${escapeHtml(message)}</span>
    </div>
    ${actionHtml}
    <button type="button" class="neu-toast-close">&times;</button>
  `;

  if (action && action.onClick) {
    const actionBtn = toast.querySelector('#toast-action-btn');
    if (actionBtn) {
      actionBtn.addEventListener('click', () => {
        action.onClick();
        toast.remove();
      });
    }
  }

  toast.querySelector('.neu-toast-close').addEventListener('click', () => {
    toast.remove();
  });

  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
      }
    }, duration);
  }
}

function setupCustomDropdown(containerId, hiddenInputId, onSelectCallback) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const trigger = container.querySelector('.neu-dropdown-trigger');
  const menu = container.querySelector('.neu-dropdown-menu');
  const selectedTextEl = container.querySelector('span[id$="-selected-text"]');
  const hiddenInput = hiddenInputId ? document.getElementById(hiddenInputId) : null;

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    playClickSound();

    document.querySelectorAll('.neu-custom-dropdown').forEach(d => {
      if (d !== container) d.classList.remove('open');
    });

    container.classList.toggle('open');
  });

  menu.querySelectorAll('.neu-dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      playClickSound();

      const val = item.dataset.value;
      const text = item.textContent.trim();

      menu.querySelectorAll('.neu-dropdown-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');

      if (selectedTextEl) selectedTextEl.textContent = text;
      if (hiddenInput) hiddenInput.value = val;

      container.classList.remove('open');

      if (onSelectCallback) {
        onSelectCallback(val);
      }
    });
  });
}

function setCustomDropdownValue(containerId, hiddenInputId, targetValue) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const menu = container.querySelector('.neu-dropdown-menu');
  const selectedTextEl = container.querySelector('span[id$="-selected-text"]');
  const hiddenInput = hiddenInputId ? document.getElementById(hiddenInputId) : null;

  menu.querySelectorAll('.neu-dropdown-item').forEach(item => {
    if (item.dataset.value === targetValue) {
      item.classList.add('selected');
      if (selectedTextEl) selectedTextEl.textContent = item.textContent.trim();
      if (hiddenInput) hiddenInput.value = targetValue;
    } else {
      item.classList.remove('selected');
    }
  });
}

let currentCalYear = new Date().getFullYear();
let currentCalMonth = new Date().getMonth();

function setupCustomDatePicker() {
  const trigger = document.getElementById('datepicker-trigger');
  const popover = document.getElementById('calendar-popover');
  if (!trigger || !popover) return;

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    playClickSound();

    const isHidden = popover.classList.contains('hidden');
    closeAllPopovers();

    if (isHidden) {
      popover.classList.remove('hidden');
      renderCalendarGrid();
    }
  });

  popover.addEventListener('click', (e) => e.stopPropagation());

  const prevBtn = document.getElementById('cal-prev-month');
  if (prevBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      playClickSound();
      currentCalMonth--;
      if (currentCalMonth < 0) {
        currentCalMonth = 11;
        currentCalYear--;
      }
      renderCalendarGrid();
    });
  }

  const nextBtn = document.getElementById('cal-next-month');
  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      playClickSound();
      currentCalMonth++;
      if (currentCalMonth > 11) {
        currentCalMonth = 0;
        currentCalYear++;
      }
      renderCalendarGrid();
    });
  }

  const pToday = document.getElementById('preset-today');
  if (pToday) {
    pToday.addEventListener('click', (e) => {
      e.stopPropagation();
      selectDateValue(getFormattedDate(0));
    });
  }

  const pTomorrow = document.getElementById('preset-tomorrow');
  if (pTomorrow) {
    pTomorrow.addEventListener('click', (e) => {
      e.stopPropagation();
      selectDateValue(getFormattedDate(1));
    });
  }

  const pNextWeek = document.getElementById('preset-nextweek');
  if (pNextWeek) {
    pNextWeek.addEventListener('click', (e) => {
      e.stopPropagation();
      selectDateValue(getFormattedDate(7));
    });
  }
}

function renderCalendarGrid() {
  const grid = document.getElementById('cal-days-grid');
  const title = document.getElementById('cal-month-year');
  const hiddenInput = document.getElementById('task-due-date');
  if (!grid || !title) return;

  const selectedDateStr = hiddenInput ? hiddenInput.value : '';

  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  title.textContent = `${monthNames[currentCalMonth]} ${currentCalYear}`;
  grid.innerHTML = '';

  const firstDay = new Date(currentCalYear, currentCalMonth, 1).getDay();
  const daysInMonth = new Date(currentCalYear, currentCalMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(currentCalYear, currentCalMonth, 0).getDate();

  const todayStr = getFormattedDate(0);

  for (let i = firstDay - 1; i >= 0; i--) {
    const btn = document.createElement('div');
    btn.className = 'cal-day-btn other-month';
    btn.textContent = daysInPrevMonth - i;
    grid.appendChild(btn);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cal-day-btn';
    btn.textContent = day;

    const monthStr = String(currentCalMonth + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const fullDateStr = `${currentCalYear}-${monthStr}-${dayStr}`;

    if (fullDateStr === todayStr) {
      btn.classList.add('today');
    }

    if (fullDateStr === selectedDateStr) {
      btn.classList.add('selected');
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectDateValue(fullDateStr);
    });

    grid.appendChild(btn);
  }
}

function selectDateValue(dateStr) {
  playClickSound();
  const hiddenInput = document.getElementById('task-due-date');
  const displayText = document.getElementById('datepicker-display-text');

  if (hiddenInput) hiddenInput.value = dateStr;

  if (displayText) {
    if (dateStr) {
      const [y, m, d] = dateStr.split('-');
      const todayStr = getFormattedDate(0);
      const tomorrowStr = getFormattedDate(1);

      if (dateStr === todayStr) {
        displayText.textContent = `Today (${d}/${m}/${y})`;
      } else if (dateStr === tomorrowStr) {
        displayText.textContent = `Tomorrow (${d}/${m}/${y})`;
      } else {
        displayText.textContent = `${d}/${m}/${y}`;
      }
    } else {
      displayText.textContent = 'Select Date';
    }
  }

  const popover = document.getElementById('calendar-popover');
  if (popover) popover.classList.add('hidden');
}

function setupCustomTimePicker() {
  const trigger = document.getElementById('timepicker-trigger');
  const popover = document.getElementById('time-popover');
  if (!trigger || !popover) return;

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    playClickSound();

    const isHidden = popover.classList.contains('hidden');
    closeAllPopovers();

    if (isHidden) {
      popover.classList.remove('hidden');
    }
  });

  popover.addEventListener('click', (e) => e.stopPropagation());

  popover.querySelectorAll('.time-preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectTimeValue(btn.dataset.time);
    });
  });

  const applyBtn = document.getElementById('time-apply-btn');
  if (applyBtn) {
    applyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const hInput = document.getElementById('custom-hour');
      const mInput = document.getElementById('custom-min');
      const h = String(hInput ? hInput.value || 18 : 18).padStart(2, '0');
      const m = String(mInput ? mInput.value || 0 : 0).padStart(2, '0');
      selectTimeValue(`${h}:${m}`);
    });
  }
}

function selectTimeValue(timeStr) {
  playClickSound();
  const hiddenInput = document.getElementById('task-due-time');
  const displayText = document.getElementById('timepicker-display-text');

  if (hiddenInput) hiddenInput.value = timeStr;
  if (displayText) displayText.textContent = timeStr;

  if (timeStr && timeStr.includes(':')) {
    const [h, m] = timeStr.split(':');
    const hInput = document.getElementById('custom-hour');
    const mInput = document.getElementById('custom-min');
    if (hInput) hInput.value = parseInt(h);
    if (mInput) mInput.value = parseInt(m);
  }

  const popover = document.getElementById('time-popover');
  if (popover) popover.classList.add('hidden');
}

function closeAllPopovers() {
  const calPopover = document.getElementById('calendar-popover');
  const timePopover = document.getElementById('time-popover');
  if (calPopover) calPopover.classList.add('hidden');
  if (timePopover) timePopover.classList.add('hidden');
  document.querySelectorAll('.neu-custom-dropdown').forEach(d => d.classList.remove('open'));
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Global Window Exports for Mobile Inline Handlers
window.openTaskModal = openTaskModal;
window.closeTaskModal = closeTaskModal;
window.handleSaveTask = handleSaveTask;
window.toggleTheme = toggleTheme;
window.setFilter = setFilter;
window.setCategory = setCategory;
