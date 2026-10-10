const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Proposal = require('../src/models/Proposal');

test('Proposal model imports cleanly without a live MongoDB connection', () => {
  assert.ok(Proposal);
  assert.equal(Proposal.modelName, 'Proposal');
});

test('Valid Proposal document passes schema validation', () => {
  const doc = new Proposal({
    proposerId: new mongoose.Types.ObjectId(),
    recipientId: new mongoose.Types.ObjectId(),
    sourceRequestId: new mongoose.Types.ObjectId(),
    targetRequestId: new mongoose.Types.ObjectId(),
    activityDraft: {
      title: 'Joint Kayaking Session',
      description: 'Let us paddle together this Saturday morning.',
      category: 'sports',
      startsAt: new Date(Date.now() + 3600000),
      endsAt: new Date(Date.now() + 7200000),
      location: { type: 'Point', coordinates: [-73.998, 40.755] },
      displayArea: 'Pier 84 Boathouse',
      capacity: 4,
      budget: 0,
      skillLevel: 'all-levels'
    }
  });

  const err = doc.validateSync();
  assert.equal(err, undefined);
  assert.equal(doc.status, 'pending');
  assert.equal(doc.resultingActivityId, null);
});

test('Proposal model fails validation when required fields are missing', () => {
  const doc = new Proposal({});
  const err = doc.validateSync();
  assert.ok(err);
  assert.ok(err.errors.proposerId);
  assert.ok(err.errors.recipientId);
  assert.ok(err.errors.sourceRequestId);
  assert.ok(err.errors.targetRequestId);
  assert.ok(err.errors.activityDraft);
});

test('Proposal status requires one of the allowed enums', () => {
  const doc = new Proposal({
    proposerId: new mongoose.Types.ObjectId(),
    recipientId: new mongoose.Types.ObjectId(),
    sourceRequestId: new mongoose.Types.ObjectId(),
    targetRequestId: new mongoose.Types.ObjectId(),
    activityDraft: {
      title: 'Valid Title',
      description: 'Valid description that is long enough.',
      startsAt: new Date(Date.now() + 3600000),
      endsAt: new Date(Date.now() + 7200000),
      location: { type: 'Point', coordinates: [-73.998, 40.755] },
      displayArea: 'Pier 84'
    },
    status: 'invalid-status'
  });

  const err = doc.validateSync();
  assert.ok(err);
  assert.ok(err.errors.status);
});

test('Proposal defines partial unique index for single pending proposal per request pair', () => {
  const indexes = Proposal.schema.indexes();
  const uniqueProposalIndex = indexes.find(
    ([fields, options]) =>
      fields.sourceRequestId === 1 &&
      fields.targetRequestId === 1 &&
      options &&
      options.unique === true &&
      options.partialFilterExpression &&
      options.partialFilterExpression.status === 'pending'
  );

  assert.ok(
    uniqueProposalIndex,
    'Expected partial unique index on { sourceRequestId: 1, targetRequestId: 1 } for pending proposals'
  );
});
