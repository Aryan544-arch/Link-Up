# MEETUP Pulse — Product Requirements Document (PRD)

**Version:** 1.0 | **Status:** Working baseline for the hackathon MVP  
**Audience:** Product team, developers, QA, designers, and AI coding agents

## 1. Executive summary

MEETUP Pulse is a location-aware activity marketplace designed to help people spend less time passively using technology and more time connecting with people, getting outdoors, and doing physical or social activities. Users can discover nearby activities, organize their own activities, request to join activities, and coordinate with organizers.

The product is **demand-first**. When no existing activity fits, a user can save an interest request. The backend can match compatible requests using deterministic rules. A match is a suggestion—not a commitment—and must not automatically publish an activity or confirm attendance.

The first product is a responsive web app/PWA for mobile and desktop. A reliable discovery → details → join request → organizer decision loop is more important than shipping every advanced integration. Core features must work even if AI, Web Push, email, Redis, or real-time chat is unavailable.

## 2. Vision and product principles

### Vision
Make it easy for people to turn “I want to do something” into a real plan with real people.

### Principles
1. **Real-world outcomes:** encourage participation, not unnecessary screen time.
2. **User control:** users control their search area, radius, profile, and notification preferences.
3. **Real data only:** cards, matches, and notifications reflect persisted, authorized data.
4. **No surprise commitments:** publishing, joining, approval, and cancellation require explicit actions.
5. **Privacy and safety by design:** authorization, validation, reporting, blocking, and location privacy are core requirements.
6. **Useful without AI:** core discovery and matching must work without an AI provider.
7. **Explainable matching:** show factual reasons and never override hard constraints with a score.
8. **Mobile-first and accessible:** responsive layout, keyboard support, labels, and visible focus.

## 3. Goals and scope

### MVP goals
- Register, verify email, log in/out, and maintain a profile.
- Onboard users to interests, location preferences, and notification settings.
- Ask for browser location permission with a clear explanation; support manual location selection if denied.
- Show published activities within a **default 3 km radius**, configurable in settings and discovery.
- Search/filter by location, radius, activity category, time, budget, and supported attributes.
- Create, edit, publish, and cancel activities with server-side validation and authorization.
- Support join requests and organizer approve/reject decisions.
- Prevent duplicate active requests and overbooking, including concurrent approvals.
- Allow users to save interest requests when no activity fits and receive deterministic match suggestions.
- Provide My Plans with correct statuses.
- Persist in-app notifications for important state changes.
- Provide tests, seed data, setup instructions, and an understandable code structure.

### Stretch / later
- Web Push for important updates when the browser/app is closed.
- Nodemailer for verification and selected transactional emails.
- BullMQ + Redis for retries, delayed jobs, and delivery queues.
- Socket.IO chat and live status updates.
- Leaflet map interaction and richer location selection.
- Optional AI-assisted planning, with validated outputs and manual/deterministic fallback.
- Advanced moderation, recurring activities, analytics, and calendar integration.

### Non-goals for initial MVP
- Continuous background GPS tracking.
- Native Android/iOS apps; the initial delivery is a responsive web app/PWA.
- Automatic activity publication from a match or AI response.
- Guaranteeing participant safety or verifying every organizer.
- Payments unless separately approved.

### Success criteria
- A user can register and authenticate; session survives refresh and logout invalidates it.
- A user can find an eligible activity in the chosen radius, inspect it, and request to join.
- An organizer can approve/reject requests, and capacity is never exceeded.
- A user can create an interest request and see eligible deterministic matches.
- Matches/proposals do not automatically publish or confirm attendance.
- My Plans reflects actual persisted states.
- Core workflows work without AI or push permission.
- The app remains usable on mobile and desktop, including when location permission is denied.

## 4. Users and main journeys

### User types
- **Activity seeker:** discovers something nearby.
- **Organizer:** creates an activity and manages requests.
- **Interest requester:** describes what they want when discovery returns no fit.
- **Participant:** checks plans, status, and messages.
- **Moderator/admin:** reviews reports if an admin workflow is included.

