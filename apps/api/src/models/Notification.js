const mongoose = require('mongoose');
const {
  NOTIFICATION_TYPES: P2_NOTIFICATION_TYPES,
  RELATED_RESOURCE_TYPES: P2_RESOURCE_TYPES
} = require('../constants/notification.constants');

const P3_NOTIFICATION_TYPES = [
  'join_request_received',
  'request_approved',
  'request_rejected',
  'activity_updated',
  'activity_cancelled',
  'match_found',
  'proposal_created',
  'general'
];

const COMBINED_NOTIFICATION_TYPES = Array.from(
  new Set([...P2_NOTIFICATION_TYPES, ...P3_NOTIFICATION_TYPES])
);

const P3_RESOURCE_TYPES = [
  'activity',
  'join_request',
  'interest_request',
  'proposal',
  'user',
  'none'
];

const COMBINED_RESOURCE_TYPES = Array.from(
  new Set([...P2_RESOURCE_TYPES, ...P3_RESOURCE_TYPES])
);

const notificationSchema = new mongoose.Schema(
  {
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Recipient ID is required'],
      index: true
    },
    type: {
      type: String,
      required: [true, 'Notification type is required'],
      enum: {
        values: COMBINED_NOTIFICATION_TYPES,
        message: 'Invalid notification type: {VALUE}'
      }
    },
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
      minlength: [1, 'Title cannot be empty'],
      maxlength: [150, 'Title cannot exceed 150 characters']
    },
    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true,
      minlength: [1, 'Message cannot be empty'],
      maxlength: [1000, 'Message cannot exceed 1000 characters']
    },
    relatedResourceType: {
      type: String,
      enum: {
        values: [...COMBINED_RESOURCE_TYPES, null],
        message: 'Invalid related resource type: {VALUE}'
      },
      default: 'none'
    },
    relatedResourceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    readAt: {
      type: Date,
      default: null,
      index: true
    },
    deduplicationKey: {
      type: String,
      sparse: true,
      unique: true
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Compound indexes for optimal queries
notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, readAt: 1, createdAt: -1 });

// Method to format a client-safe public JSON representation
notificationSchema.methods.toPublicJSON = function () {
  return {
    id: this._id.toString(),
    recipientId: this.recipientId.toString(),
    type: this.type,
    title: this.title,
    message: this.message,
    relatedResourceType: this.relatedResourceType || null,
    relatedResourceId: this.relatedResourceId ? this.relatedResourceId.toString() : null,
    isRead: Boolean(this.readAt),
    readAt: this.readAt || null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

const Notification =
  mongoose.models.Notification || mongoose.model('Notification', notificationSchema);

module.exports = Notification;
module.exports.NOTIFICATION_TYPES = COMBINED_NOTIFICATION_TYPES;
module.exports.RESOURCE_TYPES = COMBINED_RESOURCE_TYPES;
