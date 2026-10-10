const mongoose = require('mongoose');
const { ACTIVITY_CATEGORIES, SKILL_LEVELS } = require('../constants/activity.constants');
const { PROPOSAL_STATUSES } = require('../constants/proposal.constants');

const pointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
      required: [true, 'Location type must be Point']
    },
    coordinates: {
      type: [Number],
      required: [true, 'Coordinates [longitude, latitude] are required']
    }
  },
  { _id: false }
);

const activityDraftSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Draft title is required'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters'],
      maxlength: [120, 'Title cannot exceed 120 characters']
    },
    description: {
      type: String,
      required: [true, 'Draft description is required'],
      trim: true,
      minlength: [10, 'Description must be at least 10 characters'],
      maxlength: [2000, 'Description cannot exceed 2000 characters']
    },
    category: {
      type: String,
      required: [true, 'Draft category is required'],
      lowercase: true,
      trim: true,
      enum: {
        values: ACTIVITY_CATEGORIES,
        message: 'Category must be one of: {VALUES}'
      }
    },
    startsAt: {
      type: Date,
      required: [true, 'Start time is required']
    },
    endsAt: {
      type: Date,
      required: [true, 'End time is required']
    },
    location: {
      type: pointSchema,
      required: [true, 'Draft location is required']
    },
    displayArea: {
      type: String,
      required: [true, 'Display area description is required'],
      trim: true,
      minlength: [2, 'Display area must be at least 2 characters'],
      maxlength: [200, 'Display area cannot exceed 200 characters']
    },
    capacity: {
      type: Number,
      default: 2,
      min: [1, 'Capacity must be at least 1'],
      max: [1000, 'Capacity cannot exceed 1000']
    },
    budget: {
      type: Number,
      default: 0,
      min: [0, 'Budget cannot be negative']
    },
    skillLevel: {
      type: String,
      enum: {
        values: SKILL_LEVELS,
        message: 'Skill level must be one of: {VALUES}'
      },
      default: 'all-levels'
    }
  },
  { _id: false }
);

const proposalSchema = new mongoose.Schema(
  {
    proposerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Proposer ID is required'],
      index: true
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Recipient ID is required'],
      index: true
    },
    sourceRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InterestRequest',
      required: [true, 'Source interest request ID is required'],
      index: true
    },
    targetRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InterestRequest',
      required: [true, 'Target interest request ID is required'],
      index: true
    },
    activityDraft: {
      type: activityDraftSchema,
      required: [true, 'Activity draft payload is required']
    },
    status: {
      type: String,
      enum: {
        values: PROPOSAL_STATUSES,
        message: 'Status must be one of: {VALUES}'
      },
      default: 'pending',
      index: true
    },
    resultingActivityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Activity',
      default: null
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Prevent multiple pending proposals between the exact same pair of interest requests
proposalSchema.index(
  { sourceRequestId: 1, targetRequestId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: 'pending'
    },
    name: 'unique_pending_pair_request'
  }
);

// Prevent an interest request from being claimed in multiple pending proposals
proposalSchema.index(
  { targetRequestId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: 'pending'
    },
    name: 'unique_pending_target_request'
  }
);

proposalSchema.index(
  { sourceRequestId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: 'pending'
    },
    name: 'unique_pending_source_request'
  }
);

proposalSchema.index({ proposerId: 1, status: 1 });
proposalSchema.index({ recipientId: 1, status: 1 });

const Proposal =
  mongoose.models.Proposal || mongoose.model('Proposal', proposalSchema);

module.exports = Proposal;
