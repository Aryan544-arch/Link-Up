const { z } = require('zod');
const { ACTIVITY_CATEGORIES, SKILL_LEVELS } = require('../constants/activity.constants');
const { INTEREST_REQUEST_STATUSES } = require('../constants/interestRequest.constants');

const geoJsonCoordinatesSchema = z.tuple([
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

const createInterestRequestSchema = z
  .strictObject({
    category: z.enum(ACTIVITY_CATEGORIES, {
      errorMap: () => ({
        message: `Category must be one of: ${ACTIVITY_CATEGORIES.join(', ')}`
      })
    }),
    title: z.string().trim().max(120, 'Title cannot exceed 120 characters').optional(),
    timeStart: z.coerce.date({
      required_error: 'Start time is required',
      invalid_type_error: 'Invalid start time format'
    }),
    timeEnd: z.coerce.date({
      required_error: 'End time is required',
      invalid_type_error: 'Invalid end time format'
    }),
    location: locationSchema,
    displayArea: z
      .string({ required_error: 'Display area is required' })
      .trim()
      .min(2, 'Display area must be at least 2 characters')
      .max(200, 'Display area cannot exceed 200 characters'),
    radiusKm: z.coerce
      .number()
      .min(0.5, 'Radius must be at least 0.5 km')
      .max(100, 'Radius cannot exceed 100 km')
      .default(3),
    maxBudget: z.coerce.number().min(0, 'Maximum budget cannot be negative').default(0),
    skillLevel: z.enum(SKILL_LEVELS).default('all-levels'),
    groupSize: z.coerce
      .number()
      .int('Group size must be an integer')
      .min(2, 'Group size must be at least 2')
      .max(50, 'Group size cannot exceed 50')
      .default(2),
    expiry: z.coerce.date().optional()
  })
  .refine(
    (data) => new Date(data.timeEnd).getTime() > new Date(data.timeStart).getTime(),
    {
      message: 'End time must be after start time',
      path: ['timeEnd']
    }
  );

const updateInterestRequestSchema = z
  .strictObject({
    title: z.string().trim().max(120).optional(),
    timeStart: z.coerce.date().optional(),
    timeEnd: z.coerce.date().optional(),
    location: locationSchema.optional(),
    displayArea: z.string().trim().min(2).max(200).optional(),
    radiusKm: z.coerce.number().min(0.5).max(100).optional(),
    maxBudget: z.coerce.number().min(0).optional(),
    skillLevel: z.enum(SKILL_LEVELS).optional(),
    groupSize: z.coerce.number().int().min(2).max(50).optional(),
    expiry: z.coerce.date().optional()
  })
  .refine(
    (data) => {
      if (data.timeStart && data.timeEnd) {
        return new Date(data.timeEnd).getTime() > new Date(data.timeStart).getTime();
      }
      return true;
    },
    {
      message: 'End time must be after start time',
      path: ['timeEnd']
    }
  )
  .refine(
    (data) => Object.keys(data).length > 0,
    {
      message: 'At least one field must be provided for update'
    }
  );

const interestRequestQuerySchema = z.object({
  status: z.enum(INTEREST_REQUEST_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

module.exports = {
  createInterestRequestSchema,
  updateInterestRequestSchema,
  interestRequestQuerySchema,
  locationSchema,
  geoJsonCoordinatesSchema
};
