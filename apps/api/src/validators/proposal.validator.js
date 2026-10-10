const { z } = require('zod');
const { ACTIVITY_CATEGORIES, SKILL_LEVELS } = require('../constants/activity.constants');
const { PROPOSAL_STATUSES } = require('../constants/proposal.constants');
const { locationSchema } = require('./interestRequest.validator');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const activityDraftSchema = z
  .strictObject({
    title: z
      .string({ required_error: 'Draft title is required' })
      .trim()
      .min(3, 'Title must be at least 3 characters')
      .max(120, 'Title cannot exceed 120 characters'),
    description: z
      .string({ required_error: 'Draft description is required' })
      .trim()
      .min(10, 'Description must be at least 10 characters')
      .max(2000, 'Description cannot exceed 2000 characters'),
    category: z.enum(ACTIVITY_CATEGORIES).optional(),
    startsAt: z.coerce.date({
      required_error: 'Start time is required',
      invalid_type_error: 'Invalid start time format'
    }),
    endsAt: z.coerce.date({
      required_error: 'End time is required',
      invalid_type_error: 'Invalid end time format'
    }),
    location: locationSchema,
    displayArea: z
      .string({ required_error: 'Display area is required' })
      .trim()
      .min(2, 'Display area must be at least 2 characters')
      .max(200, 'Display area cannot exceed 200 characters'),
    capacity: z.coerce
      .number()
      .int('Capacity must be an integer')
      .min(1, 'Capacity must be at least 1')
      .max(1000, 'Capacity cannot exceed 1000')
      .default(2),
    budget: z.coerce.number().min(0, 'Budget cannot be negative').default(0),
    skillLevel: z.enum(SKILL_LEVELS).default('all-levels')
  })
  .refine(
    (data) => new Date(data.endsAt).getTime() > new Date(data.startsAt).getTime(),
    {
      message: 'End time must be after start time',
      path: ['endsAt']
    }
  );

const createProposalSchema = z.strictObject({
  targetRequestId: z
    .string({ required_error: 'Target interest request ID is required' })
    .regex(objectIdRegex, 'Target request ID must be a valid 24-character hexadecimal ObjectId'),
  activityDraft: activityDraftSchema
});

const decideProposalSchema = z.strictObject({
  decision: z.enum(['accepted', 'rejected'], {
    errorMap: () => ({
      message: "Decision must be either 'accepted' or 'rejected'"
    })
  })
});

const proposalQuerySchema = z.object({
  status: z.enum(PROPOSAL_STATUSES).optional(),
  role: z.enum(['proposer', 'recipient', 'all']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

module.exports = {
  createProposalSchema,
  decideProposalSchema,
  proposalQuerySchema,
  activityDraftSchema
};
