const fs = require('fs');
const path = require('path');

const dbFilePath = path.join(__dirname, 'neumoremind_db.json');

// Default initial database state
const INITIAL_DATA = {
  users: [
    {
      id: 'default_user',
      name: 'Desktop User',
      email: 'user@neumoremind.app',
      timezone: 'Asia/Kolkata',
      created_at: Date.now()
    }
  ],
  reminders: [
    {
      id: 'task-101',
      user_id: 'default_user',
      title: 'Review Quarterly Budget Proposal 📊',
      description: 'Check revenue projections and operational expenditure for Q4 presentation.',
      date: getFormattedDate(0),
      time: '21:30',
      scheduled_at: `${getFormattedDate(0)}T21:30:00`,
      timezone: 'Asia/Kolkata',
      priority: 'high',
      category: 'Finance',
      tag: 'budget',
      status: 'active',
      completed: 0,
      completed_at: null,
      recurrence_type: 'once',
      recurrence_rule: null,
      notification_enabled: 1,
      sound_enabled: 1,
      location: 'Office Conference Room',
      notes: 'Check revenue projections',
      created_at: Date.now() - 3600000 * 24,
      updated_at: Date.now() - 3600000 * 24,
      snoozed_until: null,
      last_notified_at: null
    },
    {
      id: 'task-102',
      user_id: 'default_user',
      title: 'Team Sync & Project Roadmap 🚀',
      description: 'Discuss Neumorphic UI design system updates and desktop PWA release schedule.',
      date: getFormattedDate(0),
      time: '22:00',
      scheduled_at: `${getFormattedDate(0)}T22:00:00`,
      timezone: 'Asia/Kolkata',
      priority: 'medium',
      category: 'Work',
      tag: 'meeting',
      status: 'active',
      completed: 0,
      completed_at: null,
      recurrence_type: 'daily',
      recurrence_rule: 'daily',
      notification_enabled: 1,
      sound_enabled: 1,
      location: 'Zoom Link',
      notes: 'Discuss PWA release',
      created_at: Date.now() - 3600000 * 12,
      updated_at: Date.now() - 3600000 * 12,
      snoozed_until: null,
      last_notified_at: null
    },
    {
      id: 'task-103',
      user_id: 'default_user',
      title: 'Evening Workout & Hydration 🏋️‍♂️',
      description: '30 mins cardio + stretching session. Drink at least 2L of water.',
      date: getFormattedDate(1),
      time: '19:00',
      scheduled_at: `${getFormattedDate(1)}T19:00:00`,
      timezone: 'Asia/Kolkata',
      priority: 'low',
      category: 'Health',
      tag: 'fitness',
      status: 'active',
      completed: 0,
      completed_at: null,
      recurrence_type: 'weekdays',
      recurrence_rule: 'weekdays',
      notification_enabled: 1,
      sound_enabled: 1,
      location: 'Local Gym',
      notes: 'Hydrate well',
      created_at: Date.now() - 3600000 * 5,
      updated_at: Date.now() - 3600000 * 5,
      snoozed_until: null,
      last_notified_at: null
    }
  ],
  push_subscriptions: [],
  notification_events: []
};

function getFormattedDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

class PersistentDB {
  constructor() {
    this.data = this.load();
  }