An account can be both seeker and organizer.

### Journey A — registration and onboarding
1. User enters display name, email, password, and accepts required terms.
2. Backend validates input, hashes the password, creates an unverified account, and sends a verification link or OTP.
3. User completes a time-limited, single-use verification flow.
4. User completes onboarding: interests, preferred area, notification preferences, and any approved profile fields.
5. Explain the value of location, then request browser location permission.
6. If allowed, obtain fresh location while the app is open/foregrounded. If denied/unavailable, offer manual area/map selection.
7. User can later change radius, preferred area, interests, and notifications in Settings.

**Important:** do not ask profile/onboarding questions at every login. Login authenticates; onboarding is shown only when required information is missing.

**Privacy decision:** phone number and gender should not automatically be mandatory. Recommended default: gender optional with “prefer not to say”; phone optional unless there is a clear, approved use case. Decide the minimum age and age-data policy before public launch.

### Journey B — login
1. User submits email and password.
2. Server validates credentials and creates a secure session.
3. Frontend loads the current-user profile and preferences.
4. If location permission remains granted, the app may request a fresh foreground location on opening.
5. Logout invalidates the server session.

### Journey C — discover and inspect
1. Determine search location: user-selected search location first; otherwise fresh foreground location if permission is granted; otherwise saved/manual preferred area.
2. Apply the selected radius (default 3 km).
3. Return only eligible published, future, non-cancelled activities.
4. Show cards with activity name, organizer display name, start time, duration, approximate area/distance, and category/short description.
5. Clicking a card opens complete details: title, organizer, start/end or duration, description, area/meeting point, budget, skill level, capacity/places remaining, approval rules, and join action.
6. Empty results offer clear next actions: expand radius, change location/filter, or create an interest request.

### Journey D — create and publish
1. Authenticated user fills in title, description, category, start/end or duration, location, budget, skill level, capacity, and approval setting.
2. Frontend helps with validation; backend is authoritative.
3. Activity is created in draft state or the documented initial state.
4. Organizer explicitly publishes after reviewing it.
5. Only eligible published activities appear in discovery.
6. Organizer may edit/cancel their own activity; participants should be notified about material changes/cancellation.

Organizer identity must come from the authenticated session, never a client-provided `organizerId`.

### Journey E — request to join
1. User requests to join a published activity.
2. Server checks authentication, status, start time, eligibility, capacity, and duplicate active requests.
3. Request is stored as pending, unless a documented product rule permits automatic approval.
4. Only the activity organizer (or authorized moderator) can approve/reject it.
5. Capacity updates must be atomic/transaction-safe so concurrent approvals cannot overbook.
6. Requester sees status and receives an in-app notification; push/email are optional delivery channels.
7. Cancelled/full activities reject new requests.

### Journey F — interest requests and deterministic matching
1. User records activity type/category, preferred time window, approximate area/location and radius, max budget, skill level, group size, and optional expiry.
2. Backend validates and persists the request.
3. Matching first applies hard constraints: compatible type, overlapping time, acceptable distance/area, compatible budget when specified, active/unexpired status, and no self-match.
4. Eligible matches are ranked by transparent soft scores: interest/category fit, time overlap, distance, budget fit, and skill compatibility.
5. Return only real data the user is authorized to see and factual match reasons.
6. A match is only a suggestion. It does not automatically create a confirmed event.
7. If participants agree, create a proposal/draft; relevant people review it and an organizer explicitly publishes it.
8. Prevent a request from being reused in conflicting active proposals.

### Journey G — My Plans
Show distinct groups for:
- Activities I organize
- Activities I have joined/been approved for
- Join requests awaiting a decision
- Interest requests and match suggestions
- Draft/proposed activities awaiting review
- Past/cancelled activities where useful

Always distinguish pending from approved/confirmed.

