# MEETUP Pulse — REST API Contract (Working Draft)

**Version:** 0.1-draft  
**Status:** Provisional Working Draft — Pending Project-Owner & Team Confirmation  
**Primary Specification:** [MEETUP_Pulse_PRD.md](../MEETUP_Pulse_PRD.md)  
**Canonical Repository:** `https://github.com/Aryan544-arch/meet-pulse-2.git`  

> [!IMPORTANT]
> **Notice to Team Members (Persons 1, 3, 4):**  
> This document represents the provisional API contract draft for MEETUP Pulse. All Phase 1–5 endpoints reflect **empirically verified backend behavior** supported by 117 automated unit, route, and live concurrency tests. Proposed endpoints reflect PRD requirements and require formal project-owner confirmation before final locking.

---

## 1. Global Conventions & Architecture

### 1.1 Base URL
All API endpoints are mounted under the `/api` prefix:
```text
http://localhost:3000/api
```

### 1.2 Standard Response Envelopes
Every endpoint in the system communicates using a standardized JSON response envelope.

#### Success Envelope (`2xx`)
Single-resource endpoints return `{ "success": true, "data": { ... } }`.
Paginated collection endpoints nest both the entity list and pagination metadata inside `data`:
```json
{
  "success": true,
  "data": {
    "items": [ ... ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "totalPages": 3,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```
*Note: The top-level response contains strictly `success` and `data` (or `error`). The `pagination` block is nested inside `data` on collection endpoints.*

#### Error Envelope (`4xx`, `5xx`)
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE_STRING",
    "message": "Human-readable explanation of the error",
    "details": null
  }
}
```
*When request payload validation fails via Zod, `details` contains an array of `{ path: "fieldName", message: "Error description" }`.*

### 1.3 Standard Error Codes Table
| Error Code | HTTP Status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request body, query parameter, or route parameter failed Zod validation |
| `INVALID_JSON` | 400 | Malformed JSON in HTTP request body |
| `INVALID_ID` | 400 | Route parameter is not a valid 24-character hexadecimal MongoDB ObjectId |
| `INVALID_STATE_TRANSITION` | 400 | Requested lifecycle transition is illegal from current entity status |
| `COORDINATES_REQUIRED` | 400 | Search radius specified without providing `lat` and `lng` coordinates |
| `SELF_APPROVAL_FORBIDDEN` | 400 | Organizer attempted to approve their own join request |
| `ORGANIZER_CANNOT_JOIN` | 400 | Organizer attempted to submit a join request to their own activity |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication session; login required |
| `FORBIDDEN` | 403 | User authenticated, but lacks ownership or permission for the resource |
| `NOT_FOUND` | 404 | Unknown route path |
| `ACTIVITY_NOT_FOUND` | 404 | Activity document with the specified ID does not exist |
| `JOIN_REQUEST_NOT_FOUND` | 404 | JoinRequest document with the specified ID does not exist |
| `ACTIVITY_FULL` | 409 | Cannot join or approve request: activity capacity limit reached |
| `DUPLICATE_JOIN_REQUEST` | 409 | User already has an active (pending or approved) join request for this activity |
| `INTERNAL_SERVER_ERROR` | 500 | Unhandled server error |

---

## 2. Shared Integration Contracts

### 2.1 Authentication & Session Contract (Persons 1, 2, 3)
- **Verified Route Contract (`req.user.id`):**
  - All protected backend services, controllers, and route middleware standardizes on `req.user.id` (String representation of user ObjectId).
  - Backward compatibility: The backend helper `getAuthUserId(req)` in `src/middleware/auth.integration.js` inspects `req.user.id` first, falling back to `req.user._id`.
  - Rejection: Protected routes reject requests missing both `id` and `_id` with HTTP 401 `UNAUTHORIZED`.
  - Ownership Derivation: Protected write operations derive `organizerId` and `userId` strictly from the server session context, never from client-supplied request bodies.
- **Unverified Production Session Mechanics (Awaiting Person 3):**
  - Session Transport: HTTP-only, secure, `SameSite=Lax` (or `None` with HTTPS) session cookie (`connect.sid`).
  - Session Store: Persistent session store (e.g. `connect-mongo`) configured in Express before route handlers.
  - *Status:* **Unverified in production.** Automated backend tests currently inject route-level authentication middleware or mock `req.user`. End-to-end cookie persistence across browser refresh and login/logout routes are awaiting Person 3's implementation.
- **Frontend Requirement (Person 1):**
  - Axios and browser fetch calls must set `withCredentials: true` (`credentials: 'include'`) on all requests to ensure session cookies are passed across origins.
  - Express CORS is configured to allow `CLIENT_ORIGIN` (default `http://localhost:5173`) with `credentials: true`.

### 2.2 Shared User Model Contract (Persons 2 & 3)
- **Model Name:** `'User'`
- **Public Profile Attributes:**
  - `_id`: MongoDB ObjectId
  - `displayName`: String (required public display name)
- **Private Profile Attributes (NEVER exposed in activity/marketplace endpoints):**
  - `email`, `passwordHash`, `phoneNumber`, `gender`, session tokens.
- **Population:** `JoinRequest` queries populate applicant info as `userId: '_id displayName'`.

### 2.3 Location Privacy Contract
The platform enforces a strict three-tier location privacy model (PRD §5, §10):
1. **City/Area-Based Discovery by Default:**
   - Public discovery (`GET /api/activities`) and public detail views (`GET /api/activities/:id` for non-organizers) rely on coarse location descriptions via `displayArea` (e.g. "Central Park - Cherry Walk Entrance" or "Downtown Waterfront").
   - When geospatial search parameters (`lat`, `lng`, `radiusKm`) are provided, the server calculates proximity and returns `approximateDistanceMeters` without revealing exact coordinates.
2. **Strict Redaction of Precise Coordinates:**
   - Under no circumstance are exact latitude/longitude coordinates exposed in public discovery cards or unauthenticated responses.
   - The serializer strictly outputs `location: { type: "Point", coordinates: null, isPrecise: false }`.
3. **Opt-in Precise Location Sharing for Specific Activities:**
   - An activity's exact meeting coordinates (`location.coordinates: [lng, lat]`) are stored upon creation, but their disclosure is an opt-in privilege restricted strictly to authorized roles for that specific activity:
     - **Currently Implemented:** Only the activity organizer receives precise coordinates (`isPrecise: true`).
     - **Proposed Opt-in Rule (Awaiting Team Review):** For activities with `approvalRequired: true`, should confirmed participants whose join requests are in `status: 'approved'` also receive opt-in access to precise meeting coordinates? (PRD Open Decision 6).

### 2.4 Standalone MongoDB Limitation & Production Concurrency Safety
> [!CAUTION]
> **Explicit Database Consistency Limitation:**
> - **Local Topology:** Probing the running MongoDB instance on port 27017 confirmed it is a **Standalone `mongod`** (topology `isWritablePrimary: true`, `setName: undefined`).
> - **Transaction Rejection:** Standalone MongoDB instances strictly reject multi-document transactions with `MongoServerError: Transaction numbers are only allowed on a replica set member or mongos` (code 20, `IllegalOperation`).
> - **Current Implementation:** Phase 4 implements document-level atomic conditional updates (`Activity.findOneAndUpdate` with `$expr: { $lt: ['$placesFilled', '$capacity'] }`) paired with atomic status transitions (`JoinRequest.findOneAndUpdate`) and compensating writes (`Activity.updateOne({ $inc: { placesFilled: -1 } })`).
> - **Why Compensating Writes are NOT Equivalent to ACID Transactions:**
>   1. *Lack of Isolation (Dirty Read Risk):* Between the initial capacity increment and the subsequent join request transition, concurrent queries observe `placesFilled` in a temporarily incremented state.
>   2. *Rollback Failure (Lack of Crash Atomicity):* If the Node process crashes, a network drop occurs, or MongoDB fails *during or before* the compensating write, the capacity increment remains permanently orphaned (`placesFilled` overcounted by 1) without automatic database rollback.
> - **Production Requirement:** Staging and production deployments MUST require a **MongoDB Replica Set** (e.g., MongoDB Atlas or 3-node cluster). On a replica set, multi-document transactions (`session.withTransaction`) ensure that `Activity.placesFilled` and `JoinRequest.status` changes commit or abort as a single atomic unit.

