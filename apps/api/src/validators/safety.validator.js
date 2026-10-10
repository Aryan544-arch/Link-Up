const { z } = require('zod');
const { REPORT_REASONS, TARGET_TYPES } = require('../models/Report');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const createReportSchema = z.object({
  targetType: z.enum(TARGET_TYPES, {
    errorMap: () => ({
      message: `targetType must be one of: ${TARGET_TYPES.join(', ')}`
    })
  }),
  targetId: z
    .string()
    .regex(objectIdRegex, { message: 'targetId must be a valid 24-character hexadecimal ObjectId' }),
  reason: z.enum(REPORT_REASONS, {
    errorMap: () => ({
      message: `reason must be one of: ${REPORT_REASONS.join(', ')}`
    })
  }),
  details: z
    .string()
    .trim()
    .max(1000, { message: 'Details cannot exceed 1000 characters' })
    .optional()
    .default('')
});

const createBlockSchema = z.object({
  blockedUserId: z
    .string()
    .regex(objectIdRegex, { message: 'blockedUserId must be a valid 24-character hexadecimal ObjectId' }),
  reason: z
    .string()
    .trim()
    .max(300, { message: 'Reason cannot exceed 300 characters' })
    .optional()
    .default('')
});

module.exports = {
  createReportSchema,
  createBlockSchema
};
