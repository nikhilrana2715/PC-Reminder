/**
 * Gate 1 Backend REST API & DB Integration Test Suite
 */

const assert = require('assert');
const path = require('path');
const db = require(path.join(__dirname, '../server/db'));

async function runBackendTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING GATE 1 BACKEND & DATABASE TEST SUITE');
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

  // 1. Create reminder
  test('Backend DB: Create reminder with full schema', () => {
    const created = db.createReminder({
      id: 'task-back-1',
      title: 'Server Test Reminder',
      description: 'Verifying DB schema persistence',
      date: '2026-09-18',
      time: '15:00',
      priority: 'critical'
    });

    assert.strictEqual(created.id, 'task-back-1');
    assert.strictEqual(created.title, 'Server Test Reminder');
    assert.strictEqual(created.priority, 'Critical');
    assert.strictEqual(created.completionStatus, 'pending');
    assert.strictEqual(created.reminderStatus, 'pending');
    assert.ok(created.createdAt);
    assert.ok(created.updatedAt);
  });

  // 2. Query with search and priority
  test('Backend DB: Query reminders with priority and search filters', () => {
    const result = db.getReminders({ search: 'Server Test', priority: 'Critical' });
    assert.ok(result.reminders.length >= 1);
    const found = result.reminders.find(r => r.id === 'task-back-1');
    assert.ok(found);
  });

  // 3. Update reminder
  test('Backend DB: Update reminder in-place without duplicating', () => {
    const countBefore = db.data.reminders.length;
    const updated = db.updateReminder('task-back-1', {
      title: 'Updated Server Test Reminder',
      time: '16:30',
      priority: 'high'
    });

    assert.strictEqual(updated.title, 'Updated Server Test Reminder');
    assert.strictEqual(updated.time, '16:30');
    assert.strictEqual(updated.priority, 'High');
    assert.strictEqual(db.data.reminders.length, countBefore, 'Count must not increase on update');
  });

  // 4. Toggle complete
  test('Backend DB: Toggle complete and verify completionStatus', () => {
    const toggled = db.toggleComplete('task-back-1');
    assert.strictEqual(toggled.completed, 1);
    assert.strictEqual(toggled.completionStatus, 'completed');
    assert.strictEqual(toggled.reminderStatus, 'completed');

    const toggledBack = db.toggleComplete('task-back-1');
    assert.strictEqual(toggledBack.completed, 0);
    assert.strictEqual(toggledBack.completionStatus, 'pending');
  });

  // 5. Delete reminder
  test('Backend DB: Delete reminder removes from persistence', () => {
    const deleted = db.deleteReminder('task-back-1');
    assert.strictEqual(deleted, true);
    const found = db.getReminderById('task-back-1');
    assert.strictEqual(found, null);
  });

  console.log('\n====================================================');
  console.log(`📊 BACKEND TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runBackendTests().catch(err => {
  console.error('Backend test execution error:', err);
  process.exit(1);
});