### 2.5 In-App Notification Integration Status (Person 3)
- **Implemented in Service Code:** Explicit code comment hooks (`/** HANDOFF TO PERSON 3 **/`) are placed at all key state transition points:
  1. `POST /api/activities/:id/cancel` $\rightarrow$ Notify approved participants of cancellation.
  2. `POST /api/activities/:id/join` $\rightarrow$ Notify organizer of new join request.
  3. `PATCH /api/join-requests/:id` (approved) $\rightarrow$ Notify applicant of approval.
  4. `PATCH /api/join-requests/:id` (rejected) $\rightarrow$ Notify applicant of rejection.
  5. `POST /api/join-requests/:id/cancel` (approved attendee leaves) $\rightarrow$ Notify organizer of attendee departure.
- **Status:** **Proposed / Unimplemented.** No notification models, database records, Nodemailer emails, Web Push messages, or Socket.IO events are currently created or dispatched. This subsystem is owned by Person 3.


---

## 3. Endpoints Matrix Overview

| Method | Path | Auth | Status | Owner |
|---|---|---|---|---|
| `GET` | `/api/health` | None | **Implemented** | Person 2 |
| `GET` | `/api/activities` | Optional | **Implemented** | Person 2 |
| `POST` | `/api/activities` | Required | **Implemented** | Person 2 |
| `GET` | `/api/activities/:id` | Optional | **Implemented** | Person 2 |
| `PATCH` | `/api/activities/:id` | Required | **Implemented** | Person 2 |
| `POST` | `/api/activities/:id/publish` | Required | **Implemented** | Person 2 |
| `POST` | `/api/activities/:id/cancel` | Required | **Implemented** | Person 2 |
| `POST` | `/api/activities/:id/join` | Required | **Implemented** | Person 2 |
| `GET` | `/api/activities/:id/requests` | Required | **Implemented** | Person 2 |
| `PATCH` | `/api/join-requests/:id` | Required | **Implemented** | Person 2 |
| `POST` | `/api/join-requests/:id/cancel` | Required | **Implemented** | Person 2 |
| `POST` | `/api/interest-requests` | Required | **Implemented** | Person 2 (Phase 5) |
| `GET` | `/api/interest-requests` | Required | **Implemented** | Person 2 (Phase 5) |
| `GET` | `/api/interest-requests/:id` | Required | **Implemented** | Person 2 (Phase 5) |
| `PATCH` | `/api/interest-requests/:id` | Required | **Implemented** | Person 2 (Phase 5) |
| `POST` | `/api/interest-requests/:id/cancel` | Required | **Implemented** | Person 2 (Phase 5) |
| `GET` | `/api/interest-requests/:id/matches` | Required | **Implemented** | Person 2 (Phase 5) |
| `GET` | `/api/interest-requests/matches` | Required | **Implemented** | Person 2 (Phase 5) |
| `POST` | `/api/interest-requests/:id/proposals` | Required | **Implemented** | Person 2 (Phase 5) |
| `GET` | `/api/proposals` | Required | **Implemented** | Person 2 (Phase 5) |
| `GET` | `/api/proposals/:id` | Required | **Implemented** | Person 2 (Phase 5) |
| `PATCH` | `/api/proposals/:id` | Required | **Implemented** | Person 2 (Phase 5) |
| `POST` | `/api/proposals/:id/cancel` | Required | **Implemented** | Person 2 (Phase 5) |
| `GET` | `/api/me/plans` | Required | **Implemented** (Verified) | Person 2 (Phase 6) |
| `POST` | `/api/auth/register` | None | **Implemented** (Verified) | Person 3 |
| `POST` | `/api/auth/verify-email` | None | **Proposed** (P1) | Person 3 |
| `POST` | `/api/auth/login` | None | **Implemented** (Verified) | Person 3 |
| `POST` | `/api/auth/logout` | Required | **Implemented** (Verified) | Person 3 |
| `GET` | `/api/auth/me` | Required | **Implemented** (Verified) | Person 3 |
| `PATCH` | `/api/me/profile` | Required | **Implemented** (Verified) | Person 2 (Phase 7) |
| `GET/PATCH` | `/api/me/preferences` | Required | **Implemented** (Verified) | Person 2 (Phase 7) |
| `GET` | `/api/notifications` | Required | **Implemented** (Verified) | Person 2 (Phase 7) |
| `PATCH` | `/api/notifications/:id/read` | Required | **Implemented** (Verified) | Person 2 (Phase 7) |
| `PATCH` | `/api/notifications/read-all` | Required | **Implemented** (Verified) | Person 2 (Phase 7) |
| `POST` | `/api/reports` | Required | **Implemented** (Verified) | Person 2 (Phase 7) |
| `POST` | `/api/blocks` | Required | **Implemented** (Verified) | Person 2 (Phase 7) |
| `GET` | `/api/blocks` | Required | **Implemented** (Verified) | Person 2 (Phase 7) |
| `DELETE` | `/api/blocks/:userId` | Required | **Implemented** (Verified) | Person 2 (Phase 7) |
| `POST` | `/api/push/subscribe` | Required | **Proposed** (P1) | Person 3 |
| `DELETE` | `/api/push/subscribe` | Required | **Proposed** (P1) | Person 3 |

---

## 4. Phase 1–4 Implemented Endpoints (Verified Behavior)

### 4.1 `GET /api/health`
- **Status:** **Implemented** (Verified)
- **Auth:** None (Public)
- **Description:** Returns server uptime and database readiness state.
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "status": "ok",
      "service": "meetup-pulse-api",
      "timestamp": "2026-10-10T22:00:00.000Z",
      "uptimeSeconds": 124,
      "database": {
        "status": "connected",
        "readyState": 1
      }
    }
  }
  ```
- **Degraded Response (`200 OK`):** Returns `"status": "degraded"` when MongoDB is disconnected.

---

### 4.2 `GET /api/activities`
- **Status:** **Implemented** (Verified)
- **Auth:** Optional (`optionalAuth`)
- **Description:** Discovers upcoming published activities filtered by location radius, category, skill level, budget, and dates.
- **Query Parameters:**
  | Parameter | Type | Required | Default | Validation Rules |
  |---|---|---|---|---|
  | `lat` | Number | Optional* | — | Between -90 and 90 (*must be provided with `lng`*) |
  | `lng` | Number | Optional* | — | Between -180 and 180 (*must be provided with `lat`*) |
  | `radiusKm` | Number | Optional | 3 | Positive number, maximum 100 km |
  | `category` | String | Optional | — | One of: `outdoor`, `sports`, `fitness`, `social`, `nature`, `gaming`, `wellness`, `arts`, `other` |
  | `skillLevel` | String | Optional | — | One of: `beginner`, `intermediate`, `advanced`, `all-levels` |
  | `maxBudget` | Number | Optional | — | Non-negative number |
  | `startDate` | ISO Date | Optional | — | Valid ISO 8601 string |
  | `endDate` | ISO Date | Optional | — | At or after `startDate` |
  | `page` | Integer | Optional | 1 | Minimum 1 |
  | `limit` | Integer | Optional | 20 | Minimum 1, Maximum 100 |
- **Search Parameter Note:** Keyword/text search query parameters (`query`, `search`, `text`) are **not implemented** in the backend validator. Discovery filtering is strictly geospatial (`lat`, `lng`, `radiusKm`), categorical (`category`), skill level (`skillLevel`), budget (`maxBudget`), and dates (`startDate`, `endDate`). Unrecognized query parameters are stripped.
- **Privacy Rule:** Exact coordinates are omitted for non-organizers (`location.coordinates: null`, `isPrecise: false`).
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "activities": [
        {
          "_id": "67083abf99d63f45778899aa",
          "title": "Sunset Trail Run",
          "description": "5 km relaxed trail run through Riverside Park.",
          "category": "outdoor",
          "organizerId": "67083abf99d63f45778899bb",
          "startsAt": "2026-10-15T18:00:00.000Z",
          "endsAt": "2026-10-15T19:30:00.000Z",
          "displayArea": "Riverside Park, Cherry Walk entrance",
          "location": {
            "type": "Point",
            "coordinates": null,
            "isPrecise": false
          },
          "budget": 0,
          "skillLevel": "all-levels",
          "capacity": 15,
          "placesFilled": 4,
          "placesRemaining": 11,
          "isFull": false,
          "approvalRequired": true,
          "status": "published",
          "createdAt": "2026-10-10T14:00:00.000Z",
          "updatedAt": "2026-10-10T14:00:00.000Z"
        }
      ],
      "pagination": {
        "page": 1,
        "limit": 20,
        "total": 1,
        "totalPages": 1,
        "hasNextPage": false,
        "hasPrevPage": false
      },
      "search": {
        "locationApplied": true,
        "radiusKm": 3,
        "center": [-73.97, 40.77]
      }
    }
  }
  ```
