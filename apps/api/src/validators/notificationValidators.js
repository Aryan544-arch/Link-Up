const { z } = require('zod');

const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
  unreadOnly: z.preprocess(
    (val) => val === 'true' || val === true,
    z.boolean().default(false)
  )
});

const notificationIdParamSchema = z.object({
  id: z
    .string({ required_error: 'Notification ID is required' })
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid notification ID format')
});

module.exports = {
  listNotificationsQuerySchema,
  notificationIdParamSchema
};