  load() {
    if (!fs.existsSync(dbFilePath)) {
      this.saveData(INITIAL_DATA);
      return INITIAL_DATA;
    }
    try {
      const raw = fs.readFileSync(dbFilePath, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      console.error('Error reading database file, resetting to initial state', e);
      this.saveData(INITIAL_DATA);
      return INITIAL_DATA;
    }
  }

  saveData(data = this.data) {
    try {
      const tempPath = `${dbFilePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tempPath, dbFilePath);
    } catch (e) {
      console.error('Error writing database file', e);
    }
  }

  // --- REMINDER CRUD & QUERIES ---

  getReminders(params = {}) {
    const {
      filter = 'all',
      category = 'all',
      priority = 'all',
      search = '',
      sort = 'dueDateAsc'
    } = params;

    const todayStr = getFormattedDate(0);

    // 1. Calculate overall metrics from total DB records
    const allReminders = this.data.reminders;
    const totalCount = allReminders.length;
    const completedCount = allReminders.filter(r => r.completed === 1 || r.completionStatus === 'completed').length;
    const todayCount = allReminders.filter(r => r.date === todayStr && r.completed !== 1 && r.completionStatus !== 'completed').length;
    const upcomingCount = allReminders.filter(r => r.date > todayStr && r.completed !== 1 && r.completionStatus !== 'completed').length;
    const overdueCount = allReminders.filter(r => r.date && r.date < todayStr && r.completed !== 1 && r.completionStatus !== 'completed').length;
    const highCriticalCount = allReminders.filter(r => {
      const p = (r.priority || '').toLowerCase();
      return (p === 'high' || p === 'critical') && r.completed !== 1 && r.completionStatus !== 'completed';
    }).length;

    const categoryCounts = {
      Work: allReminders.filter(r => r.category === 'Work').length,
      Personal: allReminders.filter(r => r.category === 'Personal').length,
      Health: allReminders.filter(r => r.category === 'Health').length,
      Finance: allReminders.filter(r => r.category === 'Finance').length,
      Shopping: allReminders.filter(r => r.category === 'Shopping').length
    };

    const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    // 2. Filter records
    let filtered = allReminders.filter(r => {
      const isCompleted = r.completed === 1 || r.completionStatus === 'completed';

      // Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const mTitle = (r.title || '').toLowerCase().includes(q);
        const mDesc = (r.description || r.notes || '').toLowerCase().includes(q);
        const mCat = (r.category || '').toLowerCase().includes(q);
        const mTag = (r.tag || '').toLowerCase().includes(q);
        const mPrio = (r.priority || '').toLowerCase().includes(q);
        if (!mTitle && !mDesc && !mCat && !mTag && !mPrio) return false;
      }

      // Category
      if (category !== 'all' && (r.category || '').toLowerCase() !== category.toLowerCase()) {
        return false;
      }

      // Priority
      if (priority !== 'all' && (r.priority || '').toLowerCase() !== priority.toLowerCase()) {
        return false;
      }

      // Filter View
      switch (filter) {
        case 'today':
          return r.date === todayStr && !isCompleted;
        case 'upcoming':
          return r.date > todayStr && !isCompleted;
        case 'overdue':
          return r.date && r.date < todayStr && !isCompleted;
        case 'completed':
          return isCompleted;
        case 'all':
        default:
          return true;
      }
    });

    // 3. Sort records
    filtered.sort((a, b) => {
      // Pinned first
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;

      const pMap = { critical: 4, high: 3, medium: 2, low: 1 };

      switch (sort) {
        case 'dueDateAsc':
          return (a.scheduled_at || (a.date + a.time) || '').localeCompare(b.scheduled_at || (b.date + b.time) || '');
        case 'dueDateDesc':
          return (b.scheduled_at || (b.date + b.time) || '').localeCompare(a.scheduled_at || (a.date + a.time) || '');
        case 'priorityHigh':
          return (pMap[(b.priority || '').toLowerCase()] || 0) - (pMap[(a.priority || '').toLowerCase()] || 0);
        case 'titleAsc':
          return (a.title || '').localeCompare(b.title || '');
        case 'titleDesc':
          return (b.title || '').localeCompare(a.title || '');
        case 'createdOldest':
          return (a.created_at || a.createdAt || 0) - (b.created_at || b.createdAt || 0);
        case 'createdDesc':
        default:
          return (b.created_at || b.createdAt || 0) - (a.created_at || a.createdAt || 0);
      }
    });

    return {
      reminders: filtered,
      metrics: {
        total: totalCount,
        completed: completedCount,
        today: todayCount,
        upcoming: upcomingCount,
        overdue: overdueCount,
        highCritical: highCriticalCount,
        categories: categoryCounts,
        progressPercent
      }
    };
  }

  getReminderById(id) {
    return this.data.reminders.find(r => r.id === id) || null;
  }

  createReminder(reminderData) {
    const id = reminderData.id || `task-${Date.now()}`;
    const now = Date.now();

    const scheduled_at = reminderData.scheduled_at || `${reminderData.date}T${reminderData.time}:00`;

    const reminder = {
      id,
      user_id: reminderData.user_id || 'default_user',
      title: reminderData.title,
      description: reminderData.description || '',
      date: reminderData.date || getFormattedDate(0),
      time: reminderData.time || '18:00',
      scheduled_at,
      timezone: reminderData.timezone || 'Asia/Kolkata',
      priority: reminderData.priority || 'medium',
      category: reminderData.category || 'Personal',
      tag: reminderData.tag || '',
      status: 'active',
      completed: reminderData.completed ? 1 : 0,
      completed_at: reminderData.completed ? new Date().toISOString() : null,
      recurrence_type: reminderData.recurrence_type || 'once',
      recurrence_rule: reminderData.recurrence_rule || null,
      notification_enabled: reminderData.notification_enabled !== undefined ? (reminderData.notification_enabled ? 1 : 0) : 1,
      sound_enabled: reminderData.sound_enabled !== undefined ? (reminderData.sound_enabled ? 1 : 0) : 1,
      location: reminderData.location || '',
      notes: reminderData.notes || reminderData.description || '',
      pinned: !!reminderData.pinned,
      created_at: now,
      updated_at: now,
      snoozed_until: null,
      last_notified_at: null
    };

    this.data.reminders.push(reminder);
    this.saveData();
    return reminder;
  }

  updateReminder(id, updates) {
    const index = this.data.reminders.findIndex(r => r.id === id);
    if (index === -1) return null;

    const existing = this.data.reminders[index];
    const updated = {
      ...existing,
      ...updates,
      updated_at: Date.now()
    };

    if (updates.date || updates.time) {
      const d = updates.date || existing.date;
      const t = updates.time || existing.time;
      updated.scheduled_at = `${d}T${t}:00`;
    }

    this.data.reminders[index] = updated;
    this.saveData();
    return updated;
  }

  deleteReminder(id) {
    const initialLen = this.data.reminders.length;
    this.data.reminders = this.data.reminders.filter(r => r.id !== id);
    this.saveData();
    return this.data.reminders.length < initialLen;
  }

  toggleComplete(id) {
    const reminder = this.getReminderById(id);
    if (!reminder) return null;

    const newCompleted = reminder.completed === 1 ? 0 : 1;
    reminder.completed = newCompleted;
    reminder.completed_at = newCompleted === 1 ? new Date().toISOString() : null;
    reminder.updated_at = Date.now();

    this.saveData();
    return reminder;
  }

  snoozeReminder(id, minutes = 5) {
    const reminder = this.getReminderById(id);
    if (!reminder) return null;

    const now = new Date();
    now.setMinutes(now.getMinutes() + minutes);

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');

    reminder.date = `${year}-${month}-${day}`;
    reminder.time = `${h}:${m}`;
    reminder.scheduled_at = `${year}-${month}-${day}T${h}:${m}:00`;
    reminder.snoozed_until = now.toISOString();
    reminder.updated_at = Date.now();

    this.saveData();
    return reminder;
  }

  // --- PUSH SUBSCRIPTION & SCHEDULER HELPERS ---

  savePushSubscription(subscriptionData) {
    const { endpoint, keys, user_id = 'default_user' } = subscriptionData;
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      throw new Error('Invalid PushSubscription payload');
    }

    const existingIndex = this.data.push_subscriptions.findIndex(s => s.endpoint === endpoint);
    const record = {
      id: `sub-${Date.now()}`,
      user_id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      created_at: Date.now()
    };

    if (existingIndex !== -1) {
      this.data.push_subscriptions[existingIndex] = record;
    } else {
      this.data.push_subscriptions.push(record);
    }

    this.saveData();
    return record;
  }

  getPushSubscriptions(user_id = 'default_user') {
    return this.data.push_subscriptions.filter(s => s.user_id === user_id);
  }

  deletePushSubscription(endpoint) {
    this.data.push_subscriptions = this.data.push_subscriptions.filter(s => s.endpoint !== endpoint);
    this.saveData();
  }

  logNotificationEvent(event) {
    const record = {
      id: `evt-${Date.now()}`,
      ...event,
      delivered_at: Date.now()
    };
    this.data.notification_events.push(record);
    this.saveData();
    return record;
  }
}

const dbInstance = new PersistentDB();
module.exports = dbInstance;
