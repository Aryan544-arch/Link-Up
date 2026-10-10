const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ACTIVITY_CATEGORIES } = require('../constants/activity.constants');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email address format'],
      index: true
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters']
    },
    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
      minlength: [2, 'Display name must be at least 2 characters'],
      maxlength: [50, 'Display name cannot exceed 50 characters']
    },
    bio: {
      type: String,
      trim: true,
      maxlength: [500, 'Bio cannot exceed 500 characters'],
      default: ''
    },
    avatar: {
      type: String,
      trim: true,
      default: ''
    },
    interests: {
      type: [String],
      enum: {
        values: ACTIVITY_CATEGORIES,
        message: 'Invalid activity category in interests: {VALUE}'
      },
      default: []
    },
    searchRadiusKm: {
      type: Number,
      min: [1, 'Search radius must be at least 1 km'],
      max: [50, 'Search radius cannot exceed 50 km'],
      default: 3
    },
    preferredLocation: {
      displayArea: {
        type: String,
        trim: true,
        maxlength: [200, 'Display area cannot exceed 200 characters'],
        default: ''
      },
      coordinates: {
        type: [Number],
        default: null
      }
    },
    notificationPreferences: {
      inApp: {
        type: Boolean,
        default: true
      },
      email: {
        type: Boolean,
        default: false
      },
      push: {
        type: Boolean,
        default: false
      }
    },
    phoneNumber: {
      type: String,
      trim: true,
      default: ''
    },
    gender: {
      type: String,
      trim: true,
      default: ''
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    this.password = await bcrypt.hash(this.password, 10);
    next();
  } catch (err) {
    next(err);
  }
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toSafeObject = function () {
  return {
    _id: this._id.toString(),
    id: this._id.toString(),
    email: this.email,
    displayName: this.displayName,
    bio: this.bio || '',
    avatar: this.avatar || '',
    interests: this.interests || [],
    searchRadiusKm: this.searchRadiusKm ?? 3,
    preferredLocation: this.preferredLocation || { displayArea: '', coordinates: null },
    notificationPreferences: this.notificationPreferences || { inApp: true, email: false, push: false },
    phoneNumber: this.phoneNumber || '',
    gender: this.gender || '',
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = User;
