const mongoose = require('mongoose');

const REPORT_REASONS = [
  'spam',
  'harassment',
  'inappropriate_content',
  'safety_concern',
  'no_show',
  'other'
];

const TARGET_TYPES = ['activity', 'user', 'proposal'];

const reportSchema = new mongoose.Schema(
  {
    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Reporter ID is required'],
      index: true
    },
    targetType: {
      type: String,
      required: [true, 'Target type is required'],
      enum: {
        values: TARGET_TYPES,
        message: 'Invalid target type: {VALUE}'
      }
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Target ID is required'],
      index: true
    },
    reason: {
      type: String,
      required: [true, 'Report reason is required'],
      enum: {
        values: REPORT_REASONS,
        message: 'Invalid report reason: {VALUE}'
      }
    },
    details: {
      type: String,
      trim: true,
      maxlength: [1000, 'Details cannot exceed 1000 characters'],
      default: ''
    },
    status: {
      type: String,
      enum: ['pending', 'reviewed', 'dismissed', 'actioned'],
      default: 'pending',
      index: true
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

reportSchema.index({ reporterId: 1, targetType: 1, targetId: 1 });

const Report = mongoose.models.Report || mongoose.model('Report', reportSchema);

module.exports = {
  Report,
  REPORT_REASONS,
  TARGET_TYPES
};