### Journey H — chat and notifications
Chat is a stretch feature unless the core flow is complete. If implemented, users can access a conversation only when authorized by the related activity/participation rules. Validate each Socket.IO event, persist messages if history is required, rate-limit sending, and provide report/block controls.

In-app notifications are the reliable baseline. Examples: join request received, request approved/rejected, activity updated/cancelled, match found, proposal awaiting response, and new message. Store notification records even if push is disabled.

Web Push requires browser permission, a service worker, a stored push subscription, HTTPS in production, server-side delivery, and cleanup/retry behavior. Push is not guaranteed. BullMQ requires Redis; if unavailable, core actions must still succeed and in-app notifications must still be stored. Nodemailer can deliver verification and selected transactional email; delivery failure must not mark an account verified.

## 5. Location and radius behavior

- Default radius is **3 km** and users can change it in Settings or discovery.
- Users can choose a custom location using a map or area search.
- Current location is fetched when the app opens/is foregrounded, if permission is granted.
- A normal web app generally cannot silently fetch fresh GPS while completely closed. When closed, notification targeting must use saved preferences, the last permitted location, the activity's location, or a user-defined area—not continuous background tracking.
- Show whether results use current, manually selected, or saved location.
- Denied/unavailable location must not block use; provide manual selection.
- Use server-side geospatial querying/indexes as appropriate; never trust client-provided coordinates without validation.
- Do not publicly expose exact private addresses; reveal precise meeting details only according to the product's privacy/authorization rules.

## 6. Functional requirements

Priority: **P0** = required for MVP; **P1** = implement if core is stable; **P2** = future.

| ID | Priority | Requirement |
|---|---|---|
| FR-01 | P0 | Register with validated fields and securely hashed password |
| FR-02 | P0 | Expiring, single-use email verification link or OTP |
| FR-03 | P0 | Login/logout/current-user endpoint and secure session |
| FR-04 | P0 | Profile, onboarding, interests, preferences |
| FR-05 | P0 | Permission-based location plus manual fallback |
| FR-06 | P0 | Discover/filter published activities within chosen radius |
| FR-07 | P0 | Detail page with privacy-safe data |
| FR-08 | P0 | Create/edit/publish/cancel with authorization |
| FR-09 | P0 | Join requests and organizer decisions |
| FR-10 | P0 | Duplicate-request prevention and atomic capacity checks |
| FR-11 | P0 | Create/manage interest requests |
| FR-12 | P0 | Deterministic matching and proposal lifecycle |
| FR-13 | P0 | My Plans with accurate statuses |
| FR-14 | P0 | Persisted in-app notifications for key events |
| FR-15 | P0 | Report/block entry point and persistence |
| FR-16 | P0 | Zod validation, centralized errors, authorization tests |
| FR-17 | P0 | Responsive UI, accessible controls, loading/error/empty states |
| FR-18 | P1 | Email notifications using Nodemailer |
| FR-19 | P1 | Web Push subscription and delivery |
| FR-20 | P1 | BullMQ/Redis retryable notification jobs |
| FR-21 | P1 | Socket.IO chat/live status |
| FR-22 | P1 | Leaflet map and manual location selection |
| FR-23 | P2 | Optional AI planning with validated output/manual fallback |
| FR-24 | P2 | Advanced moderation, analytics, recurring events |

## 7. Non-functional requirements

### Security and privacy
- Hash passwords using a maintained password-hashing library; never store plaintext.
- Use secure, HTTP-only, SameSite cookies and HTTPS in production; use a production session store rather than Express MemoryStore.
- Protect state-changing requests against CSRF where required by the session/cookie setup.
- Rate-limit login, verification, message sending, and abuse-prone endpoints.
- Validate every input on the server using Zod or equivalent.
- Enforce object-level authorization for activities, join requests, conversations, and profiles.
- Never expose password hashes, session IDs, tokens, secrets, stack traces, provider errors, private phone/email, or exact private coordinates.
- Minimize collection of location and demographic data; document retention and user controls.
- Define account deletion and data retention before public release.
- Do not infer or disclose sensitive traits from gender, location, or interests.

