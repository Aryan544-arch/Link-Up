const mongoose = require('mongoose');
const {
  ACTIVITY_CATEGORIES,
  SKILL_LEVELS,
  ACTIVITY_STATUSES
} = require('../constants/activity.constants');

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
          if (!Array.isArray(coords) || coords.length !== 2) {
            return false;
          }
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

const activitySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Activity title is required'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters'],
      maxlength: [120, 'Title cannot exceed 120 characters']
    },
    description: {
      type: String,
      required: [true, 'Activity description is required'],
      trim: true,
      minlength: [10, 'Description must be at least 10 characters'],
      maxlength: [2000, 'Description cannot exceed 2000 characters']
    },
    category: {
      type: String,
      required: [true, 'Activity category is required'],
      lowercase: true,
      trim: true,
      enum: {
        values: ACTIVITY_CATEGORIES,
        message: 'Category must be one of: {VALUES}'
      }
    },
    organizerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Organizer ID is required'],
      index: true
    },
    startsAt: {
      type: Date,
      required: [true, 'Start date and time is required']
    },
    endsAt: {
      type: Date,
      required: [true, 'End date and time is required'],
      validate: {
        validator: function (value) {
          if (!this.startsAt || !value) return true;
          return value.getTime() > this.startsAt.getTime();
        },
        message: 'End time must be after start time'
      }
    },
    location: {
      type: pointSchema,
      required: [true, 'Activity location is required']
    },
    displayArea: {
      type: String,
      required: [true, 'Display area description is required'],
      trim: true,
      minlength: [2, 'Display area must be at least 2 characters'],
      maxlength: [200, 'Display area cannot exceed 200 characters']
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
    },
    capacity: {
      type: Number,
      required: [true, 'Capacity is required'],
      min: [1, 'Capacity must be at least 1'],
      max: [1000, 'Capacity cannot exceed 1000'],
      validate: {
        validator: Number.isInteger,
        message: 'Capacity must be an integer'
      }
    },
    placesFilled: {
      type: Number,
      default: 0,
      min: [0, 'Places filled cannot be negative'],
      validate: [
        {
          validator: Number.isInteger,
          message: 'Places filled must be an integer'
        },
        {
          validator: function (value) {
            if (this.capacity == null) return true;
            return value <= this.capacity;
          },
          message: 'Places filled cannot exceed capacity'
        }
      ]
    },
    approvalRequired: {
      type: Boolean,
      default: true
    },
    status: {
      type: String,
      enum: {
        values: ACTIVITY_STATUSES,
        message: 'Status must be one of: {VALUES}'
      },
      default: 'draft',
      index: true
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Geospatial index for radius discovery queries
activitySchema.index({ location: '2dsphere' });

// Compound indexes for discovery and filtering
activitySchema.index({ status: 1, startsAt: 1 });
activitySchema.index({ organizerId: 1, status: 1 });
activitySchema.index({ category: 1, status: 1 });

// Virtuals for capacity calculation
activitySchema.virtual('placesRemaining').get(function () {
  if (this.capacity == null || this.placesFilled == null) return null;
  return Math.max(0, this.capacity - this.placesFilled);
});

activitySchema.virtual('isFull').get(function () {
  if (this.capacity == null || this.placesFilled == null) return false;
  return this.placesFilled >= this.capacity;
});

const Activity = mongoose.models.Activity || mongoose.model('Activity', activitySchema);

module.exports = Activity;
