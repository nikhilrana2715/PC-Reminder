const cron = require('node-cron');
const webPush = require('web-push');
const db = require('./db');
require('dotenv').config();

// Configure Web Push VAPID keys
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@neumoremind.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  console.log('Web Push VAPID keys configured on scheduler!');
} else {
  console.warn('VAPID keys not configured in process.env. Web Push will be disabled.');
}

function initScheduler() {
  console.log('Starting Production Backend Reminder Scheduler (Every 10 seconds)...');

  // Cron job running every 10 seconds
  cron.schedule('*/10 * * * * *', async () => {
    try {
      await processDueReminders();
    } catch (e) {
      console.error('Error processing due reminders in scheduler:', e);
    }
  });
}

async function processDueReminders() {
  const now = new Date();
  const currentIsoDate = getFormattedDate(0);
  const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const allReminders = db.data.reminders;

  for (const reminder of allReminders) {
    if (reminder.completed === 1 || reminder.notification_enabled === 0) continue;

    // Check due time match
    const isDue = (reminder.date === currentIsoDate && reminder.time === currentHHMM);

    if (!isDue) continue;

    // Idempotency check: don't notify twice in the same minute
    if (reminder.last_notified_at) {
      const lastNotifiedDate = new Date(reminder.last_notified_at);
      const diffMs = now.getTime() - lastNotifiedDate.getTime();
      if (diffMs < 55000) continue; // Skip if notified within last 55 seconds
    }

    console.log(`[SCHEDULER] ⏰ Reminder Due: "${reminder.title}" (ID: ${reminder.id})`);

    // Dispatch Web Push Notifications
    const pushSuccess = await dispatchWebPush(reminder);

    // Update last_notified_at
    db.updateReminder(reminder.id, { last_notified_at: now.toISOString() });

    // Handle Recurrence
    if (reminder.recurrence_type && reminder.recurrence_type !== 'once') {
      advanceRecurringReminder(reminder);
    }
  }
}

async function dispatchWebPush(reminder) {
  const subscriptions = db.getPushSubscriptions(reminder.user_id || 'default_user');
  if (subscriptions.length === 0) {
    console.log(`[SCHEDULER] No active push subscriptions found for user ${reminder.user_id}`);
    return false;
  }

  const payload = JSON.stringify({
    title: '⏰ Reminder Due',
    body: `${reminder.title}${reminder.notes ? '\n' + reminder.notes : ''}`,
    icon: 'assets/icons/favicon.svg',
    badge: 'assets/icons/favicon.svg',
    tag: reminder.id,
    data: {
      reminderId: reminder.id,
      title: reminder.title,
      date: reminder.date,
      time: reminder.time,
      category: reminder.category,
      priority: reminder.priority,
      url: './'
    },
    actions: [
      { action: 'open', title: '📖 Open' },
      { action: 'complete', title: '✓ Complete' },
      { action: 'snooze_5m', title: '💤 Snooze 5m' }
    ]
  });

  let sentCount = 0;

  for (const sub of subscriptions) {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth
      }
    };

    try {
      await webPush.sendNotification(pushSubscription, payload);
      sentCount++;
      db.logNotificationEvent({
        reminder_id: reminder.id,
        user_id: reminder.user_id,
        event_type: 'web_push_sent',
        status: 'success',
        payload
      });
    } catch (err) {
      console.error(`[SCHEDULER] Push delivery failed for endpoint: ${sub.endpoint.slice(0, 30)}...`, err.statusCode || err.message);
      
      // Clean up invalid or expired subscriptions (404 Not Found or 410 Gone)
      if (err.statusCode === 410 || err.statusCode === 404) {
        console.log(`[SCHEDULER] Removing expired push subscription endpoint: ${sub.endpoint.slice(0, 30)}...`);
        db.deletePushSubscription(sub.endpoint);
      }

      db.logNotificationEvent({
        reminder_id: reminder.id,
        user_id: reminder.user_id,
        event_type: 'web_push_failed',
        status: 'error',
        payload: err.message
      });
    }
  }

  return sentCount > 0;
}

function advanceRecurringReminder(reminder) {
  const currentObj = new Date(`${reminder.date}T${reminder.time}:00`);
  let nextObj = new Date(currentObj.getTime());

  switch (reminder.recurrence_type) {
    case 'daily':
      nextObj.setDate(nextObj.getDate() + 1);
      break;
    case 'weekdays':
      do {
        nextObj.setDate(nextObj.getDate() + 1);
      } while (nextObj.getDay() === 0 || nextObj.getDay() === 6); // Skip Sun(0), Sat(6)
      break;
    case 'weekly':
      nextObj.setDate(nextObj.getDate() + 7);
      break;
    case 'monthly':
      nextObj.setMonth(nextObj.getMonth() + 1);
      break;
    default:
      return;
  }

  const year = nextObj.getFullYear();
  const month = String(nextObj.getMonth() + 1).padStart(2, '0');
  const day = String(nextObj.getDate()).padStart(2, '0');
  const nextDateStr = `${year}-${month}-${day}`;

  console.log(`[RECURRENCE] Advancing recurring task "${reminder.title}" from ${reminder.date} to ${nextDateStr}`);

  db.updateReminder(reminder.id, {
    date: nextDateStr,
    scheduled_at: `${nextDateStr}T${reminder.time}:00`
  });
}

function getFormattedDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

module.exports = {
  initScheduler,
  processDueReminders,
  dispatchWebPush
};
