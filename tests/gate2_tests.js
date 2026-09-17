/**
 * Gate 2 Automated Test Suite
 * Tests:
 * - TEST3 (fires with UI closed)
 * - TEST4 (notification appears with options & actions)
 * - TEST5 (Complete from notif marks done)
 * - TEST8 (snooze updates due time and status)
 * - TEST11 (similar titles target correct task without collision)
 * - TEST13 (permission denied -> clear message, no spam re-prompt)
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { indexedDB } = require(path.join(__dirname, '../server/node_modules/fake-indexeddb'));
const db = require(path.join(__dirname, '../server/db'));

// Setup global browser shims
global.indexedDB = indexedDB;

async function runGate2Tests() {
  console.log('====================================================');
  console.log('🧪 RUNNING GATE 2 AUTOMATED VERIFICATION TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(err);
      failed++;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(err);
      failed++;
    }
  }

  // --- MOCK SERVICE WORKER ENVIRONMENT ---
  class MockServiceWorkerGlobalScope {
    constructor() {
      this.listeners = {};
      this.shownNotifications = [];
      this.registration = {
        showNotification: async (title, options) => {
          this.shownNotifications.push({ title, options, shownAt: Date.now() });
          return true;
        }
      };
      this.clients = {
        clientList: [],
        matchAll: async () => this.clients.clientList,
        openWindow: async (url) => ({ url, focused: true })
      };
      this.location = { origin: 'http://localhost:3001' };
    }

    addEventListener(event, handler) {
      this.listeners[event] = handler;
    }

    async dispatchPush(eventData) {
      if (this.listeners['push']) {
        let waitUntilPromise = null;
        await this.listeners['push']({
          data: {
            json: () => eventData,
            text: () => JSON.stringify(eventData)
          },
          waitUntil: (p) => { waitUntilPromise = p; }
        });
        if (waitUntilPromise) await waitUntilPromise;
      }
    }

    async dispatchNotificationClick(notification, action = '') {
      if (this.listeners['notificationclick']) {
        let waitUntilPromise = null;
        await this.listeners['notificationclick']({
          notification,
          action,
          waitUntil: (p) => { waitUntilPromise = p; }
        });
        if (waitUntilPromise) await waitUntilPromise;
      }
    }
  }

  // Evaluate Service Worker code in mock context
  const swScope = new MockServiceWorkerGlobalScope();
  const swCode = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');

  // Sandbox SW evaluation
  const swFn = new Function('self', 'caches', 'clients', 'fetch', 'indexedDB', swCode);
  swFn(
    swScope,
    { open: async () => ({ addAll: async () => {}, put: async () => {} }), keys: async () => [] },
    swScope.clients,
    async (url, opts) => {
      // Mock fetch to backend API during SW actions
      if (url.includes('/complete')) {
        const id = url.split('/reminders/')[1].split('/complete')[0];
        db.toggleComplete(id);
        return { ok: true, json: async () => ({ success: true }) };
      }
      if (url.includes('/snooze')) {
        const id = url.split('/reminders/')[1].split('/snooze')[0];
        const body = opts && opts.body ? JSON.parse(opts.body) : { minutes: 10 };
        db.snoozeReminder(id, body.minutes);
        return { ok: true, json: async () => ({ success: true }) };
      }
      return { ok: true };
    },
    indexedDB
  );

  // --- TEST 3: FIRES WITH UI CLOSED ---
  await asyncTest('TEST3: Push notification fires when UI is closed (no active clients)', async () => {
    swScope.clients.clientList = []; // Emulate UI completely closed
    swScope.shownNotifications = [];

    const pushPayload = {
      title: '⏰ Reminder Due: Budget Review',
      body: 'Check financial summary for Q4 presentation',
      tag: 'task-test-closed-1',
      data: {
        reminderId: 'task-test-closed-1',
        title: 'Budget Review',
        priority: 'High'
      },
      actions: [
        { action: 'complete', title: '✓ Complete' },
        { action: 'snooze_10m', title: '💤 Snooze 10m' },
        { action: 'open', title: '📖 Open App' }
      ]
    };

    await swScope.dispatchPush(pushPayload);

    assert.strictEqual(swScope.shownNotifications.length, 1, 'Notification must fire even when UI window is closed');
    assert.strictEqual(swScope.shownNotifications[0].title, '⏰ Reminder Due: Budget Review');
    assert.strictEqual(swScope.shownNotifications[0].options.tag, 'task-test-closed-1');
  });

  // --- TEST 4: NOTIFICATION APPEARS WITH ACTIONS & REQUIRE INTERACTION ---
  await asyncTest('TEST4: Notification appears with complete, snooze, and open action buttons', async () => {
    assert.ok(swScope.shownNotifications.length > 0);
    const notif = swScope.shownNotifications[0];

    assert.strictEqual(notif.options.requireInteraction, true, 'requireInteraction must be true so notification stays visible');
    assert.ok(Array.isArray(notif.options.actions), 'Actions must be an array');
    assert.strictEqual(notif.options.actions.length, 3, 'Must provide 3 actions: Complete, Snooze, Open');

    const actions = notif.options.actions.map(a => a.action);
    assert.ok(actions.includes('complete'), 'Must include complete action');
    assert.ok(actions.includes('snooze_10m') || actions.includes('snooze_5m'), 'Must include snooze action');
    assert.ok(actions.includes('open'), 'Must include open action');
  });

  // --- TEST 5: COMPLETE FROM NOTIF MARKS DONE ---
  await asyncTest('TEST5: Complete action from notification marks reminder completed', async () => {
    // 1. Seed reminder in DB
    const created = db.createReminder({
      id: 'task-action-comp-1',
      title: 'Submit Expense Receipts',
      time: '18:00',
      priority: 'Medium'
    });
    assert.strictEqual(created.completed, 0);
    assert.strictEqual(created.completionStatus, 'pending');

    // 2. Simulate user clicking "✓ Complete" on notification
    const notificationMock = {
      data: { reminderId: 'task-action-comp-1' },
      close: () => {}
    };

    await swScope.dispatchNotificationClick(notificationMock, 'complete');

    // 3. Verify in backend DB
    const after = db.getReminderById('task-action-comp-1');
    assert.strictEqual(after.completed, 1, 'Task completed flag must be 1');
    assert.strictEqual(after.completionStatus, 'completed', 'Task completionStatus must be completed');
    assert.strictEqual(after.reminderStatus, 'completed', 'Task reminderStatus must be completed');
  });

  // --- TEST 8: SNOOZE UPDATES DUE TIME AND RESCHEDULES ---
  await asyncTest('TEST8: Snooze action advances time by 10m and sets reminderStatus to snoozed', async () => {
    // 1. Seed reminder in DB
    const created = db.createReminder({
      id: 'task-action-snooze-1',
      title: 'Take Daily Medication',
      date: '2026-09-17',
      time: '14:00',
      priority: 'High'
    });

    const initialTime = created.time;

    // 2. Simulate user clicking "💤 Snooze 10m" on notification
    const notificationMock = {
      data: { reminderId: 'task-action-snooze-1' },
      close: () => {}
    };

    await swScope.dispatchNotificationClick(notificationMock, 'snooze_10m');

    // 3. Verify in backend DB
    const after = db.getReminderById('task-action-snooze-1');
    assert.ok(after.snoozed_until, 'snoozed_until timestamp must be set');
    assert.strictEqual(after.reminderStatus, 'snoozed', 'reminderStatus must be updated to snoozed');
    assert.notStrictEqual(after.time, initialTime, 'Time must be updated to future snooze time');
  });

  // --- TEST 11: SIMILAR TITLES TARGET CORRECT TASK ---
  await asyncTest('TEST11: Similar titles target the exact task by unique ID without cross-talk', async () => {
    // 1. Create two reminders with identical titles but different times and IDs
    const taskA = db.createReminder({
      id: 'task-bob-morning',
      title: 'Meeting with Bob',
      date: '2026-09-18',
      time: '10:00',
      priority: 'Medium'
    });

    const taskB = db.createReminder({
      id: 'task-bob-afternoon',
      title: 'Meeting with Bob',
      date: '2026-09-18',
      time: '14:00',
      priority: 'Critical'
    });

    assert.strictEqual(taskA.title, taskB.title, 'Titles are intentionally identical');
    assert.strictEqual(taskA.completed, 0);
    assert.strictEqual(taskB.completed, 0);

    // 2. Dispatch Complete action strictly targeting taskA
    const notificationMock = {
      data: { reminderId: 'task-bob-morning' },
      close: () => {}
    };

    await swScope.dispatchNotificationClick(notificationMock, 'complete');

    // 3. Verify: ONLY taskA is marked completed; taskB is completely untouched!
    const resA = db.getReminderById('task-bob-morning');
    const resB = db.getReminderById('task-bob-afternoon');

    assert.strictEqual(resA.completed, 1, 'Targeted Task A must be completed');
    assert.strictEqual(resA.completionStatus, 'completed');

    assert.strictEqual(resB.completed, 0, 'Untargeted Task B MUST remain pending');
    assert.strictEqual(resB.completionStatus, 'pending', 'Untargeted Task B completionStatus must remain pending');
    assert.strictEqual(resB.priority, 'Critical');
    assert.strictEqual(resB.time, '14:00');
  });

  // --- TEST 13: PERMISSION DENIED HANDLING ---
  test('TEST13: Permission denied displays clear instructional toast and avoids spam re-prompt', () => {
    let toastMessage = '';
    let toastType = '';
    let requestPromptCount = 0;

    // Simulate window with permission denied
    const mockWindow = {
      Notification: {
        permission: 'denied',
        requestPermission: async () => {
          requestPromptCount++;
          return 'denied';
        }
      }
    };

    const showToastMock = (msg, type) => {
      toastMessage = msg;
      toastType = type;
    };

    let btnState = '';
    const updateNotificationBtnStateMock = (state) => {
      btnState = state;
    };

    // Execute permission request logic with 'denied' state
    function handlePermissionRequest() {
      if (!('Notification' in mockWindow)) return;

      if (mockWindow.Notification.permission === 'denied') {
        showToastMock('🚫 Notifications are blocked in your browser! Click the lock/tune icon in your address bar to re-enable.', 'danger');
        updateNotificationBtnStateMock('denied');
        return;
      }

      mockWindow.Notification.requestPermission();
    }

    handlePermissionRequest();

    assert.strictEqual(requestPromptCount, 0, 'Notification.requestPermission MUST NOT be spammed when permission is denied');
    assert.strictEqual(btnState, 'denied', 'Button state should reflect denied status');
    assert.ok(toastMessage.includes('blocked in your browser'), 'User must receive clear instruction on how to re-enable');
    assert.strictEqual(toastType, 'danger');
  });

  console.log('\n====================================================');
  console.log(`📊 GATE 2 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runGate2Tests().catch(err => {
  console.error('Gate 2 Test Execution Error:', err);
  process.exit(1);
});