### Reliability and performance
- Optional provider failure must not break core discovery/joining.
- Persist critical state changes before returning success.
- Use idempotency/deduplication for retried side effects.
- Paginate lists and index common filters/geospatial queries.
- Avoid N+1 reads for activity cards.
- Do not claim performance targets until measured in the target environment.

### Accessibility and observability
- Use semantic HTML, accessible labels, keyboard focus, sufficient contrast, and reduced-motion support.
- Do not use color alone for request status.
- Provide text alternatives for map actions.
- Log request IDs, error categories, and job outcomes without secrets or unnecessary precise location.
- Include a health check and resettable demo data.

## 8. Recommended technology stack

### Frontend
- React + JavaScript; Vite for tooling
- React Router if client-side routing is needed
- **shadcn/ui** (assumption: “Shades UI” meant shadcn/ui)
- Lucide React icons
- Sonner for toast messages
- Axios for REST calls
- Leaflet + React Leaflet for maps
- Socket.IO client for chat/live updates
- Service worker and Web Push subscription support

### Backend
- Node.js + Express REST API
- MongoDB + Mongoose
- Zod for request and environment validation
- express-session with a production-appropriate session store
- Nodemailer for email
- web-push for browser push
- Socket.IO for real-time events
- BullMQ + Redis for optional delayed/retryable jobs
- Maintained password hashing library
- Team-selected test runner and HTTP test client

**Terminology assumption:** “mad-leaflet” is interpreted as **React Leaflet**. Confirm if a different package was intended.

### Integration rules
- REST is the source of truth for durable state; sockets announce changes but do not bypass authorization.
- Models and server validation define persistence/business constraints.
- Optional integrations must be feature-gated and fail gracefully when configuration is missing.
- Keep secrets in environment variables; commit `.env.example`, never real `.env` credentials.

## 9. Suggested MVP folder structure

Adapt incrementally; do not overwrite existing working code merely to match this diagram.

```text
meetup-pulse/
├── apps/
│   ├── web/
│   │   ├── public/service-worker.js
│   │   └── src/
│   │       ├── app/                 # App, router, providers
│   │       ├── assets/
│   │       ├── components/
│   │       │   ├── ui/              # shadcn/ui wrappers
│   │       │   ├── layout/
│   │       │   ├── activities/
│   │       │   ├── map/
│   │       │   └── notifications/
│   │       ├── features/
│   │       │   ├── auth/ profile/ discovery/ activities/
│   │       │   ├── interests/ plans/ chat/ settings/
│   │       ├── hooks/
│   │       ├── lib/                 # Axios client, socket client
│   │       ├── styles/
│   │       └── main.jsx
│   └── api/
│       ├── src/
│       │   ├── app.js
│       │   ├── server.js
│       │   ├── config/
│       │   ├── models/
│       │   ├── routes/
│       │   ├── controllers/
│       │   ├── services/
│       │   │   ├── matching/ notifications/ email/
│       │   ├── middleware/
│       │   ├── validators/
│       │   ├── sockets/
│       │   ├── jobs/
│       │   ├── utils/
│       │   └── constants/
│       └── tests/
├── packages/shared/                 # Optional shared constants/schemas
├── docs/PRD.md
├── docs/API_CONTRACT.md
├── docs/ARCHITECTURE.md
├── docs/TASKS.md
├── .env.example
├── package.json
├── README.md
└── AGENTS.md
```

Architecture boundaries: controllers handle HTTP; services implement business logic; models define persistence; validators validate input; middleware handles auth and cross-cutting concerns. If the current repository uses another layout, preserve working code and document the mapping rather than doing a risky wholesale restructure.

## 10. Core data model (logical outline)

### User
`displayName`, normalized unique `email`, `passwordHash`, verification state/timestamp, optional `phoneNumber`, approved age field/verification state, optional `gender`, `interests[]`, preferred/manual location, `searchRadiusKm` default 3, notification preferences, timestamps. Public serializers must omit private fields.

