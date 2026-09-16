const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const db = require('./db');
const { initScheduler, dispatchWebPush } = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend assets from parent directory
app.use(express.static(path.join(__dirname, '../')));

// --- REST API ROUTES ---

// 1. Get Reminders (with Filters, Search, Sorting, and Dynamic Dashboard Metrics)
app.get('/api/reminders', (req, res) => {
  try {
    const result = db.getReminders(req.query);
    res.json(result);
  } catch (err) {
    console.error('Error fetching reminders:', err);
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
});

// 2. Get Single Reminder
app.get('/api/reminders/:id', (req, res) => {
  try {
    const reminder = db.getReminderById(req.params.id);
    if (!reminder) return res.status(404).json({ error: 'Reminder not found' });
    res.json(reminder);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reminder' });
  }
});

// 3. Create New Reminder
app.post('/api/reminders', (req, res) => {
  try {
    const { title } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    const created = db.createReminder(req.body);
    console.log(`[API] Created reminder: "${created.title}" (ID: ${created.id})`);
    res.status(201).json(created);
  } catch (err) {
    console.error('Error creating reminder:', err);
    res.status(500).json({ error: 'Failed to create reminder' });
  }
});

// 4. Update Reminder
app.put('/api/reminders/:id', (req, res) => {
  try {
    const updated = db.updateReminder(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Reminder not found' });
    console.log(`[API] Updated reminder: "${updated.title}" (ID: ${updated.id})`);
    res.json(updated);
  } catch (err) {
    console.error('Error updating reminder:', err);
    res.status(500).json({ error: 'Failed to update reminder' });
  }
});

// 5. Delete Reminder
app.delete('/api/reminders/:id', (req, res) => {
  try {
    const success = db.deleteReminder(req.params.id);
    if (!success) return res.status(404).json({ error: 'Reminder not found' });
    console.log(`[API] Deleted reminder ID: ${req.params.id}`);
    res.json({ success: true, message: 'Reminder deleted' });
  } catch (err) {
    console.error('Error deleting reminder:', err);
    res.status(500).json({ error: 'Failed to delete reminder' });
  }
});

// 6. Toggle Complete / Uncomplete
app.post('/api/reminders/:id/complete', (req, res) => {
  try {
    const updated = db.toggleComplete(req.params.id);
    if (!updated) return res.status(404).json({ error: 'Reminder not found' });
    console.log(`[API] Toggled complete for ID: ${req.params.id} -> Completed: ${updated.completed}`);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle complete status' });
  }
});

// 7. Snooze Reminder
app.post('/api/reminders/:id/snooze', (req, res) => {
  try {
    const minutes = parseInt(req.body.minutes) || 5;
    const updated = db.snoozeReminder(req.params.id, minutes);
    if (!updated) return res.status(404).json({ error: 'Reminder not found' });
    console.log(`[API] Snoozed reminder ID: ${req.params.id} for ${minutes} minutes`);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to snooze reminder' });
  }
});

// 8. Get VAPID Public Key
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
});

// 9. Save Push Subscription
app.post('/api/push-subscriptions', (req, res) => {
  try {
    const record = db.savePushSubscription(req.body);
    console.log(`[API] Saved Web Push subscription endpoint: ${record.endpoint.slice(0, 35)}...`);
    res.status(201).json({ success: true, record });
  } catch (err) {
    console.error('Error saving push subscription:', err);
    res.status(400).json({ error: err.message || 'Invalid push subscription' });
  }
});

// 10. Trigger Test Web Push Notification
app.post('/api/test-push', async (req, res) => {
  try {
    const testReminder = {
      id: `test-${Date.now()}`,
      user_id: 'default_user',
      title: '🔔 Test Web Push Notification',
      notes: 'Web Push & Service Worker integration verified successfully!',
      date: new Date().toISOString().split('T')[0],
      time: '12:00',
      category: 'Work',
      priority: 'high'
    };

    const sent = await dispatchWebPush(testReminder);
    if (sent) {
      res.json({ success: true, message: 'Test Web Push notification sent!' });
    } else {
      res.status(400).json({ error: 'No active push subscriptions found. Please enable notifications first.' });
    }
  } catch (err) {
    console.error('Error triggering test push:', err);
    res.status(500).json({ error: 'Failed to send test push notification' });
  }
});

// 11. System Health & Diagnostics
app.get('/api/system-status', (req, res) => {
  const subs = db.getPushSubscriptions();
  res.json({
    status: 'online',
    serverTime: new Date().toISOString(),
    timezone: 'Asia/Kolkata',
    database: 'SQLite (JSON persistent WAL)',
    activeSubscriptions: subs.length,
    vapidConfigured: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
  });
});

// Start Express Server & Backend Scheduler
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 NeumoRemind Full-Stack Server Running on Port ${PORT}`);
  console.log(`🌐 Server URL: http://localhost:${PORT}`);
  console.log(`====================================================`);
  initScheduler();
});
