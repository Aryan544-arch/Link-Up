const mongoose = require('mongoose');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
      match: [EMAIL_REGEX, 'Please provide a valid email address']
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false // Excluded from normal query results by default
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    verificationToken: {
      type: String,
      default: null,
      select: false, // Excluded from normal query results by default
      index: true
    },
    verificationTokenExpiresAt: {
      type: Date,
      default: null,
      select: false // Excluded from normal query results by default
    },
    searchRadiusKm: {
      type: Number,
      default: SEARCH_RADIUS_DEFAULT_KM,
      min: [SEARCH_RADIUS_MIN_KM, `Search radius must be at least ${SEARCH_RADIUS_MIN_KM} km`],
      max: [SEARCH_RADIUS_MAX_KM, `Search radius cannot exceed ${SEARCH_RADIUS_MAX_KM} km`]
    },
    preferredArea: {
      type: String,
      trim: true,
      maxlength: [100, 'Preferred area cannot exceed 100 characters'],
      default: null
    },
    interests: {
      type: [String],
      default: []
    }
  },
  {
    timestamps: true
  }
);

// Method to format a public, safe user JSON representation
userSchema.methods.toPublicJSON = function () {
  return {
    id: this._id.toString(),
    displayName: this.displayName,
    email: this.email,
    isVerified: this.isVerified,
    searchRadiusKm: this.searchRadiusKm,
    preferredArea: this.preferredArea,
    interests: Array.isArray(this.interests) ? this.interests : [],
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

// Transform toJSON so that private credentials are stripped even if selected explicitly
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.verificationToken;
    delete ret.verificationTokenExpiresAt;
    delete ret.__v;
    ret.id = ret._id.toString();
    return ret;
  }
});

const User = mongoose.model('User', userSchema);

module.exports = User;
module.exports.SEARCH_RADIUS_MIN_KM = SEARCH_RADIUS_MIN_KM;
module.exports.SEARCH_RADIUS_MAX_KM = SEARCH_RADIUS_MAX_KM;
module.exports.SEARCH_RADIUS_DEFAULT_KM = SEARCH_RADIUS_DEFAULT_KM;
