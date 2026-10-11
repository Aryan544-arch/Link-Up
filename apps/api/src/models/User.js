const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const EMAIL_REGEX = /^\S+@\S+\.\S+$/;

// Documented search radius boundaries (in kilometers)
const SEARCH_RADIUS_MIN_KM = 0.5;
const SEARCH_RADIUS_MAX_KM = 50.0;
const SEARCH_RADIUS_DEFAULT_KM = 3.0;

const userSchema = new mongoose.Schema(
  {
    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
      minlength: [2, 'Display name must be at least 2 characters'],
      maxlength: [50, 'Display name cannot exceed 50 characters']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      unique: true,
      match: [EMAIL_REGEX, 'Invalid email address format'],
      index: true
    },
    password: {
      type: String,
      required: [
        function () {
          return !this.passwordHash;
        },
        'Password is required'
      ],
      validate: {
        validator: function (val) {
          if (val && !this.passwordHash && val.length < 8) {
            return false;
          }
          return true;
        },
        message: 'Password must be at least 8 characters'
      }
    },
    passwordHash: {
      type: String,
      select: false,
      required: [
        function () {
          return !this.password;
        },
        'Password hash is required'
      ]
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    verificationToken: {
      type: String,
      default: null,
      select: false,
      index: true
    },
    verificationTokenExpiresAt: {
      type: Date,
      default: null,
      select: false
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
      default: []
    },
    searchRadiusKm: {
      type: Number,
      min: [SEARCH_RADIUS_MIN_KM, `Search radius must be at least ${SEARCH_RADIUS_MIN_KM} km`],
      max: [SEARCH_RADIUS_MAX_KM, `Search radius cannot exceed ${SEARCH_RADIUS_MAX_KM} km`],
      default: SEARCH_RADIUS_DEFAULT_KM
    },
    preferredArea: {
      type: String,
      trim: true,
      maxlength: [200, 'Preferred area cannot exceed 200 characters'],
      default: null
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
  if (this.isModified('password') && this.password && !this.passwordHash) {
    if (!this.password.startsWith('$2a$') && !this.password.startsWith('$2b$')) {
      this.password = await bcrypt.hash(this.password, 10);
    }
    this.passwordHash = this.password;
  } else if (this.passwordHash && !this.password) {
    this.password = this.passwordHash;
  }

  // Keep preferredArea and preferredLocation.displayArea synchronized
  if (this.preferredArea && (!this.preferredLocation || !this.preferredLocation.displayArea)) {
    this.preferredLocation = {
      displayArea: this.preferredArea,
      coordinates: this.preferredLocation?.coordinates || null
    };
  } else if (this.preferredLocation?.displayArea && !this.preferredArea) {
    this.preferredArea = this.preferredLocation.displayArea;
  }

  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  const hash = this.password || this.passwordHash;
  if (!hash) return false;
  return bcrypt.compare(candidatePassword, hash);
};

userSchema.methods.toSafeObject = function () {
  return {
    _id: this._id.toString(),
    id: this._id.toString(),
    email: this.email,
    displayName: this.displayName,
    bio: this.bio || '',
    avatar: this.avatar || '',
    interests: Array.isArray(this.interests) ? this.interests : [],
    searchRadiusKm: this.searchRadiusKm ?? 3,
    preferredArea: this.preferredArea || this.preferredLocation?.displayArea || null,
    preferredLocation: this.preferredLocation || {
      displayArea: this.preferredArea || '',
      coordinates: null
    },
    notificationPreferences: this.notificationPreferences || {
      inApp: true,
      email: false,
      push: false
    },
    phoneNumber: this.phoneNumber || '',
    gender: this.gender || '',
    isVerified: this.isVerified || false,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

userSchema.methods.toPublicJSON = function () {
  return {
    id: this._id.toString(),
    displayName: this.displayName,
    email: this.email,
    isVerified: this.isVerified || false,
    searchRadiusKm: this.searchRadiusKm ?? 3,
    preferredArea: this.preferredArea || this.preferredLocation?.displayArea || null,
    interests: Array.isArray(this.interests) ? this.interests : [],
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.password;
    delete ret.passwordHash;
    delete ret.verificationToken;
    delete ret.verificationTokenExpiresAt;
    delete ret.__v;
    ret.id = ret._id ? ret._id.toString() : ret.id;
    return ret;
  }
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = User;
module.exports.SEARCH_RADIUS_MIN_KM = SEARCH_RADIUS_MIN_KM;
module.exports.SEARCH_RADIUS_MAX_KM = SEARCH_RADIUS_MAX_KM;
module.exports.SEARCH_RADIUS_DEFAULT_KM = SEARCH_RADIUS_DEFAULT_KM;