### Activity
`title`, `description`, `category`, `organizerId`, `startsAt`, `endsAt` or documented duration, location coordinates and display area, budget/cost, skill level, capacity, `approvalRequired`, status (draft/published/cancelled/completed), timestamps.

### InterestRequest
`userId`, activity type/category, `timeStart`, `timeEnd`, approximate area/location and radius, `maxBudget`, skill level, group size, status (active/matched-or-proposed/withdrawn/expired), expiry, timestamps.

### JoinRequest
`activityId`, `userId`, status (pending/approved/rejected/cancelled), timestamps. Enforce one active request per user/activity through a database/application strategy.

### Proposal
References to source interest requests, proposed fields or draft activity ID, proposer/organizer ID, participant responses, status, timestamps. Prevent conflicting active proposals from consuming the same request.

### Notification
`recipientId`, type, related resource type/ID, `readAt`, `createdAt`, delivery state/channel, deduplication key where needed.

### Conversation/Message (stretch)
Authorized participants, related activity, sender, body, timestamps, and moderation/deletion state as required. Every read/write checks participant authorization.

### Report/Block
Reporter, target type/ID, reason, status, timestamps; blocking relationship and enforcement rules. Restrict report visibility to authorized moderation workflows.

## 11. REST API outline

The existing `API_CONTRACT.md` is the source of truth for exact schemas. Reconcile this outline with it before coding.

**Auth/profile**
- `POST /api/auth/register`
- `POST /api/auth/verify-email` or a documented verification-link endpoint
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `PATCH /api/me/profile`
- `GET/PATCH /api/me/preferences`

**Activities**
- `GET /api/activities` (location, radius, filters, pagination)
- `POST /api/activities`
- `GET /api/activities/:id`
- `PATCH /api/activities/:id`
- `POST /api/activities/:id/publish`
- `POST /api/activities/:id/cancel`
- `POST /api/activities/:id/join`
- `GET /api/activities/:id/requests` (organizer only)
- `PATCH /api/join-requests/:id` (authorized decision)

**Interests/plans**
- `POST /api/interest-requests`
- `GET /api/interest-requests/matches`
- `GET/PATCH /api/interest-requests/:id`
- `POST /api/interest-requests/:id/proposals`
- `GET /api/me/plans`

**Notifications and safety**
- `GET /api/notifications`
- `PATCH /api/notifications/:id/read`
- `POST /api/push/subscribe`
- `DELETE /api/push/subscribe`
- `POST /api/reports`
- `POST /api/blocks` and management route if included
- Chat history REST routes and Socket.IO events, only if chat is enabled

For every endpoint, document auth, authorization, Zod schema, status codes, response envelope, pagination, and side effects. Team members must not independently invent incompatible fields or response shapes.

## 12. Work split across four people

One accountable owner per workstream. Ownership does not mean changing shared files without coordination.

### Person 1 — Frontend and user experience
**Owns:** React/Vite setup; responsive page shell; registration/login/onboarding screens; discovery cards, filters and detail pages; activity forms; map/manual location UI; join interactions; My Plans; settings/preferences; notification UI; accessibility; Axios client and frontend config.

**Coordinates with:** Person 2 on API fields and error shapes; Person 3 on session/auth behavior and push/socket client integration; Person 4 on acceptance and demo checks.

**Deliverables:** responsive UI using real API data or clearly labeled fixtures; loading/error/empty states; no fake success; primary journey checklist.

### Person 2 — Backend, database, activity marketplace, matching
**Owns:** Express/Mongoose architecture and conventions; Activity model/search/filters/pagination/serializers; create/edit/publish/cancel rules; join requests and organizer decisions; atomic capacity protection; interest requests; deterministic matching; proposal lifecycle and duplicate/reuse protection; My Plans endpoint; report/block persistence integration; database indexes and API integration tests.

