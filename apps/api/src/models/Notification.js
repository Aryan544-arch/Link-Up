const mongoose = require('mongoose');
const { NOTIFICATION_TYPES, RELATED_RESOURCE_TYPES } = require('../constants/notification.constants');

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
      maxlength: [150, 'Title cannot exceed 150 characters']
    },
    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true,
      maxlength: [1000, 'Message cannot exceed 1000 characters']
    },
    relatedResourceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    relatedResourceType: {
      type: String,
      enum: {
        values: RELATED_RESOURCE_TYPES,
        message: 'Invalid related resource type: {VALUE}'
      },
      default: 'none'
    },
    readAt: {
      type: Date,
      default: null,
      index: true
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

// Compound index for querying user notifications sorted by recency and unread state
notificationSchema.index({ recipientId: 1, readAt: 1, createdAt: -1 });

const Notification =
  mongoose.models.Notification || mongoose.model('Notification', notificationSchema);

module.exports = Notification;
