const { z } = require('zod');

const updateProfileSchema = z
  .object({
    displayName: z
      .string({ invalid_type_error: 'Display name must be a string' })
      .trim()
      .min(2, 'Display name must be at least 2 characters')
      .max(50, 'Display name cannot exceed 50 characters')
      .optional(),
    searchRadiusKm: z
      .number({ invalid_type_error: 'Search radius must be a number' })
      .min(0.5, 'Search radius must be at least 0.5 km')
      .max(50, 'Search radius cannot exceed 50 km')
      .optional(),
    preferredArea: z
      .string({ invalid_type_error: 'Preferred area must be a string' })
      .trim()
      .max(100, 'Preferred area cannot exceed 100 characters')
      .nullable()
      .optional(),
    interests: z
      .array(
        z.string().trim().min(1, 'Interest tag cannot be empty').max(50, 'Interest tag cannot exceed 50 characters'),
        { invalid_type_error: 'Interests must be an array of strings' }
      )
      .optional()
  })
  .strict('Unknown or protected fields cannot be modified')
  .refine(
    (data) => Object.keys(data).length > 0,
    {
      message: 'At least one profile or preference field must be provided for update'
    }
  );

module.exports = {
  updateProfileSchema
};