- **Error Codes:**
  - `400 VALIDATION_ERROR`: Missing paired coordinate (`lat` without `lng` or vice versa) or out-of-bound dates/pagination.
  - `400 COORDINATES_REQUIRED`: `radiusKm` provided without `lat`/`lng`.

---

### 4.3 `POST /api/activities`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Creates an activity in `draft` status. Organizer ID is derived exclusively from session.
- **Request Body (JSON):**
  ```json
  {
    "title": "Saturday Morning Kayaking",
    "description": "Paddle along the Hudson River. Beginners welcome!",
    "category": "sports",
    "startsAt": "2026-10-20T09:00:00.000Z",
    "endsAt": "2026-10-20T11:00:00.000Z",
    "location": {
      "type": "Point",
      "coordinates": [-73.998, 40.755]
    },
    "displayArea": "Pier 84 Boathouse",
    "budget": 20,
    "skillLevel": "all-levels",
    "capacity": 10,
    "approvalRequired": true
  }
  ```
- **Validation Rules:**
  - `title`: 3–120 characters, trimmed.
  - `description`: 10–2000 characters, trimmed.
  - `category`: Must match allowed enums.
  - `startsAt` & `endsAt`: `endsAt` must be strictly after `startsAt`.
  - `location.coordinates`: Strict `[longitude (-180..180), latitude (-90..90)]`.
  - `capacity`: Integer between 1 and 1000.
  - Protected fields forbidden in payload: `organizerId`, `status`, `placesFilled`, `_id`.
- **Success Response (`201 Created`):**
  ```json
  {
    "success": true,
    "data": {
      "_id": "67083abf99d63f45778899cc",
      "title": "Saturday Morning Kayaking",
      "status": "draft",
      "organizerId": "67083abf99d63f45778899bb",
      "placesFilled": 0,
      "placesRemaining": 10,
      "isFull": false,
      ...
    }
  }
  ```
- **Error Codes:**
  - `400 VALIDATION_ERROR`: Missing fields, protected field injection, or invalid format.
  - `401 UNAUTHORIZED`: Missing active session.

---

### 4.4 `GET /api/activities/:id`
- **Status:** **Implemented** (Verified)
- **Auth:** Optional (`optionalAuth`)
- **Description:** Retrieves activity details. Unmasks precise coordinates if requester is the organizer.
- **Location Policy (Demo Baseline):** Exact coordinates are organizer-only (`isPrecise: true`). All other callers (guests, pending requesters, and confirmed attendees) receive general area only (`location.coordinates: null`, `isPrecise: false`). Frontend map/detail components must check `if (activity.location?.coordinates)` before mounting map pins and display `displayArea` as fallback.
- **Parameters:** `id` (24-character hexadecimal MongoDB ObjectId).
- **Success Response (`200 OK` — Public Viewer):**
  ```json
  {
    "success": true,
    "data": {
      "_id": "67083abf99d63f45778899cc",
      "title": "Saturday Morning Kayaking",
      "location": {
        "type": "Point",
        "coordinates": null,
        "isPrecise": false
      },
      "displayArea": "Pier 84 Boathouse",
      "capacity": 10,
      "placesFilled": 0,
      "status": "draft"
    }
  }
  ```
- **Success Response (`200 OK` — Organizer):**
  ```json
  {
    "success": true,
    "data": {
      "_id": "67083abf99d63f45778899cc",
      "location": {
        "type": "Point",
        "coordinates": [-73.998, 40.755],
        "isPrecise": true
      }
    }
  }
  ```
- **Error Codes:**
  - `400 INVALID_ID`: Malformed ID parameter.
  - `404 ACTIVITY_NOT_FOUND`: Activity does not exist.

---

### 4.5 `PATCH /api/activities/:id`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Updates permitted activity fields. Enforces organizer ownership.
- **Request Body:** Partial payload of permitted fields (`title`, `description`, `category`, `startsAt`, `endsAt`, `location`, `displayArea`, `budget`, `skillLevel`, `capacity`, `approvalRequired`).
- **Protected Fields Rejected:** `status`, `placesFilled`, `organizerId`.
- **Success Response (`200 OK`):** Returns updated serialized activity document.
- **Error Codes:**
  - `400 VALIDATION_ERROR`: Empty payload or validation rule failure.
  - `401 UNAUTHORIZED`: Missing session.
  - `403 FORBIDDEN`: Authenticated user is not the activity organizer.
  - `404 ACTIVITY_NOT_FOUND`: Activity not found.

---

### 4.6 `POST /api/activities/:id/publish`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Explicitly publishes a draft activity.
- **Requirements:**
  - Activity must currently be in `draft` status.
  - `startsAt` must be in the future (`> Date.now()`).
  - Authenticated user must be the organizer.
- **Success Response (`200 OK`):** Returns activity with `"status": "published"`.
- **Error Codes:**
  - `400 INVALID_STATE_TRANSITION`: Activity is not in `draft` status or start time has passed.
  - `401 UNAUTHORIZED`: Missing session.
  - `403 FORBIDDEN`: User is not the organizer.
  - `404 ACTIVITY_NOT_FOUND`: Activity not found.

---

### 4.7 `POST /api/activities/:id/cancel`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Cancels an activity.
- **Requirements:**
  - Activity must not already be in `cancelled` or `completed` status.
  - Authenticated user must be the organizer.
- **Side Effects:** Triggers notification hook to notify approved participants.
- **Success Response (`200 OK`):** Returns activity with `"status": "cancelled"`.
- **Error Codes:**
  - `400 INVALID_STATE_TRANSITION`: Already cancelled or completed.
  - `401 UNAUTHORIZED`: Missing session.
  - `403 FORBIDDEN`: User is not the organizer.
  - `404 ACTIVITY_NOT_FOUND`: Activity not found.

---

### 4.8 `POST /api/activities/:id/join`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Submits a join request for a published activity.
- **Request Body (JSON, Optional):**
  ```json
  {
    "note": "Looking forward to meeting everyone! (Max 500 chars)"
  }
  ```
- **Business Rules Enforced:**
  - Activity must have `status: 'published'`.
  - Activity `startsAt` must be in the future.
  - Activity must have places remaining (`placesFilled < capacity`).
  - Organizer cannot request to join their own activity (`ORGANIZER_CANNOT_JOIN`).
  - Applicant cannot have an existing active request (`pending` or `approved`) for this activity (`DUPLICATE_JOIN_REQUEST`, backed by compound partial unique index).
