/**
 * Activity Constants for MEETUP Pulse
 *
 * Aligned with PRD §3, §5, §10:
 * - Activity statuses: draft, published, cancelled, completed
 * - Default discovery radius: 3 km
 * - Supported categories & skill levels
 */

const ACTIVITY_CATEGORIES = [
  'outdoor',
  'sports',
  'fitness',
  'social',
  'nature',
  'gaming',
  'wellness',
  'arts',
  'other'
];

const SKILL_LEVELS = [
  'all-levels',
  'beginner',
  'intermediate',
  'advanced'
];

const ACTIVITY_STATUSES = [
  'draft',
  'published',
  'cancelled',
  'completed'
];

const DEFAULT_RADIUS_KM = 3;

module.exports = {
  ACTIVITY_CATEGORIES,
  SKILL_LEVELS,
  ACTIVITY_STATUSES,
  DEFAULT_RADIUS_KM
};
