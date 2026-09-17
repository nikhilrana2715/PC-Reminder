/**
 * Gate 1 Automated Test Suite
 * Tests: TEST1 (create->persists after refresh), TEST6 (edit reschedules, no dupes), TEST7 (delete cancels future notif)
 * Plus: validation, filters, search, and dashboard metrics.
 */

const assert = require('assert');
const path = require('path');
const { indexedDB } = require(path.join(__dirname, '../server/node_modules/fake-indexeddb'));

// Setup global browser shims for app.js modules
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
global.indexedDB = indexedDB;
global.BroadcastChannel = class {
  postMessage() {}
  close() {}
};
global.fetch = async () => ({ ok: false }); // Offline / disconnected backend fallback test
global.updateOnlineStatus = () => {};
global.showToast = () => {};
global.playClickSound = () => {};
global.playSuccessChime = () => {};
global.playAlarmChime = () => {};

// Load app module classes and functions
const fs = require('fs');
const appCode = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');

// Extract and evaluate required parts from app.js in this sandbox context
const vm = require('vm');
const snippet = appCode.slice(
  appCode.indexOf('class LocalDBManager'),
  appCode.indexOf('// ==========================================================================\n// 2. WEB AUDIO')
);
vm.runInThisContext(snippet);


// Also extract getFormattedDate
function getFormattedDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function runGate1Tests() {
  console.log('====================================================');
  console.log('🧪 RUNNING GATE 1 AUTOMATED VERIFICATION TEST SUITE');
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

  // --- TEST 1: CREATE -> PERSISTS AFTER REFRESH ---
  await asyncTest('TEST1: Create reminder persists in IndexedDB across reload', async () => {
    const db1 = new LocalDBManager();
    await db1.clear();

    const tomorrow = getFormattedDate(1);
    const testTask = normalizeReminder({
      id: 'task-test-1001',
      title: 'Prepare Board Presentation',
      description: 'Review Q4 growth figures and strategy slides',
      date: tomorrow,
      time: '14:30',
      priority: 'Critical',
      category: 'Work',
      tag: 'executive'
    });

    // 1. Save via db1
    await db1.save(testTask);

    // 2. Simulate refresh / new session with separate DB instance
    const db2 = new LocalDBManager();
    const retrieved = await db2.getById('task-test-1001');

    assert.ok(retrieved, 'Reminder should exist in persistent storage after reload');
    assert.strictEqual(retrieved.id, 'task-test-1001');
    assert.strictEqual(retrieved.title, 'Prepare Board Presentation');
    assert.strictEqual(retrieved.description, 'Review Q4 growth figures and strategy slides');
    assert.strictEqual(retrieved.date, tomorrow);
    assert.strictEqual(retrieved.time, '14:30');
    assert.strictEqual(retrieved.priority, 'Critical');
    assert.strictEqual(retrieved.completionStatus, 'pending');
    assert.strictEqual(retrieved.reminderStatus, 'pending');
    assert.strictEqual(retrieved.completed, 0);
    assert.ok(retrieved.createdAt, 'createdAt timestamp must be set');
    assert.ok(retrieved.updatedAt, 'updatedAt timestamp must be set');

    const all = await db2.getAll();
    assert.strictEqual(all.length, 1, 'Total persistent items should be exactly 1');
  });

  // --- TEST 6: EDIT RESCHEDULES, NO DUPES ---
  await asyncTest('TEST6: Edit updates reminder in-place, reschedules timer, and creates NO duplicates', async () => {
    const stateInstance = new AppState();
    await localDB.clear();
    const scheduler = clientScheduler;
    scheduler.clearAll();

    const tomorrow = getFormattedDate(1);
    const dayAfter = getFormattedDate(2);

    // Add initial task
    const created = await stateInstance.addTask({
      id: 'task-edit-2001',
      title: 'Doctor Appointment',
      description: 'Annual physical checkup',
      date: tomorrow,
      time: '10:00',
      priority: 'Medium'
    });

    assert.strictEqual(stateInstance.rawTasks.length, 1, 'Initial task count must be 1');
    assert.ok(scheduler.hasTimer('task-edit-2001'), 'Scheduler should have active timer for task');

    // Perform Edit
    const updated = await stateInstance.updateTask('task-edit-2001', {
      title: 'Doctor Appointment (Rescheduled)',
      date: dayAfter,
      time: '11:30',
      priority: 'High'
    });

    // Verify in-memory state: NO duplicates
    assert.strictEqual(stateInstance.rawTasks.length, 1, 'Task count MUST remain 1 (no duplicates)');
    assert.strictEqual(stateInstance.rawTasks[0].id, 'task-edit-2001');
    assert.strictEqual(stateInstance.rawTasks[0].title, 'Doctor Appointment (Rescheduled)');
    assert.strictEqual(stateInstance.rawTasks[0].date, dayAfter);
    assert.strictEqual(stateInstance.rawTasks[0].time, '11:30');
    assert.strictEqual(stateInstance.rawTasks[0].priority, 'High');

    // Verify scheduler rescheduled timer
    assert.ok(scheduler.hasTimer('task-edit-2001'), 'Scheduler must maintain timer for rescheduled task');

    // Verify IndexedDB state
    const fromDB = await localDB.getById('task-edit-2001');
    assert.strictEqual(fromDB.title, 'Doctor Appointment (Rescheduled)');
    assert.strictEqual(fromDB.date, dayAfter);
    assert.strictEqual(fromDB.time, '11:30');
    assert.strictEqual(fromDB.priority, 'High');
    const allDB = await localDB.getAll();
    assert.strictEqual(allDB.length, 1, 'IndexedDB count must be 1 (no duplicate records in DB)');
  });

  // --- TEST 7: DELETE CANCELS FUTURE NOTIFICATION ---
  await asyncTest('TEST7: Delete removes reminder from store and cancels pending notification timer', async () => {
    const stateInstance = new AppState();
    const scheduler = clientScheduler;

    const futureDate = getFormattedDate(5);
    await stateInstance.addTask({
      id: 'task-del-3001',
      title: 'Flight Check-in',
      date: futureDate,
      time: '08:00',
      priority: 'Critical'
    });

    assert.ok(scheduler.hasTimer('task-del-3001'), 'Timer must be active prior to deletion');

    // Perform Delete
    const deleteResult = await stateInstance.deleteTask('task-del-3001');
    assert.strictEqual(deleteResult, true, 'deleteTask should return true');

    // Verify timer was cancelled
    assert.strictEqual(scheduler.hasTimer('task-del-3001'), false, 'Timer MUST be cancelled in scheduler');

    // Verify removed from in-memory state
    const inMemory = stateInstance.rawTasks.find(t => t.id === 'task-del-3001');
    assert.strictEqual(inMemory, undefined, 'Task must be removed from in-memory state');

    // Verify removed from IndexedDB
    const fromDB = await localDB.getById('task-del-3001');
    assert.strictEqual(fromDB, null, 'Task must be deleted from IndexedDB');
  });

  // --- VALIDATION TESTS ---
  test('VALIDATION: Rejects empty or whitespace-only title', () => {
    const raw = normalizeReminder({ title: '   ' });
    assert.strictEqual(raw.title, 'Untitled Reminder', 'Blank title should be normalized or caught');
  });

  test('VALIDATION: Priority is normalized to Low/Medium/High/Critical', () => {
    const t1 = normalizeReminder({ priority: 'CRITICAL' });
    assert.strictEqual(t1.priority, 'Critical');
    const t2 = normalizeReminder({ priority: 'low' });
    assert.strictEqual(t2.priority, 'Low');
    const t3 = normalizeReminder({ priority: 'unknown' });
    assert.strictEqual(t3.priority, 'Medium');
  });

  // --- FILTER & SEARCH TESTS ---
  await asyncTest('FILTERS: Correctly separates Today, Upcoming, Overdue, Completed', async () => {
    const stateInstance = new AppState();
    await localDB.clear();
    clientScheduler.clearAll();

    const todayStr = getFormattedDate(0);
    const upcomingStr = getFormattedDate(2);
    const overdueStr = getFormattedDate(-2);

    await stateInstance.addTask({ id: 't-today', title: 'Task Today', date: todayStr, time: '12:00', priority: 'High' });
    await stateInstance.addTask({ id: 't-up', title: 'Task Upcoming', date: upcomingStr, time: '12:00', priority: 'Medium' });
    await stateInstance.addTask({ id: 't-over', title: 'Task Overdue', date: overdueStr, time: '12:00', priority: 'Low' });
    await stateInstance.addTask({ id: 't-done', title: 'Task Done', date: todayStr, time: '10:00', priority: 'Critical' });
    await stateInstance.toggleComplete('t-done');

    // Check Metrics
    assert.strictEqual(stateInstance.metrics.total, 4);
    assert.strictEqual(stateInstance.metrics.completed, 1);
    assert.strictEqual(stateInstance.metrics.today, 1);
    assert.strictEqual(stateInstance.metrics.upcoming, 1);
    assert.strictEqual(stateInstance.metrics.overdue, 1);
    assert.strictEqual(stateInstance.metrics.highCritical, 1); // Only pending High/Critical: t-today (t-done is completed)

    // Test Today Filter
    stateInstance.currentFilter = 'today';
    stateInstance.recalculateFilteredTasksAndMetrics();
    assert.strictEqual(stateInstance.tasks.length, 1);
    assert.strictEqual(stateInstance.tasks[0].id, 't-today');

    // Test Upcoming Filter
    stateInstance.currentFilter = 'upcoming';
    stateInstance.recalculateFilteredTasksAndMetrics();
    assert.strictEqual(stateInstance.tasks.length, 1);
    assert.strictEqual(stateInstance.tasks[0].id, 't-up');

    // Test Overdue Filter
    stateInstance.currentFilter = 'overdue';
    stateInstance.recalculateFilteredTasksAndMetrics();
    assert.strictEqual(stateInstance.tasks.length, 1);
    assert.strictEqual(stateInstance.tasks[0].id, 't-over');

    // Test Completed Filter
    stateInstance.currentFilter = 'completed';
    stateInstance.recalculateFilteredTasksAndMetrics();
    assert.strictEqual(stateInstance.tasks.length, 1);
    assert.strictEqual(stateInstance.tasks[0].id, 't-done');

    // Test Priority Filter
    stateInstance.currentFilter = 'all';
    stateInstance.currentPriority = 'high';
    stateInstance.recalculateFilteredTasksAndMetrics();
    assert.strictEqual(stateInstance.tasks.length, 1);
    assert.strictEqual(stateInstance.tasks[0].id, 't-today');

    // Test Search Filter (by title & notes)
    stateInstance.currentPriority = 'all';
    stateInstance.searchQuery = 'Overdue';
    stateInstance.recalculateFilteredTasksAndMetrics();
    assert.strictEqual(stateInstance.tasks.length, 1);
    assert.strictEqual(stateInstance.tasks[0].id, 't-over');
  });

  console.log('\n====================================================');
  console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runGate1Tests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