**Coordinates with:** Person 3 on auth/session identity and notification side effects; Person 1 on endpoint contracts; Person 4 on integration and tests. Always derive organizer/user identity from authenticated server context, not request body IDs.

**Deliverables:** tested endpoints/models; state transition rules; capacity concurrency test; seed/reset flow.

### Person 3 — Auth, verification, notifications, sockets, optional AI
**Owns:** register/verify/login/logout/current-user; password hashing, session/cookie settings, auth middleware; token/OTP expiry and rate limiting; onboarding fields in coordination with team; Nodemailer; in-app notification persistence; Web Push if time allows; BullMQ/Redis jobs if available; Socket.IO setup/authorization and chat foundation; optional AI adapter behind a feature flag with validated output/manual fallback.

**Coordinates with:** Person 2 on `req.user`/user ID conventions and shared models; Person 1 on auth and client notification behavior; Person 4 on integration checks. Optional services must not break core flows.

**Deliverables:** auth/session tests; notification delivery/fallback behavior; environment variable documentation.

### Person 4 — Integration, QA, safety, docs, deployment
**Owns:** API contract/task/architecture docs with team approval; integration branch and merge coordination; end-to-end test plan; seed/reset instructions; responsive smoke tests; deployment/environment config and health check; privacy/security checklist; report/block review; demo script and known limitations.

**Coordinates with:** all owners; proposes contract changes rather than silently changing them; verifies flows end-to-end rather than relying only on unit tests.

**Deliverables:** clean-clone setup instructions; real test commands/results; known-issues list; demo runbook and deployment if in scope.

### Team rules
- One shared API contract is the source of truth.
- Agree on field names, statuses, error format, and auth behavior before parallel work.
- Use feature branches and small commits.
- Do not copy one teammate's whole branch over another's.
- Never commit `.env`, passwords, SMTP credentials, session secrets, or VAPID private keys.
- Mark unimplemented features honestly.
- Before merging, inspect diffs and Git status and run tests from a clean checkout.

## 13. Priority plan

### P0 — Must work
1. Auth/session baseline.
2. Basic onboarding and preferences.
3. Manual/current location selection and 3 km default.
4. Activity discovery/detail/create/edit/publish/cancel.
5. Join request and organizer approve/reject.
6. Duplicate prevention and atomic capacity.
7. Interest request + deterministic matching + proposal review.
8. My Plans with truthful statuses.
9. Persisted in-app notifications.
10. Responsive UI, seed/reset, and end-to-end smoke tests.

### P1 — Only after P0 is stable
- Email verification/transactional mail if not already complete.
- Leaflet map interaction.
- Web Push.
- BullMQ/Redis retry jobs.
- Socket.IO chat/live updates.
- Expanded report/block moderation UI.

### P2 — Later
- AI-assisted planning; advanced ranking; recurring events; calendar integration; analytics; native apps.

## 14. Acceptance checklist

### Auth
- [ ] Invalid inputs return safe validation errors.
- [ ] Passwords are hashed and never returned.
- [ ] Verification expires and cannot be reused.
- [ ] Login survives refresh; logout invalidates session.
- [ ] Protected endpoints reject missing/expired sessions.

### Discovery and activities
- [ ] Discovery shows eligible published future activities only.
- [ ] Default radius is 3 km; changing it changes results.
- [ ] Manual location works if browser permission is denied.
- [ ] Public responses omit private contact data and precise private location.
- [ ] Only organizer can edit/publish/cancel their activity.
- [ ] Invalid dates, capacity, budgets, and state transitions are rejected.

### Join and matching
- [ ] Duplicate active join requests are blocked.
- [ ] Full/cancelled activities reject requests.
- [ ] Only organizer can approve/reject.
- [ ] Concurrent approvals cannot exceed capacity.
- [ ] Hard matching constraints cannot be overridden by scores.
- [ ] No self-match; expired/withdrawn requests are excluded.
- [ ] Match reasons use actual data.
- [ ] Proposals do not auto-publish or confirm attendance.
- [ ] A request cannot be reused in conflicting active proposals.