- **Success Response (`201 Created`):**
  ```json
  {
    "success": true,
    "data": {
      "_id": "67083abf99d63f45778899dd",
      "activityId": "67083abf99d63f45778899cc",
      "userId": "67083abf99d63f45778899ee",
      "status": "pending",
      "note": "Looking forward to meeting everyone!",
      "createdAt": "2026-10-10T22:30:00.000Z",
      "updatedAt": "2026-10-10T22:30:00.000Z"
    }
  }
  ```
- **Error Codes:**
  - `400 ORGANIZER_CANNOT_JOIN`: Organizer requested to join own activity.
  - `400 INVALID_STATE_TRANSITION`: Activity is unpublished or past its start time.
  - `401 UNAUTHORIZED`: Missing session.
  - `404 ACTIVITY_NOT_FOUND`: Activity not found.
  - `409 ACTIVITY_FULL`: Activity is already at capacity.
  - `409 DUPLICATE_JOIN_REQUEST`: Active join request already exists.

---

### 4.9 `GET /api/activities/:id/requests`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Lists all join requests for an activity. Organizer only.
- **Query Parameters:**
  | Parameter | Type | Default | Description |
  |---|---|---|---|
  | `status` | String | — | Optional filter: `pending`, `approved`, `rejected`, `cancelled` |
  | `page` | Integer | 1 | Page number |
  | `limit` | Integer | 20 | Results per page (max 100) |
- **Privacy Rule:** Populates applicant summary with public fields only (`userId: '_id displayName'`).
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "requests": [
        {
          "_id": "67083abf99d63f45778899dd",
          "activityId": "67083abf99d63f45778899cc",
          "userId": {
            "_id": "67083abf99d63f45778899ee",
            "displayName": "Alex Rivers"
          },
          "status": "pending",
          "note": "Looking forward to meeting everyone!",
          "createdAt": "2026-10-10T22:30:00.000Z"
        }
      ],
      "pagination": {
        "page": 1,
        "limit": 20,
        "total": 1,
        "totalPages": 1,
        "hasNextPage": false,
        "hasPrevPage": false
      }
    }
  }
  ```
- **Error Codes:**
  - `401 UNAUTHORIZED`: Missing session.
  - `403 FORBIDDEN`: User is not the activity organizer.
  - `404 ACTIVITY_NOT_FOUND`: Activity not found.

---

### 4.10 `PATCH /api/join-requests/:id`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Organizer approves or rejects a pending join request.
- **Request Body (JSON):**
  ```json
  {
    "status": "approved" // or "rejected"
  }
  ```
- **Business Rules Enforced:**
  - Authenticated user must be the organizer of the activity associated with the request (`FORBIDDEN`).
  - Request must currently be in `pending` status (`INVALID_STATE_TRANSITION`).
  - Organizer cannot self-approve (`SELF_APPROVAL_FORBIDDEN`).
  - Approval executes conditional atomic capacity check `$expr: { $lt: ['$placesFilled', '$capacity'] }`. Rejects with `ACTIVITY_FULL` (409) if no space remains.
  - If request update throws or request was concurrently modified, issues compensating decrement on activity.
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "_id": "67083abf99d63f45778899dd",
      "activityId": "67083abf99d63f45778899cc",
      "userId": "67083abf99d63f45778899ee",
      "status": "approved",
      "updatedAt": "2026-10-10T22:35:00.000Z"
    }
  }
  ```
- **Error Codes:**
  - `400 VALIDATION_ERROR`: Status is not `'approved'` or `'rejected'`.
  - `400 SELF_APPROVAL_FORBIDDEN`: Organizer approving own request.
  - `400 INVALID_STATE_TRANSITION`: Request is already approved, rejected, or cancelled.
  - `401 UNAUTHORIZED`: Missing session.
  - `403 FORBIDDEN`: User is not the activity organizer.
  - `404 JOIN_REQUEST_NOT_FOUND`: Join request not found.
  - `409 ACTIVITY_FULL`: Activity reached capacity.

---

### 4.11 `POST /api/join-requests/:id/cancel`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Applicant cancels their own join request (withdrawing pending request or leaving activity).
- **Request Body (JSON, Optional):**
  ```json
  {
    "reason": "Scheduling conflict (Max 500 chars)"
  }
  ```
- **Business Rules Enforced:**
  - Only the applicant who created the request can cancel it (`FORBIDDEN`).
  - Request must currently be in `pending` or `approved` status.
  - Atomic document transition prevents double-decrement race conditions under simultaneous cancellations.
  - If request was previously `approved`, atomically decrements `placesFilled` on the activity.
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "_id": "67083abf99d63f45778899dd",
      "status": "cancelled",
      "updatedAt": "2026-10-10T22:40:00.000Z"
    }
  }
  ```
- **Error Codes:**
  - `400 INVALID_STATE_TRANSITION`: Request is already cancelled or rejected.
  - `401 UNAUTHORIZED`: Missing session.
  - `403 FORBIDDEN`: User is not the applicant.
  - `404 JOIN_REQUEST_NOT_FOUND`: Request not found.

---

## 5. Phase 5 Contract: Interest Requests, Deterministic Matching, and Proposals

> [!NOTE]
> **Implementation State:** All endpoints in Section 5 are **Implemented** and verified by 37 automated tests (including 4 real MongoDB concurrency tests and 5 failure injection recovery tests).

---

### 5.1 Interest Request Endpoints

#### 5.1.1 `POST /api/interest-requests`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Creates an interest request when no existing activity fits.
- **Request Body (JSON):**
  ```json
  {
    "category": "outdoor",
    "title": "Weekend Hiking Group",
    "timeStart": "2026-10-25T08:00:00.000Z",
    "timeEnd": "2026-10-25T14:00:00.000Z",
    "location": {
      "type": "Point",
      "coordinates": [-73.968, 40.785]
    },
    "displayArea": "Central Park / North Woods",
    "radiusKm": 5,
    "maxBudget": 0,
    "skillLevel": "all-levels",
    "groupSize": 4,
    "expiry": "2026-10-25T08:00:00.000Z"
  }
  ```
- **Validation Rules:**
  - `category`: Must match allowed enums (`ACTIVITY_CATEGORIES`).
  - `timeStart` & `timeEnd`: `timeEnd` must be strictly after `timeStart`. Both must be in the future (`> Date.now()`).
  - `location.coordinates`: Strict `[longitude (-180..180), latitude (-90..90)]`.
  - `displayArea`: 2–200 characters, trimmed.
  - `radiusKm`: Number between 0.5 and 100, default 3 km.
  - `maxBudget`: Non-negative number, default 0.
  - `skillLevel`: Must match allowed enums (`SKILL_LEVELS`), default `'all-levels'`.
  - `groupSize`: Integer between 2 and 50, default 2.
  - `status`: Derived server-side as `'active'`.
  - Protected fields forbidden in payload: `userId`, `status`, `_id`.
- **Duplicate Prevention:**
  - Enforced at database level via partial unique index on `{ userId: 1, category: 1 }` with `{ partialFilterExpression: { status: 'active' } }`.
  - A user cannot have multiple active requests in the same category simultaneously.
- **Success Response (`201 Created`):**
  ```json
  {
    "success": true,
    "data": {
      "_id": "67083abf99d63f45778899fa",
      "userId": "67083abf99d63f45778899bb",
      "category": "outdoor",
      "title": "Weekend Hiking Group",
      "timeStart": "2026-10-25T08:00:00.000Z",
      "timeEnd": "2026-10-25T14:00:00.000Z",
      "displayArea": "Central Park / North Woods",
      "location": {
        "type": "Point",
        "coordinates": [-73.968, 40.785],
        "isPrecise": true
      },
      "radiusKm": 5,
      "maxBudget": 0,
      "skillLevel": "all-levels",
      "groupSize": 4,
      "status": "active",
      "createdAt": "2026-10-10T23:30:00.000Z"
    }
  }
  ```
- **Error Codes:**
  - `400 VALIDATION_ERROR`: Invalid boundaries, dates in past, or `timeEnd <= timeStart`.
  - `401 UNAUTHORIZED`: Missing active session.
  - `409 DUPLICATE_INTEREST_REQUEST`: Active interest request already exists for this user and category.

---

#### 5.1.2 `GET /api/interest-requests`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Lists all interest requests created by the authenticated user.
- **Query Parameters:** `status` (optional: `active`, `proposed`, `converted`, `withdrawn`, `expired`), `page` (default 1), `limit` (default 20).
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": [ ... ],
    "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1, "hasNextPage": false, "hasPrevPage": false }
  }
  ```

