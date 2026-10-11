process.env.NODE_ENV = 'test';
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');
const { closeSessionStore } = require('../src/config/session');
const User = require('../src/models/User');
const Notification = require('../src/models/Notification');
const notificationService = require('../src/services/notificationService');

describe('MEETUP Pulse — Persistent In-App Notifications', () => {
  before(async () => {
    await connectDB();
    await Notification.syncIndexes();
    await User.syncIndexes();
  });

  after(async () => {
    await User.deleteMany({ email: { $regex: /@notif-test\.example\.com$/i } });
    await Notification.deleteMany({});
    await closeSessionStore();
    await disconnectDB();
  });

  beforeEach(async () => {
    await User.deleteMany({ email: { $regex: /@notif-test\.example\.com$/i } });
    await Notification.deleteMany({});
  });

  // Helper to create and log in a user, returning { user, cookie }
  async function createAndLoginUser(prefix, displayName = 'Notif User') {
    const email = `${prefix}@notif-test.example.com`;
    const password = 'Password123!';
    const user = await User.create({
      displayName,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      isVerified: true
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password });

    return {
      user,
      cookie: loginRes.headers['set-cookie']
    };
  }

  describe('Service: createNotification interface', () => {
    it('Creates and persists an in-app notification in MongoDB', async () => {
      const { user } = await createAndLoginUser('service.create');
      const relatedActivityId = new mongoose.Types.ObjectId();

      const notification = await notificationService.createNotification({
        recipientId: user._id,
        type: 'join_request_received',
        title: 'New Join Request',
        message: 'Alex requested to join your Saturday morning badminton game.',
        relatedResourceType: 'activity',
        relatedResourceId: relatedActivityId
      });

      assert.ok(notification._id);
      assert.equal(notification.recipientId.toString(), user._id.toString());
      assert.equal(notification.type, 'join_request_received');
      assert.equal(notification.title, 'New Join Request');
      assert.equal(notification.readAt, null);
      assert.equal(notification.relatedResourceType, 'activity');
      assert.equal(notification.relatedResourceId.toString(), relatedActivityId.toString());

      // Query database directly
      const dbNotif = await Notification.findById(notification._id);
      assert.ok(dbNotif);
      assert.equal(dbNotif.message, 'Alex requested to join your Saturday morning badminton game.');
    });

    it('Rejects notification creation when required fields are missing or invalid', async () => {
      // Missing recipientId
      await assert.rejects(async () => {
        await notificationService.createNotification({
          title: 'Title',
          message: 'Message',
          type: 'general'
        });
      }, /Recipient ID is required/);

      // Missing title
      await assert.rejects(async () => {
        await notificationService.createNotification({
          recipientId: new mongoose.Types.ObjectId(),
          title: '',
          message: 'Message',
          type: 'general'
        });
      }, /title is required/);

      // Missing message
      await assert.rejects(async () => {
        await notificationService.createNotification({
          recipientId: new mongoose.Types.ObjectId(),
          title: 'Title',
          message: '',
          type: 'general'
        });
      }, /message is required/);

      // Invalid type enum
      await assert.rejects(async () => {
        await notificationService.createNotification({
          recipientId: new mongoose.Types.ObjectId(),
          title: 'Title',
          message: 'Message',
          type: 'unsupported_type_xyz'
        });
      }, /Invalid notification type/);
    });

    it('Avoids duplicate notifications when deduplicationKey is provided (Idempotency)', async () => {
      const { user } = await createAndLoginUser('service.dedup');
      const dedupKey = `join_req_user_${user._id}_activity_999`;

      // First creation
      const notif1 = await notificationService.createNotification({
        recipientId: user._id,
        type: 'request_approved',
        title: 'Request Approved',
        message: 'Your join request was approved.',
        deduplicationKey: dedupKey
      });

      // Second creation attempt with same deduplicationKey (e.g. retried job)
      const notif2 = await notificationService.createNotification({
        recipientId: user._id,
        type: 'request_approved',
        title: 'Request Approved',
        message: 'Your join request was approved.',
        deduplicationKey: dedupKey
      });

      assert.equal(notif1._id.toString(), notif2._id.toString());
      const totalInDb = await Notification.countDocuments({ recipientId: user._id });
      assert.equal(totalInDb, 1);
    });

    it('Handles concurrent race-condition creation with identical deduplicationKey without failing', async () => {
      const { user } = await createAndLoginUser('service.race');
      const raceKey = `concurrent_join_${user._id}_act_123`;

      // Launch simultaneous parallel createNotification calls
      const results = await Promise.all([
        notificationService.createNotification({
          recipientId: user._id,
          type: 'join_request_received',
          title: 'Concurrent 1',
          message: 'Concurrent message',
          deduplicationKey: raceKey
        }),
        notificationService.createNotification({
          recipientId: user._id,
          type: 'join_request_received',
          title: 'Concurrent 2',
          message: 'Concurrent message',
          deduplicationKey: raceKey
        }),
        notificationService.createNotification({
          recipientId: user._id,
          type: 'join_request_received',
          title: 'Concurrent 3',
          message: 'Concurrent message',
          deduplicationKey: raceKey
        })
      ]);

      assert.equal(results.length, 3);
      assert.equal(results[0]._id.toString(), results[1]._id.toString());
      assert.equal(results[1]._id.toString(), results[2]._id.toString());

      const count = await Notification.countDocuments({ deduplicationKey: raceKey });
      assert.equal(count, 1);
    });
  });

  describe('Endpoints: Authentication & Isolation', () => {
    it('Unauthenticated requests to all notification endpoints receive 401 UNAUTHORIZED', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();

      const listRes = await request(app).get('/api/notifications');
      assert.equal(listRes.status, 401);
      assert.equal(listRes.body.error.code, 'UNAUTHORIZED');

      const countRes = await request(app).get('/api/notifications/unread-count');
      assert.equal(countRes.status, 401);

      const markOneRes = await request(app).patch(`/api/notifications/${fakeId}/read`);
      assert.equal(markOneRes.status, 401);

      const markAllRes = await request(app).patch('/api/notifications/read-all');
      assert.equal(markAllRes.status, 401);
    });

    it('A user sees only their own notifications, ordered newest first with pagination and unread counts', async () => {
      const userA = await createAndLoginUser('user.a', 'User A');
      const userB = await createAndLoginUser('user.b', 'User B');

      // Create 3 notifications for User A
      const notifA1 = await notificationService.createNotification({
        recipientId: userA.user._id,
        type: 'general',
        title: 'Oldest for A',
        message: 'First notification'
      });
      // slight delay to ensure distinct createdAt timestamps
      await new Promise((r) => setTimeout(r, 10));

      const notifA2 = await notificationService.createNotification({
        recipientId: userA.user._id,
        type: 'activity_updated',
        title: 'Middle for A',
        message: 'Second notification'
      });
      await new Promise((r) => setTimeout(r, 10));

      const notifA3 = await notificationService.createNotification({
        recipientId: userA.user._id,
        type: 'match_found',
        title: 'Newest for A',
        message: 'Third notification'
      });

      // Create 1 notification for User B
      await notificationService.createNotification({
        recipientId: userB.user._id,
        type: 'general',
        title: 'Private to B',
        message: 'Secret notification for B only'
      });

      // User A requests their notifications
      const resA = await request(app)
        .get('/api/notifications?page=1&limit=10')
        .set('Cookie', userA.cookie);

      assert.equal(resA.status, 200);
      assert.equal(resA.body.success, true);
      assert.equal(resA.body.data.length, 3);
      assert.equal(resA.body.meta.total, 3);
      assert.equal(resA.body.meta.unreadCount, 3);

      // Verify newest-first order
      assert.equal(resA.body.data[0].id, notifA3._id.toString());
      assert.equal(resA.body.data[1].id, notifA2._id.toString());
      assert.equal(resA.body.data[2].id, notifA1._id.toString());

      // User A never sees User B's notifications
      const hasBContent = resA.body.data.some((n) => n.title.includes('Private to B'));
      assert.equal(hasBContent, false);

      // User B only sees 1 notification
      const resB = await request(app)
        .get('/api/notifications')
        .set('Cookie', userB.cookie);

      assert.equal(resB.status, 200);
      assert.equal(resB.body.data.length, 1);
      assert.equal(resB.body.data[0].title, 'Private to B');
    });

    it('A user cannot mark another user\'s notification as read (returns 404 NOT_FOUND)', async () => {
      const userA = await createAndLoginUser('attack.a', 'User A');
      const userB = await createAndLoginUser('attack.b', 'User B');

      // Notification belongs to User B
      const notifB = await notificationService.createNotification({
        recipientId: userB.user._id,
        type: 'general',
        title: 'Belongs to B',
        message: 'Only B can read this'
      });

      // User A attempts to mark User B's notification as read
      const attackRes = await request(app)
        .patch(`/api/notifications/${notifB._id}/read`)
        .set('Cookie', userA.cookie);

      assert.equal(attackRes.status, 404);
      assert.equal(attackRes.body.success, false);
      assert.equal(attackRes.body.error.code, 'NOT_FOUND');

      // Verify in DB that User B's notification remains unread
      const freshNotifB = await Notification.findById(notifB._id);
      assert.equal(freshNotifB.readAt, null);
    });

    it('Marking one notification as read updates readAt, isRead flag, and decrements unread count', async () => {
      const { user, cookie } = await createAndLoginUser('mark.one');

      const notif = await notificationService.createNotification({
        recipientId: user._id,
        type: 'activity_cancelled',
        title: 'Activity Cancelled',
        message: 'The hike was cancelled due to heavy rain.'
      });

      // Verify unread count is 1 initially
      const countBefore = await request(app)
        .get('/api/notifications/unread-count')
        .set('Cookie', cookie);
      assert.equal(countBefore.body.data.unreadCount, 1);

      // Mark as read
      const markRes = await request(app)
        .patch(`/api/notifications/${notif._id}/read`)
        .set('Cookie', cookie);

      assert.equal(markRes.status, 200);
      assert.equal(markRes.body.success, true);
      assert.equal(markRes.body.data.id, notif._id.toString());
      assert.equal(markRes.body.data.isRead, true);
      assert.ok(markRes.body.data.readAt);

      // Verify unread count is now 0
      const countAfter = await request(app)
        .get('/api/notifications/unread-count')
        .set('Cookie', cookie);
      assert.equal(countAfter.body.data.unreadCount, 0);
    });

    it('Marking all notifications as read updates all unread notifications for authenticated user only', async () => {
      const userA = await createAndLoginUser('readall.a');
      const userB = await createAndLoginUser('readall.b');

      // Create 3 unread notifications for User A
      await notificationService.createNotification({
        recipientId: userA.user._id,
        type: 'general',
        title: 'A1',
        message: 'Message A1'
      });
      await notificationService.createNotification({
        recipientId: userA.user._id,
        type: 'general',
        title: 'A2',
        message: 'Message A2'
      });
      await notificationService.createNotification({
        recipientId: userA.user._id,
        type: 'general',
        title: 'A3',
        message: 'Message A3'
      });

      // Create 1 unread notification for User B
      const notifB = await notificationService.createNotification({
        recipientId: userB.user._id,
        type: 'general',
        title: 'B1',
        message: 'Message B1'
      });

      // User A marks all as read
      const readAllRes = await request(app)
        .patch('/api/notifications/read-all')
        .set('Cookie', userA.cookie);

      assert.equal(readAllRes.status, 200);
      assert.equal(readAllRes.body.data.updatedCount, 3);

      // User A unread count is now 0
      const countA = await request(app)
        .get('/api/notifications/unread-count')
        .set('Cookie', userA.cookie);
      assert.equal(countA.body.data.unreadCount, 0);

      // User B unread notification was untouched
      const countB = await request(app)
        .get('/api/notifications/unread-count')
        .set('Cookie', userB.cookie);
      assert.equal(countB.body.data.unreadCount, 1);

      const freshNotifB = await Notification.findById(notifB._id);
      assert.equal(freshNotifB.readAt, null);
    });

    it('Filtering by unreadOnly=true returns only unread notifications', async () => {
      const { user, cookie } = await createAndLoginUser('filter.unread');

      const notif1 = await notificationService.createNotification({
        recipientId: user._id,
        type: 'general',
        title: 'Unread One',
        message: 'Message 1'
      });

      const notif2 = await notificationService.createNotification({
        recipientId: user._id,
        type: 'general',
        title: 'Read One',
        message: 'Message 2'
      });

      // Mark notif2 as read
      await notificationService.markNotificationAsRead(user._id, notif2._id);

      // Fetch unreadOnly
      const res = await request(app)
        .get('/api/notifications?unreadOnly=true')
        .set('Cookie', cookie);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].id, notif1._id.toString());
      assert.equal(res.body.data[0].isRead, false);
    });
  });
});
