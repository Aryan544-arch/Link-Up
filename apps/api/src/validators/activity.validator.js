const { z } = require('zod');
const {
  ACTIVITY_CATEGORIES,
  SKILL_LEVELS,
  DEFAULT_RADIUS_KM
} = require('../constants/activity.constants');

const PROTECTED_ACTIVITY_FIELDS = [
  'organizerId',
  'placesFilled',
  'status',
  '_id',
  'createdAt',
  'updatedAt'
];

// GeoJSON coordinate validator: [longitude, latitude]
const geoJsonCoordinatesSchema = z
  .tuple([
    z
      .number({ required_error: 'Longitude is required' })
      .min(-180, 'Longitude must be between -180 and 180')
      .max(180, 'Longitude must be between -180 and 180'),
    z
      .number({ required_error: 'Latitude is required' })
      .min(-90, 'Latitude must be between -90 and 90')
      .max(90, 'Latitude must be between -90 and 90')
  ]);

const locationSchema = z.strictObject({
  type: z.literal('Point').default('Point'),
  coordinates: geoJsonCoordinatesSchema
});

// Schema for creating an Activity (Protected fields forbidden)
const createActivitySchema = z
  .strictObject({
    title: z
      .string({ required_error: 'Title is required' })
      .trim()
      .min(3, 'Title must be at least 3 characters')
      .max(120, 'Title cannot exceed 120 characters'),
    description: z
      .string({ required_error: 'Description is required' })
      .trim()
      .min(10, 'Description must be at least 10 characters')
      .max(2000, 'Description cannot exceed 2000 characters'),
    category: z.enum(ACTIVITY_CATEGORIES, {
      errorMap: () => ({
        message: `Category must be one of: ${ACTIVITY_CATEGORIES.join(', ')}`
      })
    }),
    startsAt: z.coerce.date({
      required_error: 'Start time is required',
      invalid_type_error: 'Invalid start time date format'
    }),
    endsAt: z.coerce.date({
      required_error: 'End time is required',
      invalid_type_error: 'Invalid end time date format'
    }),
    location: locationSchema,
    displayArea: z
      .string({ required_error: 'Display area is required' })
      .trim()
      .min(2, 'Display area must be at least 2 characters')
      .max(200, 'Display area cannot exceed 200 characters'),
    budget: z.coerce
      .number()
      .min(0, 'Budget cannot be negative')
      .default(0),
    skillLevel: z
      .enum(SKILL_LEVELS, {
        errorMap: () => ({
          message: `Skill level must be one of: ${SKILL_LEVELS.join(', ')}`
        })
      })
      .default('all-levels'),
    capacity: z.coerce
      .number({ required_error: 'Capacity is required' })
      .int('Capacity must be an integer')
      .min(1, 'Capacity must be at least 1')
      .max(1000, 'Capacity cannot exceed 1000'),
    approvalRequired: z.boolean().default(true)
  })
  .refine(
    (data) => new Date(data.endsAt).getTime() > new Date(data.startsAt).getTime(),
    {
      message: 'End time must be after start time',
      path: ['endsAt']
    }
  );

// Schema for updating an Activity (Protected fields forbidden)
const updateActivitySchema = z
  .strictObject({
    title: z
      .string()
      .trim()
      .min(3, 'Title must be at least 3 characters')
      .max(120, 'Title cannot exceed 120 characters')
      .optional(),
    description: z
      .string()
      .trim()
      .min(10, 'Description must be at least 10 characters')
      .max(2000, 'Description cannot exceed 2000 characters')
      .optional(),
    category: z.enum(ACTIVITY_CATEGORIES).optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    location: locationSchema.optional(),
    displayArea: z
      .string()
      .trim()
      .min(2, 'Display area must be at least 2 characters')
      .max(200, 'Display area cannot exceed 200 characters')
      .optional(),
    budget: z.coerce.number().min(0, 'Budget cannot be negative').optional(),
    skillLevel: z.enum(SKILL_LEVELS).optional(),
    capacity: z.coerce
      .number()
      .int('Capacity must be an integer')
      .min(1, 'Capacity must be at least 1')
      .max(1000, 'Capacity cannot exceed 1000')
      .optional(),
    approvalRequired: z.boolean().optional()
  })
  .refine(
    (data) => {
      if (data.startsAt && data.endsAt) {
        return new Date(data.endsAt).getTime() > new Date(data.startsAt).getTime();
      }
      return true;
    },
    {
      message: 'End time must be after start time',
      path: ['endsAt']
    }
  )
  .refine(
    (data) => Object.keys(data).length > 0,
    {
      message: 'At least one field must be provided for update'
    }
  );

// Schema for validating activity search query parameters
const activitySearchQuerySchema = z
  .object({
    lat: z.coerce
      .number()
      .min(-90, 'Latitude must be between -90 and 90')
      .max(90, 'Latitude must be between -90 and 90')
      .optional(),
    lng: z.coerce
      .number()
      .min(-180, 'Longitude must be between -180 and 180')
      .max(180, 'Longitude must be between -180 and 180')
      .optional(),
    radiusKm: z.coerce
      .number()
      .positive('Radius must be a positive number')
      .max(100, 'Radius cannot exceed 100 km')
      .default(DEFAULT_RADIUS_KM),
    category: z.enum(ACTIVITY_CATEGORIES).optional(),
    skillLevel: z.enum(SKILL_LEVELS).optional(),
    maxBudget: z.coerce
      .number()
      .min(0, 'Maximum budget cannot be negative')
      .optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    page: z.coerce
      .number()
      .int('Page must be an integer')
      .min(1, 'Page must be at least 1')
      .default(1),
    limit: z.coerce
      .number()
      .int('Limit must be an integer')
      .min(1, 'Limit must be at least 1')
      .max(100, 'Limit cannot exceed 100')
      .default(20)
  })
  .refine(
    (data) => {
      // Both coordinates must be present together if either is provided
      const hasLat = data.lat !== undefined;
      const hasLng = data.lng !== undefined;
      return (hasLat && hasLng) || (!hasLat && !hasLng);
    },
    {
      message: 'Both latitude (lat) and longitude (lng) must be provided together',
      path: ['lat']
    }
  )
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.endDate).getTime() >= new Date(data.startDate).getTime();
      }
      return true;
    },
    {
      message: 'End date must be at or after start date',
      path: ['endDate']
    }
  );

module.exports = {
  createActivitySchema,
  updateActivitySchema,
  activitySearchQuerySchema,
  locationSchema,
  geoJsonCoordinatesSchema,
  PROTECTED_ACTIVITY_FIELDS
};