---

#### 5.1.3 `GET /api/interest-requests/:id`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Retrieves interest request details. Exact coordinates unmasked only for request owner.
- **Success Response (`200 OK`):** Serialized request document. Non-owners receive `location.coordinates: null`.
- **Error Codes:**
  - `400 INVALID_ID`: Malformed ObjectId.
  - `401 UNAUTHORIZED`: Missing session.
  - `404 INTEREST_REQUEST_NOT_FOUND`: Not found.

---

#### 5.1.4 `PATCH /api/interest-requests/:id`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Updates an active interest request. Enforces ownership.
- **Permitted Fields:** `title`, `timeStart`, `timeEnd`, `location`, `displayArea`, `radiusKm`, `maxBudget`, `skillLevel`, `groupSize`.
- **Preconditions:** Request must have `status: 'active'`. (Requests in `proposed` or `converted` status cannot be modified).
- **Error Codes:**
  - `400 INVALID_STATE_TRANSITION`: Request is not in `active` status.
  - `403 FORBIDDEN`: User does not own the interest request.

---

#### 5.1.5 `POST /api/interest-requests/:id/cancel`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Withdraws/cancels an active interest request. Enforces ownership.
- **Preconditions:** Must currently be in `active` status.
- **State Transition:** Atomically transitions status to `'withdrawn'`.
- **Success Response (`200 OK`):** Returns request with `"status": "withdrawn"`.
- **Re-creation Rule:** Once withdrawn, the partial unique index allows the user to immediately create a fresh active interest request for the same category.
- **Error Codes:**
  - `400 INVALID_STATE_TRANSITION`: Request is already withdrawn, converted, or proposed.
  - `403 FORBIDDEN`: User does not own the interest request.

---

### 5.2 Deterministic Matching Endpoints

#### 5.2.1 `GET /api/interest-requests/:id/matches`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Returns deterministic match suggestions for a specific active interest request.
- **Authorization:** Only the owner of the source interest request can request its matches.
- **Privacy Rule:** Target matches expose coarse `displayArea` and `approximateDistanceMeters`. Exact coordinates are redacted (`coordinates: null`, `isPrecise: false`).
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "sourceRequest": {
        "_id": "67083abf99d63f45778899fa",
        "category": "outdoor",
        "displayArea": "Central Park / North Woods"
      },
      "matches": [
        {
          "targetRequest": {
            "_id": "67083abf99d63f45778899fb",
            "userId": {
              "_id": "67083abf99d63f45778899aa",
              "displayName": "Jordan Smith"
            },
            "category": "outdoor",
            "timeStart": "2026-10-25T09:00:00.000Z",
            "timeEnd": "2026-10-25T13:00:00.000Z",
            "displayArea": "Upper East Side / Central Park",
            "location": {
              "type": "Point",
              "coordinates": null,
              "isPrecise": false
            },
            "approximateDistanceMeters": 1200,
            "skillLevel": "all-levels",
            "groupSize": 3
          },
          "score": 92,
          "matchReasons": [
            "Exact category match: outdoor",
            "Overlapping time window: 4 hours",
            "Within 1.2 km distance",
            "Compatible skill level: all-levels"
          ]
        }
      ]
    }
  }
  ```

#### 5.2.2 `GET /api/interest-requests/matches`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Convenience endpoint to find matches across all of the authenticated user's active interest requests (or filtered by query `requestId`).

---

### 5.3 Proposal Lifecycle Endpoints

#### 5.3.1 `POST /api/interest-requests/:id/proposals`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Proposer creates an activity proposal targeting a matched interest request.
- **Request Body (JSON):**
  ```json
  {
    "targetRequestId": "67083abf99d63f45778899fb",
    "activityDraft": {
      "title": "Joint Saturday Morning Trail Hike",
      "description": "Matched from our hiking interest requests! Let's do 6 km.",
      "startsAt": "2026-10-25T09:00:00.000Z",
      "endsAt": "2026-10-25T12:00:00.000Z",
      "location": {
        "type": "Point",
        "coordinates": [-73.968, 40.785]
      },
      "displayArea": "North Woods Trailhead",
      "capacity": 2,
      "budget": 0,
      "skillLevel": "all-levels"
    }
  }
  ```
- **Business Rules Enforced:**
  - Source request (`:id`) must belong to authenticated user and be `status: 'active'`.
  - Target request (`targetRequestId`) must exist, be `status: 'active'`, and belong to a different user.
  - Proposer cannot create proposal targeting own request (`SELF_PROPOSAL_FORBIDDEN`).
  - **Atomic Two-Phase Locking:**
    1. Atomically claims target request from `'active'` to `'proposed'` via conditional `findOneAndUpdate`.
    2. Atomically claims source request from `'active'` to `'proposed'` via conditional `findOneAndUpdate`.
    3. If either claim fails, any claim already acquired by this attempt is safely released.
    4. Database partial unique indexes `{ targetRequestId: 1, status: 1 }` and `{ sourceRequestId: 1, status: 1 }` guarantee no request can be in multiple pending proposals concurrently.
  - **Capacity Rules:** Minimum capacity is `1` (permits 1-on-1 private meetups where the single participant spot is filled by the recipient), maximum is `1000`, default is `2`.
- **Success Response (`201 Created`):** Returns created Proposal document.
- **Error Codes:**
  - `400 SELF_PROPOSAL_FORBIDDEN`: Proposing to own request or same request ID.
  - `400 INVALID_STATE_TRANSITION`: Source or target request is not active.
  - `403 FORBIDDEN`: User does not own the source interest request.
  - `409 TARGET_REQUEST_ALREADY_CLAIMED`: Target request is unavailable or already claimed by another proposal.
  - `409 ACTIVE_PROPOSAL_EXISTS`: An active proposal already exists for this interest request.

---

#### 5.3.2 `GET /api/proposals` & `GET /api/proposals/:id`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Lists user's proposals (both sent and received) or views details of a specific proposal.
- **Authorization:** Only the proposer or recipient can access the proposal.

---

#### 5.3.3 `PATCH /api/proposals/:id`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Recipient accepts or rejects a proposal.
- **Request Body (JSON):**
  ```json
  {
    "decision": "accepted" // or "rejected"
  }
  ```
- **Business Rules & State Changes:**
  - **Authorization:** Only the `recipientId` can make a decision (`FORBIDDEN`). Proposer cannot self-accept.
  - **State Precondition:** Proposal must currently be in `pending` status (`INVALID_STATE_TRANSITION`).
  - **Stale Start Time Check:** Proposed `startsAt` must still be in the future (`> Date.now()`) at decision time (`400 INVALID_ACTIVITY_TIME`).
  - **State Invariant Check:** Referenced source and target requests must still be in `status === 'proposed'` (`400 INVALID_STATE_TRANSITION`).
  - **On Acceptance (`decision: 'accepted'`):**
    1. Proposal transitions to `'accepted'`.
    2. Creates a real `Activity` in `status: 'draft'` with:
       - `organizerId = proposal.proposerId`
       - `placesFilled = 1` (confirmed recipient attendee)
       - `capacity = proposal.activityDraft.capacity`
       - If activity save fails, proposal status rolls back to `'pending'`.
    3. Creates a `JoinRequest` for `proposal.recipientId` with:
       - `activityId = newActivity._id`
       - `userId = proposal.recipientId`
       - `status = 'approved'`
       - If join request save fails, created activity is deleted and proposal status rolls back to `'pending'`.
    4. Transitions both source and target interest requests to `status: 'converted'`.
    5. Saves `resultingActivityId` on the proposal document.
  - **On Rejection (`decision: 'rejected'`):**
    1. Proposal transitions to `'rejected'`.
    2. Source and target interest requests are conditionally unlocked back to `status: 'active'` (only matching `{ status: 'proposed' }`).
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "proposal": {
        "_id": "67083abf99d63f45778899fc",
        "status": "accepted",
        "resultingActivityId": "67083abf99d63f45778899fd"
      },
      "activity": {
        "_id": "67083abf99d63f45778899fd",
        "status": "draft",
        "placesFilled": 1,
        "placesRemaining": 1
      }
    }
  }
  ```
