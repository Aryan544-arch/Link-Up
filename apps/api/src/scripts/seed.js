const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { env } = require('../config/env');
const User = require('../models/User');
const Activity = require('../models/Activity');
const JoinRequest = require('../models/JoinRequest');
const InterestRequest = require('../models/InterestRequest');
const Proposal = require('../models/Proposal');
const Notification = require('../models/Notification');
const { Report } = require('../models/Report');
const Block = require('../models/Block');

const DEMO_PASSWORD = 'Password123!';

const DEMO_EMAILS = [
  'alice@example.com',
  'bob@example.com',
  'charlie@example.com',
  'dana@example.com'
];

async function seedDatabase({ silent = false } = {}) {
  // Safety guard: Never seed in production
  if (env.NODE_ENV === 'production') {
    throw new Error('Seeding is strictly forbidden in production mode.');
  }

  const log = (...args) => {
    if (!silent) console.log(...args);
  };

  log('\n=== MEETUP Pulse Database Seeder ===');
  log(`[Environment] ${env.NODE_ENV}`);
  log(`[Database] Connecting to ${env.MONGODB_URI}...`);

  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(env.MONGODB_URI);
  }

  log('[Database] Connected successfully.');

  // Safe cleanup: Delete demo-associated records to prevent touching unrelated user data
  log('[Cleanup] Removing existing demo data for accounts:', DEMO_EMAILS.join(', '));
  const existingDemoUsers = await User.find({ email: { $in: DEMO_EMAILS } }).select('_id').exec();
  const demoUserIds = existingDemoUsers.map((u) => u._id);

  if (demoUserIds.length > 0) {
    await Promise.all([
      User.deleteMany({ _id: { $in: demoUserIds } }).exec(),
      Activity.deleteMany({ organizerId: { $in: demoUserIds } }).exec(),
      JoinRequest.deleteMany({ userId: { $in: demoUserIds } }).exec(),
      InterestRequest.deleteMany({ userId: { $in: demoUserIds } }).exec(),
      Proposal.deleteMany({ $or: [{ proposerId: { $in: demoUserIds } }, { recipientId: { $in: demoUserIds } }] }).exec(),
      Notification.deleteMany({ recipientId: { $in: demoUserIds } }).exec(),
      Report.deleteMany({ reporterId: { $in: demoUserIds } }).exec(),
      Block.deleteMany({ $or: [{ blockerId: { $in: demoUserIds } }, { blockedUserId: { $in: demoUserIds } }] }).exec()
    ]);
  }

  // 1. Create Demo Personas
  log('[Seed] Creating demo user accounts...');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // User 1: Alice Chen (Experienced Organizer)
  const alice = new User({
    email: 'alice@example.com',
    password: passwordHash,
    displayName: 'Alice Chen',
    bio: 'Community running coach and outdoor enthusiast.',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    interests: ['outdoor', 'fitness', 'nature'],
    searchRadiusKm: 5,
    preferredLocation: {
      displayArea: 'Central Park, New York',
      coordinates: [-73.9665, 40.7812]
    },
    notificationPreferences: { inApp: true, email: true, push: false },
    gender: 'female'
  });
  // Bypass mongoose pre-save hash since we already hashed
  alice.$isNew = true;
  await User.collection.insertOne(alice.toObject());

  // User 2: Bob Smith (Active Participant & Seeker)
  const bob = new User({
    email: 'bob@example.com',
    password: passwordHash,
    displayName: 'Bob Smith',
    bio: 'Looking for casual running and weekend hiking buddies.',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    interests: ['outdoor', 'sports', 'social'],
    searchRadiusKm: 3,
    preferredLocation: {
      displayArea: 'Midtown East, New York',
      coordinates: [-73.9712, 40.7505]
    },
    notificationPreferences: { inApp: true, email: false, push: false },
    gender: 'male'
  });
  await User.collection.insertOne(bob.toObject());

  // User 3: Charlie Patel (Demand Matcher)
  const charlie = new User({
    email: 'charlie@example.com',
    password: passwordHash,
    displayName: 'Charlie Patel',
    bio: 'Loves pickup games and meeting fellow sports enthusiasts.',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
    interests: ['sports', 'fitness', 'social'],
    searchRadiusKm: 5,
    preferredLocation: {
      displayArea: 'Lower East Side, New York',
      coordinates: [-73.9880, 40.7180]
    },
    notificationPreferences: { inApp: true, email: true, push: false },
    gender: 'male'
  });
  await User.collection.insertOne(charlie.toObject());

  // User 4: Dana Taylor (Newcomer)
  const dana = new User({
    email: 'dana@example.com',
    password: passwordHash,
    displayName: 'Dana Taylor',
    bio: 'New in town, excited for wellness and social activities!',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150',
    interests: ['wellness', 'social', 'arts'],
    searchRadiusKm: 3,
    preferredLocation: {
      displayArea: 'Greenwich Village, New York',
      coordinates: [-73.9973, 40.7308]
    },
    notificationPreferences: { inApp: true, email: false, push: false },
    gender: 'prefer-not-to-say'
  });
  await User.collection.insertOne(dana.toObject());

  log('[Seed] Created 4 demo accounts (Alice, Bob, Charlie, Dana).');

  // 2. Create Published & Draft Activities
  log('[Seed] Creating demo activities...');
  const tomorrowMorning = new Date();
  tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
  tomorrowMorning.setHours(7, 30, 0, 0);

  const tomorrowEnds = new Date(tomorrowMorning.getTime() + 90 * 60 * 1000); // 1.5 hrs

  const saturdayMorning = new Date();
  saturdayMorning.setDate(saturdayMorning.getDate() + ((6 - saturdayMorning.getDay() + 7) % 7 || 7));
  saturdayMorning.setHours(10, 0, 0, 0);

  const saturdayEnds = new Date(saturdayMorning.getTime() + 180 * 60 * 1000); // 3 hrs

  // Activity 1: Sunrise 5K Run (Alice)
  const runActivity = await Activity.create({
    title: 'Central Park Sunrise 5K Run',
    description: 'Friendly morning 5K loop through Central Park. All paces welcome! Meet at Columbus Circle entrance.',
    category: 'fitness',
    organizerId: alice._id,
    startsAt: tomorrowMorning,
    endsAt: tomorrowEnds,
    location: {
      type: 'Point',
      coordinates: [-73.9818, 40.7681]
    },
    displayArea: 'Central Park South, New York',
    budget: 0,
    skillLevel: 'all-levels',
    capacity: 10,
    placesFilled: 2, // Alice (1) + Bob (1 approved)
    approvalRequired: true,
    status: 'published'
  });

  // Activity 2: Weekend Nature Trail Hike (Alice)
  const hikeActivity = await Activity.create({
    title: 'Hudson River Nature Walk & Photography',
    description: 'Scenic walk along Riverside Park with casual nature photography and river views.',
    category: 'nature',
    organizerId: alice._id,
    startsAt: saturdayMorning,
    endsAt: saturdayEnds,
    location: {
      type: 'Point',
      coordinates: [-73.9754, 40.7989]
    },
    displayArea: 'Riverside Park, Upper West Side',
    budget: 5,
    skillLevel: 'beginner',
    capacity: 6,
    placesFilled: 1, // Alice only, Bob is pending
    approvalRequired: true,
    status: 'published'
  });

  // Activity 3: Board Games & Coffee (Alice - Draft)
  const boardGamesActivity = await Activity.create({
    title: 'Friday Evening Strategy Board Games',
    description: 'Catan, Ticket to Ride, and casual tabletop games at the local board game cafe.',
    category: 'social',
    organizerId: alice._id,
    startsAt: new Date(Date.now() + 5 * 86400000),
    endsAt: new Date(Date.now() + 5 * 86400000 + 3 * 3600000),
    location: {
      type: 'Point',
      coordinates: [-73.9903, 40.7328]
    },
    displayArea: 'East Village, New York',
    budget: 10,
    skillLevel: 'all-levels',
    capacity: 8,
    placesFilled: 1,
    approvalRequired: false,
    status: 'draft'
  });

  // Activity 4: Pickup Basketball (Charlie)
  const basketballActivity = await Activity.create({
    title: 'Sunday Morning Pickup Basketball',
    description: 'Casual half-court basketball at East River Park. Bring water and sneakers.',
    category: 'sports',
    organizerId: charlie._id,
    startsAt: new Date(Date.now() + 3 * 86400000),
    endsAt: new Date(Date.now() + 3 * 86400000 + 2 * 3600000),
    location: {
      type: 'Point',
      coordinates: [-73.9744, 40.7168]
    },
    displayArea: 'East River Park, New York',
    budget: 0,
    skillLevel: 'intermediate',
    capacity: 8,
    placesFilled: 1,
    approvalRequired: false,
    status: 'published'
  });

  log('[Seed] Created 4 activities across fitness, nature, social, sports.');

  // 3. Create Join Requests
  log('[Seed] Creating demo join requests...');
  // Bob approved for Sunrise 5K
  const bobRunJoin = await JoinRequest.create({
    activityId: runActivity._id,
    userId: bob._id,
    status: 'approved',
    note: 'Excited to run! Training for my first 10K.'
  });

  // Bob pending for Nature Hike
  const bobHikeJoin = await JoinRequest.create({
    activityId: hikeActivity._id,
    userId: bob._id,
    status: 'pending',
    note: 'Love photography and nature trails.'
  });

  log('[Seed] Created join requests (1 approved, 1 pending).');

  // 4. Create Interest Requests and Matching Proposal
  log('[Seed] Creating interest requests and matching proposals...');
  const weekendStart = new Date(Date.now() + 2 * 86400000);
  const weekendEnd = new Date(Date.now() + 4 * 86400000);

  // Bob's interest request
  const bobInterest = await InterestRequest.create({
    userId: bob._id,
    category: 'sports',
    timeStart: weekendStart,
    timeEnd: weekendEnd,
    location: {
      type: 'Point',
      coordinates: [-73.985, 40.748]
    },
    displayArea: 'Midtown East',
    radiusKm: 5,
    maxBudget: 20,
    skillLevel: 'beginner',
    groupSize: 4,
    status: 'proposed'
  });

  // Charlie's interest request
  const charlieInterest = await InterestRequest.create({
    userId: charlie._id,
    category: 'sports',
    timeStart: weekendStart,
    timeEnd: weekendEnd,
    location: {
      type: 'Point',
      coordinates: [-73.988, 40.718]
    },
    displayArea: 'Lower East Side',
    radiusKm: 5,
    maxBudget: 15,
    skillLevel: 'all-levels',
    groupSize: 4,
    status: 'proposed'
  });

  // Proposal: Charlie proposes activity to Bob
  const demoProposal = await Proposal.create({
    sourceRequestId: charlieInterest._id,
    targetRequestId: bobInterest._id,
    proposerId: charlie._id,
    recipientId: bob._id,
    activityDraft: {
      title: 'Saturday Casual Tennis Doubles',
      description: 'Looking to play casual doubles tennis at the public courts.',
      category: 'sports',
      startsAt: new Date(weekendStart.getTime() + 10 * 3600000),
      endsAt: new Date(weekendStart.getTime() + 12 * 3600000),
      location: {
        type: 'Point',
        coordinates: [-73.982, 40.735]
      },
      displayArea: 'Union Square Tennis Courts',
      capacity: 4,
      budget: 0,
      skillLevel: 'all-levels'
    },
    status: 'pending'
  });

  log('[Seed] Created matched interest requests and pending proposal.');

  // 5. Create In-App Notifications
  log('[Seed] Creating demo in-app notifications...');
  await Notification.create([
    {
      recipientId: alice._id,
      type: 'JOIN_REQUEST_RECEIVED',
      title: 'New Join Request',
      message: 'Bob Smith requested to join "Hudson River Nature Walk & Photography".',
      relatedResourceId: hikeActivity._id,
      relatedResourceType: 'activity',
      readAt: null
    },
    {
      recipientId: bob._id,
      type: 'JOIN_REQUEST_APPROVED',
      title: 'Join Request Approved',
      message: 'Your request to join "Central Park Sunrise 5K Run" was approved!',
      relatedResourceId: runActivity._id,
      relatedResourceType: 'activity',
      readAt: null
    },
    {
      recipientId: bob._id,
      type: 'PROPOSAL_RECEIVED',
      title: 'New Activity Proposal',
      message: 'Charlie Patel proposed an activity: "Saturday Casual Tennis Doubles"!',
      relatedResourceId: demoProposal._id,
      relatedResourceType: 'proposal',
      readAt: null
    },
    {
      recipientId: dana._id,
      type: 'SYSTEM',
      title: 'Welcome to MEETUP Pulse!',
      message: 'Explore activities within 3 km or set your preferences in Settings.',
      relatedResourceType: 'none',
      readAt: new Date()
    }
  ]);

  log('[Seed] Created notifications for Alice, Bob, and Dana.');

  log('\n=== Database Seeding Complete ===');
  log('Demo Personas Ready for Login (Password for all: Password123!)');
  log('1. Alice Chen:   alice@example.com   (Organizer of 3 activities, 1 pending request)');
  log('2. Bob Smith:     bob@example.com     (Participant with 1 approved, 1 pending request, 1 proposal)');
  log('3. Charlie Patel: charlie@example.com (Demand matcher with pending tennis proposal)');
  log('4. Dana Taylor:   dana@example.com   (Newcomer ready for onboarding)\n');

  return {
    users: [alice, bob, charlie, dana],
    activities: [runActivity, hikeActivity, boardGamesActivity, basketballActivity]
  };
}

if (require.main === module) {
  seedDatabase()
    .then(async () => {
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Seed] Error seeding database:', err);
      process.exit(1);
    });
}

module.exports = {
  seedDatabase,
  DEMO_EMAILS,
  DEMO_PASSWORD
};
