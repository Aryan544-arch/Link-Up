const { z } = require('zod');

// Schema for requesting to join an activity
const createJoinRequestSchema = z.strictObject({
  note: z
    .string()
    .trim()
    .max(500, 'Note cannot exceed 500 characters')
    .optional()
});

// Schema for organizer decision on a join request
const updateJoinRequestDecisionSchema = z.strictObject({
  status: z.enum(['approved', 'rejected'], {
    errorMap: () => ({
      message: "Decision status must be either 'approved' or 'rejected'"
    })
  })
});

// Schema for requester cancelling their own join request
const cancelJoinRequestSchema = z.strictObject({
  reason: z
    .string()
    .trim()
    .max(500, 'Reason cannot exceed 500 characters')
    .optional()
});

module.exports = {
  createJoinRequestSchema,
  updateJoinRequestDecisionSchema,
  cancelJoinRequestSchema
};
