/**
 * Gate 4 Stress & Chaos Test Suite ("Break it on purpose")
 * Tests:
 * 1. Rapid Refresh / Multi-init Stress Test
 * 2. Duplicate Create Under High Concurrency
 * 3. Repeated Rapid Edits on Same Task (Rescheduling & Ghost Timer Cleanup)
 * 4. Delete-While-Pending (Cancel timer before firing)
 * 5. Close / Reopen Reconciliation (Handling missed reminders without silent loss)
 * 6. Offline Mode Operations (100% functionality without backend)
 * 7. Deny Permission Mid-Use (Safe fallback without unhandled exceptions)
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { indexedDB } = require(path.join(__dirname, '../server/node_modules/fake-indexeddb'));

// Global browser shims
global.indexedDB = indexedDB;
global.window = {
  location: { hostname: 'localhost', port: '3001' },
  atob: (b) => Buffer.from(b, 'base64').toString('binary'),
  addEventListener: () => {},
  removeEventListener: () => {}
};
global.document = {
  getElementById: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {}
};
global.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; }
};
global.BroadcastChannel = class {
  postMessage() {}
  close() {}
};
global.updateOnlineStatus = () => {};
global.showToast = () => {};
global.playClickSound = () => {};
global.playSuccessChime = () => {};
global.playAlarmChime = () => {};

// Load app module classes and functions
const appCode = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const snippet = appCode.slice(
  appCode.indexOf('class LocalDBManager'),
  appCode.indexOf('// ==========================================================================\n// 2. WEB AUDIO')
);
vm.runInThisContext(snippet);

function getFormattedDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function runGate4StressTests() {
  console.log('====================================================');
  console.log('💥 RUNNING GATE 4 STRESS & CHAOS TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
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

  // 1. RAPID REFRESH / MULTI-INIT STRESS TEST
  await test('STRESS 1: Rapid re-initializations of LocalDBManager & AppState', async () => {
    await localDB.clear();

    // Add 5 initial reminders
    for (let i = 1; i <= 5; i++) {
      await localDB.save(normalizeReminder({
        id: `stress-init-${i}`,
        title: `Reminder ${i}`,
        date: getFormattedDate(i),
        time: '12:00',
        priority: 'Medium'
      }));
    }

    // Simulate 20 rapid sequential & parallel reloads
    const reloads = Array.from({ length: 20 }, async () => {
      const db = new LocalDBManager();
      const stateInst = new AppState();
      await stateInst.fetchReminders();
      return stateInst.rawTasks.length;
    });

    const results = await Promise.all(reloads);
    results.forEach((count) => {
      assert.strictEqual(count, 5, 'Every rapid reload instance must see exactly 5 records');
    });
  });

  // 2. DUPLICATE CREATE UNDER HIGH CONCURRENCY
  await test('STRESS 2: Concurrent create calls with duplicate ID protection', async () => {
    const stateInst = new AppState();
    await localDB.clear();

    // Simulate 10 rapid concurrent attempts to save task with same ID
    const sameId = 'stress-concurrent-task';
    const concurrentSaves = Array.from({ length: 10 }, (_, i) => {
      return stateInst.addTask({
        id: sameId,
        title: `Concurrent Title ${i}`,
        date: getFormattedDate(1),
        time: '15:00',
        priority: 'High'
      });
    });

    await Promise.all(concurrentSaves);

    // In-memory must have exactly 1 task
    assert.strictEqual(stateInst.rawTasks.length, 1, 'Concurrent writes with same ID must not duplicate in memory');
    // IndexedDB must have exactly 1 task
    const allInDb = await localDB.getAll();
    assert.strictEqual(allInDb.length, 1, 'IndexedDB must contain exactly 1 task (no duplicate rows)');
  });

  // 3. REPEATED RAPID EDITS ON SAME TASK
  await test('STRESS 3: Repeated rapid edits update in-place without ghost timers', async () => {
    const stateInst = new AppState();
    await localDB.clear();
    clientScheduler.clearAll();

    await stateInst.addTask({
      id: 'stress-edit-task',
      title: 'Original Title',
      date: getFormattedDate(1),
      time: '10:00',
      priority: 'Low'
    });

    // 15 rapid edits in sequence
    for (let i = 1; i <= 15; i++) {
      await stateInst.updateTask('stress-edit-task', {
        title: `Title Edit ${i}`,
        time: `1${i % 9}:00`,
        priority: i % 2 === 0 ? 'Critical' : 'High'
      });
    }

    assert.strictEqual(stateInst.rawTasks.length, 1, 'Length must remain 1 after 15 edits');
    assert.strictEqual(stateInst.rawTasks[0].title, 'Title Edit 15');
    // Verify clientScheduler active timers has exactly 1 timer
    assert.strictEqual(clientScheduler.activeTimers.size, 1, 'Must have exactly 1 active timer (no ghost timers)');
  });

  // 4. DELETE-WHILE-PENDING (CANCEL TIMER BEFORE FIRING)
  await test('STRESS 4: Delete-while-pending cancels timer and prevents execution', async () => {
    const stateInst = new AppState();
    await localDB.clear();
    clientScheduler.clearAll();

    let triggeredCount = 0;
    const originalTrigger = clientScheduler.triggerReminder;
    clientScheduler.triggerReminder = (t) => {
      triggeredCount++;
    };

    // Schedule task due in 80ms
    const now = new Date();
    now.setMilliseconds(now.getMilliseconds() + 80);
    const scheduledAt = now.toISOString();

    await stateInst.addTask({
      id: 'stress-del-pending',
      title: 'Pending Alarm',
      scheduled_at: scheduledAt,
      date: getFormattedDate(0),
      time: '23:59'
    });

    assert.ok(clientScheduler.hasTimer('stress-del-pending'), 'Timer must be registered');

    // Immediately delete task before 80ms expires
    await stateInst.deleteTask('stress-del-pending');
    assert.strictEqual(clientScheduler.hasTimer('stress-del-pending'), false, 'Timer must be cancelled immediately');

    // Wait 120ms past the scheduled time
    await new Promise(r => setTimeout(r, 120));

    assert.strictEqual(triggeredCount, 0, 'Trigger must NOT fire after task was deleted');

    // Restore original trigger
    clientScheduler.triggerReminder = originalTrigger;
  });

  // 5. CLOSE / REOPEN RECONCILIATION (MISSED REMINDERS)
  await test('STRESS 5: Reconciles missed reminders from when app was closed', async () => {
    const stateInst = new AppState();
    await localDB.clear();

    // Create a reminder that was due 10 minutes ago
    const pastTime = new Date(Date.now() - 600000);
    const y = pastTime.getFullYear();
    const m = String(pastTime.getMonth() + 1).padStart(2, '0');
    const d = String(pastTime.getDate()).padStart(2, '0');
    const hh = String(pastTime.getHours()).padStart(2, '0');
    const mm = String(pastTime.getMinutes()).padStart(2, '0');

    await localDB.save(normalizeReminder({
      id: 'task-missed-101',
      title: 'Missed Medication Reminder',
      date: `${y}-${m}-${d}`,
      time: `${hh}:${mm}`,
      scheduled_at: `${y}-${m}-${d}T${hh}:${mm}:00`,
      priority: 'Critical',
      reminderStatus: 'pending',
      completionStatus: 'pending'
    }));

    // Boot app and run reconciliation
    await stateInst.fetchReminders();
    clientScheduler.reconcileMissedReminders(stateInst.rawTasks);

    const task = stateInst.rawTasks.find(t => t.id === 'task-missed-101');
    assert.ok(task, 'Task must exist');
    assert.strictEqual(task.reminderStatus, 'missed', 'Overdue task must be flagged as missed');
  });

  // 6. OFFLINE MODE (100% PERSISTENT WITHOUT BACKEND)
  await test('STRESS 6: Complete CRUD operates offline when backend is unreachable', async () => {
    // Force backend fetch to reject
    global.fetch = async () => {
      throw new Error('Failed to fetch: Network unreachable');
    };

    const stateInst = new AppState();
    await localDB.clear();

    // Create offline
    const created = await stateInst.addTask({
      id: 'offline-task-1',
      title: 'Buy Groceries Offline',
      date: getFormattedDate(1),
      time: '18:00',
      priority: 'Medium'
    });
    assert.ok(created);
    assert.strictEqual(stateInst.rawTasks.length, 1);

    // Read offline
    const inDb = await localDB.getById('offline-task-1');
    assert.strictEqual(inDb.title, 'Buy Groceries Offline');

    // Update offline
    await stateInst.updateTask('offline-task-1', { title: 'Buy Organic Groceries' });
    const updatedInDb = await localDB.getById('offline-task-1');
    assert.strictEqual(updatedInDb.title, 'Buy Organic Groceries');

    // Complete offline
    await stateInst.toggleComplete('offline-task-1');
    assert.strictEqual(stateInst.rawTasks[0].completionStatus, 'completed');

    // Delete offline
    await stateInst.deleteTask('offline-task-1');
    assert.strictEqual(stateInst.rawTasks.length, 0);
    const afterDelete = await localDB.getById('offline-task-1');
    assert.strictEqual(afterDelete, null);
  });

  // 7. DENY PERMISSION MID-USE
  await test('STRESS 7: Triggering reminder when permission is denied handles gracefully', () => {
    global.Notification = {
      permission: 'denied'
    };

    const task = normalizeReminder({
      id: 'task-perm-denied-test',
      title: 'Permission Denied Safe Test',
      date: getFormattedDate(0),
      time: '12:00'
    });

    // triggerReminder must NOT throw when permission is denied
    assert.doesNotThrow(() => {
      clientScheduler.triggerReminder(task);
    }, 'triggerReminder must execute cleanly without throwing when Notification permission is denied');
  });

  console.log('\n====================================================');
  console.log(`📊 STRESS TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runGate4StressTests().catch(err => {
  console.error('Stress test error:', err);
  process.exit(1);
});