- **Error Codes:**
  - `400 VALIDATION_ERROR`: Decision must be `'accepted'` or `'rejected'`.
  - `400 INVALID_ACTIVITY_TIME`: Proposed activity start time has already elapsed.
  - `400 INVALID_STATE_TRANSITION`: Proposal is already accepted, rejected, cancelled, or interest requests are no longer in proposed state.
  - `403 FORBIDDEN`: User is not the proposal recipient.

---

#### 5.3.4 `POST /api/proposals/:id/cancel`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Proposer cancels their pending proposal before the recipient responds.
- **Business Rules:**
  - Only the `proposerId` can cancel the proposal (`FORBIDDEN`).
  - Proposal must be in `pending` status.
  - Proposal transitions to `'cancelled'`.
  - Unlocks source and target interest requests back to `status: 'active'` using conditional queries matching `{ status: 'proposed' }`.
- **Success Response (`200 OK`):** Returns proposal with `"status": "cancelled"`.

---

### 5.4 Lifecycle, Matching Rules, and Concurrency Strategy

#### 5.4.1 Interest Request Lifecycle
```text
               ┌───────────────┐
               │    active     │ ◄─── (Created via POST /api/interest-requests)
               └───────┬───────┘
                       │
       ┌───────────────┼───────────────┬────────────────┐
       ▼               ▼               ▼                ▼
┌──────────────┐ ┌───────────┐ ┌──────────────┐ ┌───────────────┐
│  withdrawn   │ │ proposed  │ │   expired    │ │   converted   │
│ (cancelled)  │ │ (locked)  │ │(time elapsed)│ │(accepted prop)│
└──────────────┘ └─────┬─────┘ └──────────────┘ └───────────────┘
                       │
             ┌─────────┴─────────┐
             ▼ (prop rejected)   ▼ (prop accepted)
          active             converted
```
- **Database Unique Constraint:** Partial index `{ userId: 1, category: 1 }` with `{ status: 'active' }`. Prevents multiple concurrent active requests per category while allowing immediate re-creation upon withdrawal or conversion.

#### 5.4.2 Deterministic MVP Matching Rules
1. **Hard Eligibility Constraints (ALL must be true):**
   - Both requests have `status: 'active'`.
   - Different users: `source.userId !== target.userId`.
   - Future unexpired: `source.timeEnd > now` and `target.timeEnd > now`.
   - Exact category match: `source.category === target.category`.
   - Time window overlap: $\max(\text{source.timeStart}, \text{target.timeStart}) < \min(\text{source.timeEnd}, \text{target.timeEnd})$.
   - Distance constraint: $\text{distanceKm} \le (\text{source.radiusKm} + \text{target.radiusKm})$.
2. **Transparent Scoring Formula (0 to 100):**
   - **Category Base Score:** 40 points (exact category match).
   - **Time Overlap Score (0–30 points):**
     $$\text{OverlapHours} = \frac{\min(\text{source.timeEnd}, \text{target.timeEnd}) - \max(\text{source.timeStart}, \text{target.timeStart})}{3600000}$$
     $$\text{TimeScore} = \min\left(30, \left(\frac{\text{OverlapHours}}{4}\right) \times 30\right)$$
   - **Distance Score (0–20 points):**
     $$\text{MaxAllowedKm} = \text{source.radiusKm} + \text{target.radiusKm}$$
     $$\text{DistanceScore} = \max\left(0, 20 \times \left(1 - \frac{\text{distanceKm}}{\text{MaxAllowedKm}}\right)\right)$$
   - **Skill Level Compatibility (0–10 points):**
     10 points if identical or either is `'all-levels'`; 0 points if divergent.
3. **Deterministic Tie-Breaking:**
   Output is sorted strictly by:
   1. `score` DESC
   2. `overlapHours` DESC
   3. `distanceKm` ASC
   4. `createdAt` ASC
   5. `_id` ASC (guarantees strictly identical ordering for identical input).

#### 5.4.3 Concurrency & Standalone MongoDB Safety
- **Atomic Two-Phase Request Claiming:**
  `createProposal` claims the target interest request first (`findOneAndUpdate({ _id: target, status: 'active' }, { status: 'proposed' })`), followed by claiming the source interest request. If either claim fails, any claim already acquired by this attempt is safely reverted back to `'active'`.
  Simultaneous competing proposals targeting the same request from different users are rejected with HTTP 409 `TARGET_REQUEST_ALREADY_CLAIMED`.
- **Atomic Proposal State Machine:**
  Proposal acceptance and cancellation use conditional atomic document updates (`Proposal.findOneAndUpdate({ _id, status: 'pending' }, { status: 'accepted' | 'cancelled' })`).
  If concurrent calls race to decide or cancel the same proposal, exactly **one** succeeds. The second receives `null` and throws HTTP 400 `INVALID_STATE_TRANSITION`.
- **Guarded Rollbacks & Standalone Topology Limitation:**
  In standalone MongoDB, multi-document transactions cannot run. Creating the `Activity` and `JoinRequest` following proposal acceptance uses guarded sequence ordering and compensating rollbacks:
  1. If `Activity.save()` fails, the `Proposal` status rolls back to `'pending'`.
  2. If `JoinRequest.save()` fails, the created `Activity` is deleted and the `Proposal` status rolls back to `'pending'`.
  3. Interest request conversions and unlocks use conditional queries matching `{ status: 'proposed' }` with retry logic to avoid orphaning locks.
  *Residual Limitation:* A mid-flight Node.js process kill or server crash between document writes on standalone MongoDB cannot be rolled back atomically by the database engine. Replica sets are required if true multi-document transactional rollback across unexpected crashes is demanded.

---

## 6. Phase 6 Contract: My Plans Dashboard API

> [!NOTE]
> **Implementation State:** `GET /api/me/plans` is **Implemented** and verified by 9 automated tests across `tests/plans.service.test.js` and `tests/plans.routes.test.js`.

---

### 6.1 `GET /api/me/plans`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Aggregates a unified view of all user activity and social matching state for the My Plans dashboard (PRD Journey G & FR-13).
- **Query Parameters (Optional):**
  - `limit` (number, default: 50, min: 1, max: 100): Maximum items to return per section.
  - `organizedStatus` (string, optional): Filter organized activities by status (`draft`, `published`, `cancelled`, `completed`).
  - `interestStatus` (string, optional): Filter interest requests by status (`active`, `proposed`).
  - `proposalStatus` (string, optional): Filter proposals by status (`pending`).
