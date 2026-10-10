const mongoose = require('mongoose');
const { JOIN_REQUEST_STATUSES } = require('../constants/joinRequest.constants');

const joinRequestSchema = new mongoose.Schema(
  {
    activityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Activity',
      required: [true, 'Activity ID is required'],
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true
    },
    status: {
      type: String,
      enum: {
        values: JOIN_REQUEST_STATUSES,
        message: 'Status must be one of: {VALUES}'
      },
      default: 'pending',
      index: true
    },
    note: {
      type: String,
      trim: true,
      maxlength: [500, 'Note cannot exceed 500 characters']
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Database-level enforcement of single active join request per user per activity
joinRequestSchema.index(
  { activityId: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['pending', 'approved'] }
    }
  }
);

// Compound indexes for query efficiency
joinRequestSchema.index({ activityId: 1, status: 1 });
joinRequestSchema.index({ userId: 1, status: 1 });

const JoinRequest =
  mongoose.models.JoinRequest || mongoose.model('JoinRequest', joinRequestSchema);

module.exports = JoinRequest;
