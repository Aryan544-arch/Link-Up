const { z } = require('zod');
const { ACTIVITY_CATEGORIES, SKILL_LEVELS } = require('../constants/activity.constants');

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

const SKILL_LEVEL_ALIASES = {
  'all': 'all-levels',
  'all skill levels welcome': 'all-levels',
  'all-levels': 'all-levels',
  'beginner friendly': 'beginner',
  'beginner': 'beginner',
  'intermediate': 'intermediate',
  'advanced / experienced': 'advanced',
  'advanced': 'advanced'
};

const planActivitySchema = z.object({
  category: z
    .string()
    .trim()
    .transform((val) => CATEGORY_ALIASES[val.toLowerCase()] || val.toLowerCase())
    .pipe(
      z.enum(ACTIVITY_CATEGORIES, {
        errorMap: () => ({
          message: `Category must be one of: ${ACTIVITY_CATEGORIES.join(', ')}`
        })
      })
    )
    .optional()
    .default('outdoor'),
  prompt: z
    .string()
    .trim()
    .max(300, { message: 'Prompt cannot exceed 300 characters' })
    .optional()
    .default(''),
  displayArea: z
    .string()
    .trim()
    .max(200, { message: 'Display area cannot exceed 200 characters' })
    .optional()
    .default(''),
  locationHint: z
    .string()
    .trim()
    .max(200)
    .optional(),
  skillLevel: z
    .string()
    .trim()
    .transform((val) => SKILL_LEVEL_ALIASES[val.toLowerCase()] || val.toLowerCase())
    .pipe(
      z.enum(SKILL_LEVELS, {
        errorMap: () => ({
          message: `skillLevel must be one of: ${SKILL_LEVELS.join(', ')}`
        })
      })
    )
    .optional()
    .default('all-levels'),
  groupSize: z
    .coerce
    .number()
    .int('groupSize must be an integer')
    .min(2, 'groupSize must be at least 2')
    .max(50, 'groupSize cannot exceed 50')
    .optional()
    .default(6),
  targetGroupSize: z
    .coerce
    .number()
    .int()
    .min(2)
    .max(50)
    .optional(),
  budget: z
    .coerce
    .number()
    .min(0, 'budget must be non-negative')
    .max(1000, 'budget cannot exceed 1000')
    .optional()
    .default(0),
  durationMinutes: z.coerce.number().int().min(15).max(480).optional(),
  time: z.string().trim().max(50).optional(),
  date: z.string().trim().max(50).optional()
});

module.exports = {
  planActivitySchema
};