### Notifications, safety, release
- [ ] In-app notification persists when push is disabled.
- [ ] Push/email failure does not roll back a successful core action.
- [ ] Retries do not duplicate notifications.
- [ ] Socket events enforce authorization.
- [ ] Reports/blocks persist and follow documented behavior.
- [ ] App works without AI and without location permission.
- [ ] Setup and seed/reset instructions work from a clean clone.
- [ ] Test results are reported with actual commands and outputs.

## 15. Environment variables

Keep `.env.example` placeholders only. Example names (adapt to implementation):

```dotenv
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/meetup_pulse
SESSION_SECRET=replace-with-long-random-secret
CLIENT_ORIGIN=http://localhost:5173
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@example.com
REDIS_URL=
AI_PROVIDER_API_KEY=
```

Validate required environment variables at startup and clearly identify optional integrations. Never commit real secrets.

## 16. Open decisions

1. Is phone number required, optional, or out of MVP?
2. Is gender needed at all? If collected, can users skip it and choose “prefer not to say”?
3. What minimum age and age-verification approach are appropriate?
4. Is email verification via link or OTP for this sprint?
5. Are activities approval-required by default?
6. When can participants see exact meeting location?
7. Is chat P0 or P1? Recommended: P1 after core activity flow.
8. Is Web Push P0 or P1? Recommended: P1; in-app notifications are P0.
9. Is Redis available in the demo environment?
10. Does “mad-leaflet” mean React Leaflet?
11. Will AI be shown in the demo? Recommended: optional, deterministic fallback first.
12. Reconcile status enums and response envelopes with the existing `API_CONTRACT.md`.

## 17. Instructions for AI coding agents

1. Read `AGENTS.md`, this PRD, `API_CONTRACT.md`, `TASKS.md`, and `README.md` before edits.
2. Inspect current branch, `git status`, recent commits, and relevant files first.
3. Never discard, overwrite, reset, or rebase existing work without explicit approval.
4. Preserve both teammates' work; do not replace a branch wholesale.
5. If documents conflict, report the conflict and ask rather than silently inventing behavior.
6. Make small, focused changes and list changed files.
7. Add tests for business rules, authorization, state transitions, and errors.
8. Report exact test commands and actual results; never claim tests passed if they were not run.
9. Keep secrets out of code, logs, tests, and docs.
10. Do not add optional dependencies without need; document new environment variables.
11. Keep core functionality working without AI, push, Redis, email, or Socket.IO.
12. Never auto-publish an activity or confirm attendance from an AI/match result.
13. Do not expose private user data or exact location without authorization.
14. Before commit, inspect diff/status/tests; do not commit or push unless explicitly requested.
15. Finish with a summary, changed files, tests run, limitations, and next task.

## 18. Recommended implementation sequence

1. Reconcile this PRD with the existing project spec and API contract.
2. Verify the integration branch/merge state and preserve backups.
3. Finish and test the shared app/auth/activity foundation.
4. Lock API schemas and shared status enums with the team.
5. Complete activity discovery and lifecycle.
6. Complete join requests, organizer decisions, and capacity protection.
7. Add interest requests, deterministic matching, and proposal workflow.
8. Add My Plans and persisted in-app notifications.
9. Integrate the responsive frontend and seed/demo flow.
10. Run end-to-end tests and rehearse from a clean clone.
11. Add P1 map, email, push, queue, and chat only after P0 is reliable.
12. Prepare the demo and document limitations.

---

## Final definition

**MEETUP Pulse is a privacy-conscious, location-aware activity marketplace that helps users discover, organize, and join real-world activities.** It uses a 3 km default discovery radius, supports custom search locations and preferences, requires explicit participation decisions, and offers deterministic demand matching when no existing activity fits. Chat and notifications help people coordinate, while optional integrations must never compromise the core flow or user privacy.