- **Response Shape (`200 OK`):**
  Standard JSON envelope with 5 distinct groups + summary count object:
  ```json
  {
    "success": true,
    "data": {
      "organized": [
        {
          "_id": "67083abf99d63f45778899aa",
          "title": "Morning Yoga",
          "description": "Outdoor session",
          "category": "wellness",
          "organizerId": "67083abf99d63f4577889911",
          "status": "published",
          "capacity": 10,
          "placesFilled": 2,
          "startsAt": "2026-10-12T08:00:00.000Z",
          "endsAt": "2026-10-12T09:30:00.000Z",
          "location": {
            "type": "Point",
            "coordinates": [-73.97, 40.77],
            "isPrecise": true
          },
          "displayArea": "Sheep Meadow, Central Park",
          "budget": 0,
          "skillLevel": "all-levels",
          "approvalRequired": true,
          "createdAt": "2026-10-10T12:00:00.000Z",
          "updatedAt": "2026-10-10T12:00:00.000Z"
        }
      ],
      "joined": [
        {
          "requestId": "67083abf99d63f45778899bb",
          "status": "approved",
          "joinedAt": "2026-10-10T14:00:00.000Z",
          "activity": {
            "_id": "67083abf99d63f45778899cc",
            "title": "Trail Run",
            "description": "Trail running in North Woods",
            "category": "outdoor",
            "organizerId": "67083abf99d63f4577889922",
            "status": "published",
            "capacity": 8,
            "placesFilled": 4,
            "startsAt": "2026-10-13T10:00:00.000Z",
            "endsAt": "2026-10-13T12:00:00.000Z",
            "location": {
              "type": "Point",
              "coordinates": null,
              "isPrecise": false
            },
            "displayArea": "North Woods",
            "budget": 0,
            "skillLevel": "all-levels",
            "approvalRequired": true,
            "createdAt": "2026-10-10T10:00:00.000Z",
            "updatedAt": "2026-10-10T10:00:00.000Z"
          }
        }
      ],
      "pendingRequests": [
        {
          "requestId": "67083abf99d63f45778899dd",
          "status": "pending",
          "note": "Looking forward to this!",
          "createdAt": "2026-10-10T15:00:00.000Z",
          "activity": {
            "_id": "67083abf99d63f45778899ee",
            "title": "Kayak Paddle",
            "description": "Hudson River kayaking",
            "category": "outdoor",
            "organizerId": "67083abf99d63f4577889933",
            "status": "published",
            "capacity": 4,
            "placesFilled": 2,
            "startsAt": "2026-10-14T14:00:00.000Z",
            "endsAt": "2026-10-14T16:00:00.000Z",
            "location": {
              "type": "Point",
              "coordinates": null,
              "isPrecise": false
            },
            "displayArea": "Pier 84 Boathouse",
            "budget": 20,
            "skillLevel": "intermediate",
            "approvalRequired": true,
            "createdAt": "2026-10-10T11:00:00.000Z",
            "updatedAt": "2026-10-10T11:00:00.000Z"
          }
        }
      ],
      "interestRequests": [
        {
          "_id": "67083abf99d63f45778899ff",
          "userId": "67083abf99d63f4577889911",
          "category": "outdoor",
          "title": "Trail Run Partner",
          "timeStart": "2026-10-15T09:00:00.000Z",
          "timeEnd": "2026-10-15T11:00:00.000Z",
          "location": {
            "type": "Point",
            "coordinates": [-73.968, 40.785],
            "isPrecise": true
          },
          "displayArea": "Central Park",
          "radiusKm": 5,
          "maxBudget": 0,
          "skillLevel": "all-levels",
          "groupSize": 2,
          "status": "active",
          "createdAt": "2026-10-10T09:00:00.000Z",
          "updatedAt": "2026-10-10T09:00:00.000Z"
        }
      ],
      "proposals": [
        {
          "_id": "67083abf99d63f457788991a",
          "proposerId": "67083abf99d63f4577889911",
          "recipientId": "67083abf99d63f4577889922",
          "sourceRequestId": "67083abf99d63f45778899ff",
          "targetRequestId": "67083abf99d63f457788992b",
          "activityDraft": {
            "title": "Joint Trail Run",
            "description": "Trail run together",
            "category": "outdoor",
            "startsAt": "2026-10-15T09:00:00.000Z",
            "endsAt": "2026-10-15T11:00:00.000Z",
            "location": {
              "type": "Point",
              "coordinates": [-73.968, 40.785]
            },
            "displayArea": "Central Park",
            "capacity": 2,
            "budget": 0,
            "skillLevel": "all-levels"
          },
          "status": "pending",
          "resultingActivityId": null,
          "userRole": "proposer",
          "createdAt": "2026-10-10T16:00:00.000Z",
          "updatedAt": "2026-10-10T16:00:00.000Z"
        }
      ],
      "summary": {
        "organizedCount": 1,
        "joinedCount": 1,
        "pendingRequestsCount": 1,
        "interestRequestsCount": 1,
        "proposalsCount": 1,
        "totalPlansCount": 5
      }
    }
  }
  ```
- **Response Structure & Cancellation Guidance for Person 1:**
  - `requestId` Cancellation Identifier: For `joined` and `pendingRequests`, the wrapper property is `item.requestId`. This contains the MongoDB `_id` of the underlying `JoinRequest`. To cancel or leave, call `POST /api/join-requests/${item.requestId}/cancel`. Neither `item._id` nor `item.joinRequestId` exists on the wrapper object.
  - Activity Organizer Representation: `activity.organizerId` is an ObjectId string. There is no populated `activity.organizer` object (no `displayName` or `avatar`).
  - Summary Counts Scope: The `summary` counts (`organizedCount`, `joinedCount`, `pendingRequestsCount`, `interestRequestsCount`, `proposalsCount`, and `totalPlansCount`) reflect the length of the arrays returned in the current response, constrained by the `limit` parameter (default 50, bounded to `[1, 100]`), rather than unbounded database totals.
- **Privacy & Security Invariants:**
  - `organized` activities preserve precise coordinates (`location.isPrecise: true`, exact coordinates array) because the user is the organizer.
  - `joined` activities mask coordinates (`location.coordinates: null`, `location.isPrecise: false`, `displayArea` retained) to protect meeting location privacy until confirmed attendee disclosure mechanisms are formalized.
  - `pendingRequests` mask coordinates (`location.coordinates: null`, `location.isPrecise: false`).
  - `interestRequests` preserve precise coordinates because the user is the request creator.
  - `proposals` include calculated `userRole` (`"proposer"` or `"recipient"`) based on authenticated session ID.
  - Deleted or orphaned activity references (`activityId: null`) in join requests are safely filtered without throwing runtime errors.
- **Error Codes:**
  - `401 UNAUTHORIZED`: Authentication required (missing session or missing `req.user.id`/`req.user._id`).

---

## 7. Phase 7 Implemented Endpoints (Verified Behavior)

### 7.1 Profile & Preferences (`/api/me`)
Owner: Person 2 & Person 3

#### 7.1.1 `PATCH /api/me/profile`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Updates authenticated user profile details. Strips password and sensitive fields.
- **Request Body:**
  ```json
  {
    "displayName": "Alice Chen",
    "bio": "Running enthusiast and nature lover",
    "avatar": "https://example.com/alice.jpg",
    "phoneNumber": "+1234567890",
    "gender": "prefer-not-to-say"
  }
  ```
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "_id": "6acab79523b6da3e5f167659",
      "id": "6acab79523b6da3e5f167659",
      "email": "alice@example.com",
      "displayName": "Alice Chen",
      "bio": "Running enthusiast and nature lover",
      "avatar": "https://example.com/alice.jpg",
      "interests": ["outdoor", "fitness", "nature"],
      "searchRadiusKm": 5,
      "preferredLocation": {
        "displayArea": "Central Park, New York",
        "coordinates": [-73.9665, 40.7812]
      },
      "notificationPreferences": {
        "inApp": true,
        "email": true,
        "push": false
      },
      "phoneNumber": "+1234567890",
      "gender": "prefer-not-to-say",
      "createdAt": "2026-10-10T22:00:00.000Z",
      "updatedAt": "2026-10-10T22:05:00.000Z"
    }
  }
  ```

#### 7.1.2 `GET /api/me/preferences`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Returns the authenticated user's discovery and notification preferences.
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "interests": ["outdoor", "fitness", "nature"],
      "searchRadiusKm": 5,
      "preferredLocation": {
        "displayArea": "Central Park, New York",
        "coordinates": [-73.9665, 40.7812]
      },
      "notificationPreferences": {
        "inApp": true,
        "email": true,
        "push": false
      }
    }
  }
  ```

