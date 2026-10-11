const { z } = require('zod');
const { ACTIVITY_CATEGORIES } = require('../constants/activity.constants');

const updateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, { message: 'Display name must be at least 2 characters' })
    .max(50, { message: 'Display name cannot exceed 50 characters' })
    .optional(),
  bio: z
    .string()
    .trim()
    .max(500, { message: 'Bio cannot exceed 500 characters' })
    .optional(),
  avatar: z
    .string()
    .trim()
    .max(500, { message: 'Avatar URL cannot exceed 500 characters' })
    .optional(),
  phoneNumber: z
    .string()
    .trim()
    .max(30, { message: 'Phone number cannot exceed 30 characters' })
    .optional(),
  gender: z
    .string()
    .trim()
    .max(30, { message: 'Gender cannot exceed 30 characters' })
    .optional()
});

const CATEGORY_ALIASES = {
  'outdoor & sports': 'outdoor',
  'study & focus': 'other',
  'fitness': 'fitness',
  'social & board games': 'social',
  'creative & crafts': 'arts',
  'food & coffee': 'social',
  'music & jamming': 'arts',
  'hiking & nature': 'nature',
  'tech & hackathons': 'other',
  'photography': 'arts',
  'languages & culture': 'social',
  'volunteering': 'social',
  'general meetup': 'other'
};

const interestSchema = z
  .string()
  .trim()
  .transform((val) => CATEGORY_ALIASES[val.toLowerCase()] || val.toLowerCase())
  .pipe(
    z.enum(ACTIVITY_CATEGORIES, {
      errorMap: () => ({
        message: `Interest must be one of: ${ACTIVITY_CATEGORIES.join(', ')}`
      })
    })
  );

const updatePreferencesSchema = z.object({
  interests: z.array(interestSchema).optional(),
  preferredArea: z
    .string()
    .trim()
    .max(200, { message: 'Display area cannot exceed 200 characters' })
    .optional(),
  onboardingCompleted: z.boolean().optional(),
  searchRadiusKm: z
    .number({ invalid_type_error: 'searchRadiusKm must be a number' })
    .int({ message: 'searchRadiusKm must be an integer' })
    .min(1, { message: 'searchRadiusKm must be at least 1 km' })
    .max(50, { message: 'searchRadiusKm cannot exceed 50 km' })
    .optional(),
  preferredLocation: z
    .object({
      displayArea: z
        .string()
        .trim()
        .max(200, { message: 'Display area cannot exceed 200 characters' })
        .optional()
        .default(''),
      coordinates: z
        .tuple([
          z.number().min(-180, { message: 'Longitude must be >= -180' }).max(180, { message: 'Longitude must be <= 180' }),
          z.number().min(-90, { message: 'Latitude must be >= -90' }).max(90, { message: 'Latitude must be <= 90' })
        ])
        .nullable()
        .optional()
    })
    .nullable()
    .optional(),
  notificationPreferences: z
    .object({
      inApp: z.boolean().optional(),
      email: z.boolean().optional(),
      push: z.boolean().optional()
    })
    .optional()
});

module.exports = {
  updateProfileSchema,
  updatePreferencesSchema
};
