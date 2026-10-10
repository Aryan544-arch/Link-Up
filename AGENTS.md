AGENTS.md — MEETUP Pulse

1. Project Overview

MEETUP Pulse is a location-aware social activity platform that helps people become more active, explore nature, meet people, and participate in real-world activities.

The primary source of product requirements is "MEETUP_Pulse_PRD.md".

Always read the PRD before implementing features. Do not invent new product requirements when the PRD already defines the behavior.

2. Team Responsibilities

The project has four team members:

- Person 1: Frontend and user interface.
- Person 2: Backend, database, and activity marketplace.
- Person 3: Authentication and AI functionality.
- Person 4: Responsibilities assigned in the PRD.

Keep shared interfaces and API contracts consistent across team members. Do not replace another person's implementation without permission.

3. Technology Stack

Follow the technologies specified in "MEETUP_Pulse_PRD.md".

Do not introduce a different framework, database, or major dependency without a clear reason and approval.

Use the existing package manager and project conventions. Keep dependencies minimal and compatible.

4. Development Rules

- Inspect the existing files before making changes.
- Build on existing code rather than creating duplicate implementations.
- Keep code modular, readable, and maintainable.
- Use clear names for files, functions, variables, and API endpoints.
- Validate incoming requests.
- Handle errors consistently.
- Never hardcode passwords, API keys, database credentials, or session secrets.
- Never commit ".env" files or other secrets.
- Keep ".env.example" updated when new environment variables are required, using placeholders only.
- Do not add fake production data or pretend that an integration works when it does not.
- Document important assumptions and API contracts.

5. Backend and Database Rules

For backend work:

- Follow the API contract and the PRD.
- Enforce authentication and authorization on protected endpoints.
- Validate ownership before allowing users to modify or cancel their activities.
- Prevent duplicate participation and enforce activity capacity.
- Validate location coordinates and radius inputs.
- Avoid unnecessarily exposing private user information or precise location.
- Use appropriate database constraints and indexes.
- Keep database operations and activity status transitions consistent.
- Use deterministic matching based on real stored data.
- Never automatically publish activities or confirm participation without the required user action.

Coordinate shared user models and authentication interfaces with Person 3.

6. Frontend Integration Rules

- Maintain consistent request and response formats between frontend and backend.
- Document endpoint paths, parameters, request bodies, responses, and errors.
- Do not silently change an agreed API contract.
- Notify the team when an API change affects another component.

7. Testing Requirements

- Add tests for new functionality and important edge cases.
- Test successful requests, validation failures, authorization, and error handling.
- Run relevant tests after making changes.
- Report actual test results honestly.
- Never claim a test passed unless it was executed successfully.

8. Git and Repository Safety

- Work only in the intended project repository.
- Inspect the current branch and working-tree status before significant changes.
- Never discard uncommitted work.
- Do not reset, rebase, force-push, or overwrite another person's work without explicit permission.
- Do not commit, merge, or push unless explicitly instructed.
- Keep changes focused on the current task.

9. Implementation Workflow

For each task:

1. Read the relevant PRD requirements.
2. Inspect the existing implementation.
3. Identify the files and interfaces that need changes.
4. Implement a small, logical unit of work.
5. Run relevant tests and fix failures.
6. Summarize changed files, implemented behavior, test results, and remaining issues.

If requirements conflict or a major decision is unclear, explain the issue before proceeding.

10. Definition of Done

A feature is complete only when:

- It meets the PRD requirements.
- Its implementation is integrated with the existing project.
- Inputs and permissions are validated.
- Relevant tests have been run.
- Required documentation is updated.
- Remaining limitations are clearly reported.
