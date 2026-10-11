const mongoose = require('mongoose');

const NOTIFICATION_TYPES = [
  'join_request_received',
  'request_approved',
  'request_rejected',
  'activity_updated',
  'activity_cancelled',
  'match_found',
  'proposal_created',
  'general'
];

const RESOURCE_TYPES = [
  'activity',
  'join_request',
  'interest_request',
  'proposal',
  'user'
];

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
        values: NOTIFICATION_TYPES,
        message: 'Invalid notification type: {VALUE}'
      }
    },
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
      minlength: [1, 'Title cannot be empty'],
      maxlength: [100, 'Title cannot exceed 100 characters']
    },
    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true,
      minlength: [1, 'Message cannot be empty'],
      maxlength: [500, 'Message cannot exceed 500 characters']
    },
    relatedResourceType: {
      type: String,
      enum: {
        values: [...RESOURCE_TYPES, null],
        message: 'Invalid related resource type: {VALUE}'
      },
      default: null
    },
    relatedResourceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    readAt: {
      type: Date,
      default: null
    },
    deduplicationKey: {
      type: String,
      sparse: true,
      unique: true
    }
  },
  {
    timestamps: true
  }
);

// Compound indexes for optimal queries
notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, readAt: 1 });

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

notificationSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    ret.recipientId = ret.recipientId.toString();
    ret.isRead = Boolean(ret.readAt);
    delete ret._id;
    delete ret.__v;
    delete ret.deduplicationKey;
    return ret;
  }
});

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
module.exports.RESOURCE_TYPES = RESOURCE_TYPES;
