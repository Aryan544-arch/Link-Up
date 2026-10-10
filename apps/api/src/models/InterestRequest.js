const mongoose = require('mongoose');
const { ACTIVITY_CATEGORIES, SKILL_LEVELS } = require('../constants/activity.constants');
const { INTEREST_REQUEST_STATUSES } = require('../constants/interestRequest.constants');

const pointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
      required: [true, 'Location type must be Point']
    },
    coordinates: {
      type: [Number], // Ordered as [longitude, latitude]
      required: [true, 'Coordinates [longitude, latitude] are required'],
      validate: {
        validator: function (coords) {
          if (!Array.isArray(coords) || coords.length !== 2) return false;
          const [lng, lat] = coords;
          return (
            typeof lng === 'number' &&
            typeof lat === 'number' &&
            !isNaN(lng) &&
            !isNaN(lat) &&
            lng >= -180 &&
            lng <= 180 &&
            lat >= -90 &&
            lat <= 90
          );
        },
        message: 'Coordinates must be valid numbers: [longitude (-180 to 180), latitude (-90 to 90)]'
      }
    }
  },
  { _id: false }
);

const interestRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      lowercase: true,
      trim: true,
      enum: {
        values: ACTIVITY_CATEGORIES,
        message: 'Category must be one of: {VALUES}'
      }
    },
    title: {
      type: String,
      trim: true,
      maxlength: [120, 'Title cannot exceed 120 characters']
    },
    timeStart: {
      type: Date,
      required: [true, 'Start time is required']
    },
    timeEnd: {
      type: Date,
      required: [true, 'End time is required'],
      validate: {
        validator: function (value) {
          if (!this.timeStart || !value) return true;
          return value.getTime() > this.timeStart.getTime();
        },
        message: 'End time must be after start time'
      }
    },
    location: {
      type: pointSchema,
      required: [true, 'Location is required']
    },
    displayArea: {
      type: String,
      required: [true, 'Display area is required'],
      trim: true,
      minlength: [2, 'Display area must be at least 2 characters'],
      maxlength: [200, 'Display area cannot exceed 200 characters']
    },
    radiusKm: {
      type: Number,
      default: 3,
      min: [0.5, 'Radius must be at least 0.5 km'],
      max: [100, 'Radius cannot exceed 100 km']
    },
    maxBudget: {
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
    },
    groupSize: {
      type: Number,
      default: 2,
      min: [2, 'Group size must be at least 2'],
      max: [50, 'Group size cannot exceed 50']
    },
    status: {
      type: String,
      enum: {
        values: INTEREST_REQUEST_STATUSES,
        message: 'Status must be one of: {VALUES}'
      },
      default: 'active',
      index: true
    },
    expiry: {
      type: Date
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Database-level enforcement of single active interest request per user per category
interestRequestSchema.index(
  { userId: 1, category: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: 'active'
    }
  }
);

// Geospatial index for distance and matching queries
interestRequestSchema.index({ location: '2dsphere' });

// Compound query indexes
interestRequestSchema.index({ category: 1, status: 1 });
interestRequestSchema.index({ userId: 1, status: 1 });
interestRequestSchema.index({ status: 1, timeEnd: 1 });

const InterestRequest =
  mongoose.models.InterestRequest ||
  mongoose.model('InterestRequest', interestRequestSchema);

module.exports = InterestRequest;
