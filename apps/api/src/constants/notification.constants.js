/**
 * Notification Constants for MEETUP Pulse
 *
 * Aligned with PRD §4 (Journey H), §10 (Data Model), §11 (REST API), and FR-14.
 */

const NOTIFICATION_TYPES = [
  'JOIN_REQUEST_RECEIVED',
  'JOIN_REQUEST_APPROVED',
  'JOIN_REQUEST_REJECTED',
  'ATTENDEE_CANCELLED',
  'ACTIVITY_CANCELLED',
  'PROPOSAL_RECEIVED',
  'PROPOSAL_ACCEPTED',
  'PROPOSAL_REJECTED',
  'PROPOSAL_CANCELLED',
  'SYSTEM'
];

const RELATED_RESOURCE_TYPES = [
  'activity',
  'join_request',
  'interest_request',
  'proposal',
  'none'
];

module.exports = {
  NOTIFICATION_TYPES,
  RELATED_RESOURCE_TYPES
};
