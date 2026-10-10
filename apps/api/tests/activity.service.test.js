const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const activityService = require('../src/services/activity.service');
const Activity = require('../src/models/Activity');

test('serializeActivity withholds precise coordinates from non-organizers', () => {
  const organizerId = new mongoose.Types.ObjectId();
  const strangerId = new mongoose.Types.ObjectId();

  const activityDoc = {
    _id: new mongoose.Types.ObjectId(),
    title: 'Trail Run',
    organizerId,
    location: {
      type: 'Point',
      coordinates: [-73.96, 40.78]
    },
    displayArea: 'Central Park West'
  };

  // Stranger perspective: coordinates withheld
  const serializedForStranger = activityService.serializeActivity(activityDoc, strangerId);
  assert.equal(serializedForStranger.location.coordinates, null);
  assert.equal(serializedForStranger.location.isPrecise, false);
  assert.equal(serializedForStranger.displayArea, 'Central Park West');

  // Organizer perspective: full coordinates revealed
  const serializedForOrganizer = activityService.serializeActivity(activityDoc, organizerId);
  assert.deepEqual(serializedForOrganizer.location.coordinates, [-73.96, 40.78]);
  assert.equal(serializedForOrganizer.location.isPrecise, true);
});

test('publishActivity enforces draft state and future start time', async () => {
  const organizerId = new mongoose.Types.ObjectId();

  // Mock an activity that is already published
  const originalFindById = Activity.findById;
  Activity.findById = () => ({
    exec: async () => ({
      _id: new mongoose.Types.ObjectId(),
      organizerId,
      status: 'published',
      startsAt: new Date(Date.now() + 3600000),
      save: async () => {}
    })
  });

  await assert.rejects(
    async () => {
      await activityService.publishActivity({
        activityId: new mongoose.Types.ObjectId(),
        currentUserId: organizerId
      });
    },
    (err) => {
      assert.equal(err.code, 'INVALID_STATE_TRANSITION');
      assert.equal(err.statusCode, 400);
      return true;
    }
  );

  // Mock an activity whose start time is in the past
  Activity.findById = () => ({
    exec: async () => ({
      _id: new mongoose.Types.ObjectId(),
      organizerId,
      status: 'draft',
      startsAt: new Date(Date.now() - 3600000), // In the past
      save: async () => {}
    })
  });

  await assert.rejects(
    async () => {
      await activityService.publishActivity({
        activityId: new mongoose.Types.ObjectId(),
        currentUserId: organizerId
      });
    },
    (err) => {
      assert.equal(err.code, 'INVALID_ACTIVITY_TIME');
      assert.equal(err.statusCode, 400);
      return true;
    }
  );

  // Restore findById
  Activity.findById = originalFindById;
});

test('cancelActivity rejects already cancelled or completed activities', async () => {
  const organizerId = new mongoose.Types.ObjectId();

  const originalFindById = Activity.findById;
  Activity.findById = () => ({
    exec: async () => ({
      _id: new mongoose.Types.ObjectId(),
      organizerId,
      status: 'cancelled',
      save: async () => {}
    })
  });

  await assert.rejects(
    async () => {
      await activityService.cancelActivity({
        activityId: new mongoose.Types.ObjectId(),
        currentUserId: organizerId
      });
    },
    (err) => {
      assert.equal(err.code, 'INVALID_STATE_TRANSITION');
      assert.match(err.message, /already cancelled/);
      return true;
    }
  );

  Activity.findById = originalFindById;
});

test('updateActivity rejects updates from non-organizers (ownership check)', async () => {
  const organizerId = new mongoose.Types.ObjectId();
  const differentUserId = new mongoose.Types.ObjectId();

  const originalFindById = Activity.findById;
  Activity.findById = () => ({
    exec: async () => ({
      _id: new mongoose.Types.ObjectId(),
      organizerId,
      status: 'draft',
      save: async () => {}
    })
  });

  await assert.rejects(
    async () => {
      await activityService.updateActivity({
        activityId: new mongoose.Types.ObjectId(),
        updateData: { title: 'New Title' },
        currentUserId: differentUserId
      });
    },
    (err) => {
      assert.equal(err.code, 'FORBIDDEN');
      assert.equal(err.statusCode, 403);
      return true;
    }
  );

  Activity.findById = originalFindById;
});

test('findActivities rejects radius parameter when coordinates are missing', async () => {
  await assert.rejects(
    async () => {
      await activityService.findActivities({
        query: { radiusKm: 10 } // Missing lat and lng
      });
    },
    (err) => {
      assert.equal(err.code, 'COORDINATES_REQUIRED');
      assert.equal(err.statusCode, 400);
      return true;
    }
  );
});