#### 7.1.3 `PATCH /api/me/preferences`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Updates preferences (discovery radius bounded `[1, 50]`, interests validated against allowed categories).
- **Request Body:**
  ```json
  {
    "interests": ["outdoor", "social"],
    "searchRadiusKm": 10,
    "preferredLocation": {
      "displayArea": "Downtown",
      "coordinates": [-73.985, 40.748]
    },
    "notificationPreferences": {
      "inApp": true,
      "email": false,
      "push": false
    }
  }
  ```
- **Success Response (`200 OK`):** Returns updated preferences object.

---

### 7.2 In-App Notifications (`/api/notifications`)
Owner: Person 2 & Person 3

#### 7.2.1 `GET /api/notifications`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Retrieves paginated in-app notifications and truthful unread count.
- **Query Parameters:** `page` (default 1), `limit` (default 20, max 50), `unreadOnly` (boolean).
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "_id": "6acab823a4603bccbccb3950",
          "recipientId": "6acab79523b6da3e5f167659",
          "type": "JOIN_REQUEST_RECEIVED",
          "title": "New Join Request",
          "message": "Bob Smith requested to join \"Hudson River Nature Walk & Photography\".",
          "relatedResourceId": "6acab79523b6da3e5f167660",
          "relatedResourceType": "activity",
          "readAt": null,
          "createdAt": "2026-10-10T22:00:00.000Z",
          "updatedAt": "2026-10-10T22:00:00.000Z"
        }
      ],
      "unreadCount": 1,
      "pagination": {
        "page": 1,
        "limit": 20,
        "total": 1,
        "totalPages": 1,
        "hasNextPage": false,
        "hasPrevPage": false
      }
    }
  }
  ```

#### 7.2.2 `PATCH /api/notifications/:id/read`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Marks a single notification as read (`readAt = new Date()`), enforcing recipient ownership.
- **Success Response (`200 OK`):** Returns updated notification with `readAt` timestamp.

#### 7.2.3 `PATCH /api/notifications/read-all`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Marks all unread notifications for the user as read.
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "modifiedCount": 3
    }
  }
  ```

---

### 7.3 Safety & Moderation (`/api/reports` & `/api/blocks`)
Owner: Person 2 & Person 4

#### 7.3.1 `POST /api/reports`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Reports an activity, user, or proposal for moderation. Validates target existence and prevents self-reporting.
- **Request Body:**
  ```json
  {
    "targetType": "activity",
    "targetId": "6acab79523b6da3e5f167660",
    "reason": "safety_concern",
    "details": "Dangerous trail conditions without warning"
  }
  ```
- **Allowed Reasons:** `'spam'`, `'harassment'`, `'inappropriate_content'`, `'safety_concern'`, `'no_show'`, `'other'`.
- **Success Response (`201 Created`):** Returns created report record with `status: "pending"`.

#### 7.3.2 `POST /api/blocks`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Blocks a user. Excludes their activities from discovery for the blocker. Prevents self-blocking and duplicate blocking.
- **Request Body:**
  ```json
  {
    "blockedUserId": "6acab79523b6da3e5f167659",
    "reason": "Unwanted contact"
  }
  ```
- **Success Response (`201 Created`):** Returns created block record.
- **Error Responses:**
  - `400 CANNOT_BLOCK_SELF`: Attempt to block own user ID.
  - `404 USER_NOT_FOUND`: Target user does not exist.
  - `409 ALREADY_BLOCKED`: Duplicate block request.

#### 7.3.3 `GET /api/blocks`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Returns array of user IDs blocked by the authenticated user.
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "blockedUserIds": ["6acab79523b6da3e5f167659"]
    }
  }
  ```

#### 7.3.4 `DELETE /api/blocks/:userId`
- **Status:** **Implemented** (Verified)
- **Auth:** Required (`requireAuth`)
- **Description:** Unblocks a previously blocked user.
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "unblocked": true,
      "blockedUserId": "6acab79523b6da3e5f167659"
    }
  }
  ```

---

### 7.4 Demo Database Seeder (`npm run seed`)
- **Command:** `npm run seed` (executed in `apps/api`)
- **Description:** Wipes demo accounts and populates realistic users, activities, join requests, interest requests, proposals, and in-app notifications. Non-demo accounts are preserved.
- **Demo Personas (Password for all: `Password123!`):**
  1. **Alice Chen** (`alice@example.com`): Organizer of 3 activities (Sunrise 5K Run, Nature Walk, Board Games).
  2. **Bob Smith** (`bob@example.com`): Participant with 1 approved join, 1 pending request, 1 active interest request, 1 proposal.
  3. **Charlie Patel** (`charlie@example.com`): Matcher who created the tennis doubles proposal for Bob.
  4. **Dana Taylor** (`dana@example.com`): Newcomer with preferences configured, ready for onboarding.

---

## 8. Stretch & P1 Endpoints (Deferred / Out of MVP Scope)
- `POST /api/auth/verify-email`: P1 email token verification.
- `POST /api/push/subscribe` & `DELETE /api/push/subscribe`: P1 Web Push subscription.
- Socket.IO chat history & events: P1 stretch.

### 8.3 Open Decisions for Person 3 (Authentication & Notifications)
1. **`req.user` Authentication Shape:**
   - Formalize the agreement that `authMiddleware` attaches `req.user = { id: user._id.toString(), displayName: user.displayName, ... }` so backend services can reliably access `req.user.id`.
2. **User Model Registration:**
   - Confirm that the Mongoose model is registered as `'User'` with `displayName: String` as a required field.
3. **In-App Notification Trigger Contract:**
   - Define the exact schema and signature expected by the notification service when backend hooks are triggered:
     ```javascript
     // Proposed notification payload signature:
     createNotification({
       recipientId: ObjectId,
       type: 'JOIN_REQUEST_RECEIVED' | 'JOIN_REQUEST_APPROVED' | 'JOIN_REQUEST_REJECTED' | 'ATTENDEE_CANCELLED' | 'ACTIVITY_CANCELLED',
       relatedActivityId: ObjectId,
       message: String
     })
     ```

### 8.4 Open Decisions for Person 4 (Integration, QA & Deployment Lead)
1. **Demo Location Policy (Organizer-Only Coordinates):**
   - *Demo Baseline (Verified in Code & Tests):* Exact meeting coordinates are organizer-only (`isPrecise: true`). Approved attendees, pending requesters, and public viewers receive only the general area (`location.coordinates: null`, `isPrecise: false`).
   - *Decision Pending Project-Owner Confirmation:* Confirm whether approved attendees should be granted access to precise coordinates prior to start time in a future phase.
2. **Reporting & Safety Scope:**
   - Confirm whether `POST /api/reports` and `POST /api/blocks` remain out of scope for the hackathon MVP demo, with the frontend displaying the unavailable message.
3. **Staging Database Topology:**
   - Confirm whether staging/production will run a MongoDB Replica Set to allow upgrading from compensating writes to native multi-document ACID transactions.
4. **End-to-End Integration Verification Plan:**
   - Define the acceptance criteria and smoke test script across the React frontend and Express API before the demo.

### 8.5 Two-Day Hackathon Implementation Scope Focus
To ensure delivery within the constrained two-day window, the team must prioritize the essential end-to-end user loop:
```text
Discovery (city/area radius) -> Details (privacy-masked) -> Request to Join -> Organizer Decision (atomic capacity) -> My Plans
```
- **P0 Core (Must Ship):** Session auth, draft/published activity lifecycle, 3 km default radius discovery, join requests, atomic capacity protection, deterministic matching (Phase 5), and My Plans.
- **P1 / Stretch (Do Not Block P0):** Web Push, email verification links, BullMQ/Redis background workers, Socket.IO live chat, and AI planning assistants must not hold up core activity flows.

