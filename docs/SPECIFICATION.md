# Reminder PWA — V1 Product & Technical Specification

## 1. Objective

Build a production-quality Progressive Web Application (PWA) for creating and managing recurring reminders.

The application should be simple, fast, mobile-first, installable as a PWA, and capable of sending push notifications to users even when the application is not currently open, subject to browser/OS PWA notification capabilities.

This is V1. Avoid unnecessary features and dependencies.

The implementation should look and feel as if it were built by an experienced senior software engineer: modular, strongly typed, maintainable, testable, secure, and designed so future features can be added without major rewrites.

# 2. Technology Stack

Use:

- Vite
- React
- TypeScript
- React Router
- Redux Toolkit
- Tailwind CSS
- Supabase
  - PostgreSQL database
  - Authentication
  - Row Level Security (RLS)
  - Edge Functions where appropriate
  - Scheduled/Cron jobs where appropriate
- Web Push API
- Service Worker
- PWA manifest

Do NOT use:

- Next.js
- A custom traditional backend/server
- Unnecessary UI frameworks
- Excessive dependencies
- Overengineered abstractions

Prefer native browser APIs and small focused libraries where reasonable.

# 3. Architecture Principles

Follow professional production-quality architecture.

Requirements:

- Strict TypeScript.
- No `any` unless genuinely unavoidable and documented.
- Split functionality into small, focused components.
- Separate UI, business logic, state management, API/database access, validation, and notification logic.
- Avoid giant React components.
- Avoid putting application logic directly inside page components.
- Create reusable hooks where appropriate.
- Create reusable form components where appropriate.
- Keep Supabase access in a dedicated data/service layer.
- Keep recurrence calculations in their own module.
- Keep notification functionality isolated.
- Use environment variables for configuration/secrets.
- Never expose privileged Supabase credentials to the browser.
- Use Supabase RLS as an actual security boundary.
- Handle loading, empty, success, and error states.
- Build mobile-first but make desktop layouts responsive.
- Prefer simple code over clever code.
- Add comments only where they explain non-obvious reasoning.

Structure the project so additional features can be introduced later without restructuring the entire application.

# 4. Authentication

Authentication is required.

Use Supabase Auth.

## Registration

Registration requires:

- Username
- Email
- Password
- Repeat password

Validation:

- Email must be valid.
- Email must be unique.
- Username must be unique.
- Password must satisfy reasonable security requirements.
- Repeat password must match password.

Never store passwords manually.

Passwords must only be managed through Supabase Auth.

## Login

Login requires:

- Email
- Password

Also provide:

- Logout
- Forgot/reset password flow
- Persistent authentication/session restoration

Unauthenticated users attempting to access protected pages must be redirected to `/auth`.

Authenticated users visiting `/auth` should be redirected to the dashboard.

# 5. User Profiles

Each authenticated user has a profile.

Profile information:

- User ID
- Username
- Email
- Created timestamp
- Updated timestamp

Username and email must be unique.

Provide a Profile page where users can:

- Change username
- Change email
- Change password
- Logout

Use Supabase Auth correctly when changing authentication-sensitive information.

Never store plaintext passwords or password copies in the profile table.

# 6. Main Routes

Use approximately:

/auth
/
/reminders/new
/reminders/:id/edit
/profile

The root `/` is the authenticated dashboard.

Keep navigation minimal.

# 7. Dashboard

The dashboard is the main application screen.

Display the user's reminders.

Each reminder should clearly show:

- Title
- Next occurrence
- Time
- Recurrence summary
- Active/paused state

Provide quick actions:

- Edit
- Pause
- Resume
- Delete

Provide an obvious button for:

"Add Reminder"

Design primarily for phones but make it work cleanly on larger screens.

Include a useful empty state when the user has no reminders.

# 8. Reminder Data Model

A reminder should contain approximately:

- id
- user_id
- title
- details
- start_date
- time_of_day
- timezone
- recurrence_interval
- recurrence_unit
- recurrence_end_type
- recurrence_end_date
- snooze_duration_minutes
- status
- next_occurrence_at
- created_at
- updated_at

Use appropriate PostgreSQL types.

Status should at minimum support:

- active
- paused

Design the schema so additional reminder functionality can be introduced later.

# 9. Creating a Reminder

The Create Reminder form must contain:

## Title

Required.

Short description of what the user needs to remember.

Example:

"Vet appointment"

## Details

Optional longer text.

Example:

"Bring vaccination documents and ask about the annual checkup."

## Start Date

The date from which the recurrence begins.

## Time

Specific time of day at which the reminder should fire.

The UI should respect the user's preferred/local display convention where practical.

Internally, time handling must be deterministic.

## Recurrence

The recurrence system must be flexible.

Support:

Every N days
Every N weeks
Every N months
Every N years

Where N is a positive integer.

Examples:

Every 1 day
Every 2 days
Every 6 days
Every 1 week
Every 3 weeks
Every 1 month
Every 6 months
Every 1 year
Every 2 years

Do NOT implement recurrence as a hardcoded list such as daily/weekly/monthly.

Model it using:

recurrence_interval = N
recurrence_unit = day | week | month | year

This should allow reminders to continue for months or years.

## Recurrence End

Support:

- Never
- End on a particular date

Architecture may allow additional end conditions later, but they are not required for V1.

## Snooze Duration

Each reminder has its own snooze duration.

Default:

10 minutes

Allow the user to configure the number of minutes.

This value determines how long that reminder is snoozed when the user selects Snooze from a notification.

# 10. Time Zones

Time zones must be handled correctly.

Store enough timezone information to preserve the user's intended local reminder time.

A reminder such as:

"Every day at 09:00"

should continue occurring at 09:00 local time when appropriate rather than accidentally drifting because of UTC conversion or daylight-saving changes.

Use an IANA timezone identifier where appropriate.

Do not implement scheduling by blindly adding fixed millisecond durations for months or years.

Calendar recurrence calculations must correctly handle day/week/month/year semantics.

# 11. Editing Reminders

Users can edit existing reminders.

Editing updates the existing database record.

Editable fields include:

- Title
- Details
- Start date
- Time
- Recurrence interval
- Recurrence unit
- Recurrence end
- Snooze duration

After schedule-related fields are changed, calculate the new next occurrence correctly.

No reminder version history is required for V1.

# 12. Deleting Reminders

Deleting a reminder permanently removes it.

V1 does NOT require:

- Archive
- Trash
- Soft deletion
- Historical restoration

Require a sensible confirmation before destructive deletion.

# 13. Pausing and Resuming

Recurring reminders can be paused.

When paused:

- Do not send notifications.
- Keep the reminder and recurrence configuration.
- Clearly display its paused state.

When resumed:

- Do not send all missed notifications.
- Do not backfill missed occurrences.
- Calculate the next valid occurrence from the current time according to the original recurrence rule.

Example:

A daily reminder is paused for five days.

When resumed, the application should schedule the next valid future occurrence rather than generating five missed notifications.

# 14. Push Notifications

Implement PWA push notifications.

The application should request notification permission appropriately rather than immediately bombarding a new visitor with a browser permission prompt.

Users should understand why notifications are required before permission is requested.

Push notifications should contain:

- Reminder title
- Relevant reminder details where appropriate

Notification interaction should support:

- Open
- Done
- Snooze

Where supported by the browser/platform.

# 15. Notification — Open

Tapping/opening a notification should launch/focus the PWA and navigate to the relevant reminder or useful reminder context.

# 16. Notification — Snooze

Snooze is a ONE-TIME modification to the current occurrence.

Use the reminder's configured `snooze_duration_minutes`.

Default:

10 minutes

Example:

Scheduled occurrence: 09:00
Snooze duration: 10 minutes

User presses Snooze.

A new notification for that occurrence should occur around 09:10.

IMPORTANT:

Snoozing MUST NOT modify the underlying recurrence rule.

If the reminder normally occurs every day at 09:00, tomorrow's reminder should still occur at 09:00.

# 17. Notification — Done

Done acknowledges/completes the current occurrence.

It must NOT stop the recurring reminder.

After the occurrence is acknowledged, calculate/schedule the next recurrence normally.

A full historical completion system is NOT required in V1.

Avoid building an unnecessary history subsystem solely for Done.

# 18. Reminder Scheduling

Reminder scheduling must NOT depend on the PWA remaining open.

Do not rely on:

- setTimeout()
- setInterval()
- A browser tab staying open

for long-term scheduling.

The server-side/cloud infrastructure must determine when notifications need to be dispatched.

Use Supabase's available server-side scheduling mechanisms and Edge Functions where appropriate.

Design scheduling to be reliable and idempotent.

The system should tolerate a scheduler executing slightly late or executing more than once without producing uncontrolled duplicate notifications.

# 19. Suggested Notification Architecture

Use a model roughly like:

Reminder
↓
next_occurrence_at
↓
Scheduled server process
↓
Find due reminders
↓
Send push notification
↓
Calculate next occurrence
↓
Update next_occurrence_at

Snoozed occurrences may require a small separate representation/state so snoozing doesn't modify the base recurrence.

Choose the cleanest implementation.

Prioritize correctness over cleverness.

# 20. Push Subscriptions

Store push subscriptions securely and associate them with the authenticated user.

A user may eventually use multiple devices, so DO NOT design the database around exactly one push subscription per user.

Prefer:

User
↓
Many Push Subscriptions

Each device/browser installation can therefore have its own subscription.

Handle expired/invalid subscriptions gracefully and remove them when the push provider indicates they are no longer valid.

# 21. Cross-Device Synchronization

Reminders are stored in Supabase rather than only local browser storage.

Therefore, when the same user signs into another device, their reminders should be available there.

Push notification subscriptions remain device-specific.

Do not use localStorage as the primary source of truth for reminder data.

# 22. Redux Toolkit

Use Redux Toolkit where shared client-side state genuinely benefits from it.

Possible state domains:

- Authentication/session state
- Profile state
- Reminder state
- UI/application state where appropriate

Do NOT duplicate Supabase unnecessarily.

Keep Redux simple.

Do not create complicated middleware or abstractions without a real requirement.

# 23. Supabase Security

Enable Row Level Security.

A user must ONLY be able to access their own:

- Profile
- Reminders
- Push subscriptions
- Related user-owned records

Create explicit RLS policies.

Never depend solely on client-side filtering such as:

WHERE user_id = currentUser

Client-side filtering is not a security mechanism.

The database itself must enforce ownership.

# 24. PWA Requirements

The application must be installable as a PWA.

Include:

- Web app manifest
- Service worker
- Appropriate application icons/placeholders
- Theme metadata
- Standalone display configuration
- Push notification support
- Reasonable offline shell behavior

The application does NOT need full offline reminder editing/synchronization in V1.

If the user is offline, present a sensible state rather than failing silently.

# 25. UI / UX Direction

Keep the design:

- Minimal
- Professional
- Modern
- Clean
- Mobile-first
- Touch-friendly
- Accessible

Avoid excessive visual complexity.

Use consistent:

- Spacing
- Typography
- Form controls
- Buttons
- Cards
- Dialogs
- Error messages
- Loading states

The reminder creation/editing experience should be especially easy to use on a phone.

Use semantic HTML and accessibility best practices.

Interactive controls must have accessible labels and reasonable touch targets.

# 26. Auth UX

Use ONE authentication page rather than separate login/register pages.

The page should allow switching between:

Sign In
Sign Up

Sign Up fields:

Username
Email
Password
Repeat Password

Sign In fields:

Email
Password

Also provide:

Forgot Password

# 27. Error Handling

Do not ignore errors.

Handle:

- Authentication failures
- Duplicate username
- Duplicate email
- Database failures
- Network failures
- Notification permission denied
- Unsupported notification functionality
- Push subscription failures
- Invalid reminder input
- Scheduler failures where applicable

Provide understandable user-facing messages.

Do not expose internal implementation details or secrets in error messages.

# 28. Validation

Use consistent validation.

Validate both client-side and at the appropriate server/database boundary.

Examples:

- Required title
- Valid email
- Unique username
- Matching passwords
- Positive recurrence interval
- Valid date
- Valid time
- Valid snooze duration
- End date cannot logically precede the recurrence start

Never trust browser input merely because the React form validated it.

# 29. Code Organization

Use a maintainable structure approximately like:

src/
app/
components/
features/
auth/
reminders/
profile/
notifications/
hooks/
layouts/
lib/
pages/
routes/
services/
store/
types/
utils/

Do not follow this structure blindly if a cleaner organization emerges.

Keep feature-specific code close together where appropriate.

The important requirement is separation of concerns.

# 30. Database Migrations

Database structure must be reproducible.

Create Supabase SQL migrations for:

- Tables
- Constraints
- Unique indexes
- Foreign keys
- RLS configuration
- RLS policies
- Database functions/triggers where required

Do not rely on manually creating database objects through the Supabase dashboard without documenting them.

# 31. Environment Configuration

Provide `.env.example`.

Document required environment variables.

Never commit:

- Private keys
- Service-role credentials
- Push private keys
- Secrets

Clearly distinguish browser-safe environment variables from server-only secrets.

# 32. Testing

Add meaningful tests for critical business logic.

Especially test recurrence calculations.

Examples:

Every 1 day
Every 2 days
Every 3 weeks
Every 6 months
Every 1 year
End date reached
Paused reminder
Resume calculation
Snoozed occurrence
Month boundary
Year boundary
DST/timezone behavior where relevant

Do not create hundreds of superficial tests.

Prioritize business-critical logic.

# 33. README

Create a professional README containing:

- Project overview
- Architecture overview
- Technology stack
- Local development setup
- Supabase setup
- Environment variables
- Database migration instructions
- Push notification configuration
- PWA development notes
- Running tests
- Building for production
- Deployment instructions

# 34. Explicitly Out of Scope for V1

Do NOT implement unless required for the core architecture:

- Reminder history
- Completion analytics
- Social features
- Shared reminders
- Teams
- Admin dashboard
- Categories
- Tags
- Attachments
- Rich-text editor
- AI functionality
- Calendar integrations
- SMS
- Email reminders
- Native iOS/Android applications
- Complex offline synchronization
- Multiple themes
- Internationalization system
- Premature microservices

Keep V1 focused.

# 35. Future-Proofing

The architecture should make it reasonably easy to add later:

- Reminder history
- Categories/tags
- Multiple notification channels
- Shared reminders
- Calendar integration
- More recurrence options
- Notification preferences
- Multiple snooze presets
- Reminder analytics

Do NOT build these features now.

Simply avoid architectural decisions that would make them unnecessarily difficult later.

# 36. Development Workflow

Do not attempt to generate the entire application as one giant uncontrolled implementation.

Work incrementally.

Recommended order:

1. Initialize Vite + React + TypeScript project.
2. Configure Tailwind.
3. Establish project architecture.
4. Configure Supabase client.
5. Create database migrations/schema.
6. Configure RLS.
7. Implement authentication.
8. Implement profiles.
9. Implement routing/protected routes.
10. Implement reminder CRUD.
11. Implement recurrence engine.
12. Implement dashboard.
13. Implement pause/resume.
14. Configure PWA/service worker.
15. Implement push subscription flow.
16. Implement server-side notification dispatch.
17. Implement Snooze/Done notification actions.
18. Add validation/error handling.
19. Add tests.
20. Polish responsive/accessibility behavior.
21. Write README.
22. Perform production build and fix all errors/warnings.

# 37. Definition of Done

V1 is complete when a user can:

1. Install/open the PWA.
2. Register an account.
3. Log in.
4. Edit their profile.
5. Create a reminder.
6. Give it a title and details.
7. Select a start date and time.
8. Configure "every N days/weeks/months/years."
9. Configure an optional recurrence end date.
10. Configure snooze duration.
11. Receive push notifications.
12. Snooze an occurrence without changing its recurrence.
13. Mark an occurrence Done.
14. Edit a reminder.
15. Delete a reminder.
16. Pause a reminder.
17. Resume a reminder without receiving missed occurrences.
18. See reminders synchronized after signing in on another device.
19. Log out.
20. Log back in and retain their server-stored reminders.

The application must build successfully with no TypeScript errors.

Critical flows should have tests.

RLS must prevent one user from accessing another user's records.

No secrets may be exposed in client code.

# 38. Final Engineering Instruction

Treat this specification as the source of truth.

When a small implementation detail is unspecified, make the simplest production-quality decision consistent with this specification.

Do not add features merely because they might be useful.

Do not replace technologies from the specified stack without a concrete technical reason.

Before introducing a new dependency, determine whether the platform, React, Supabase, or an existing dependency already solves the problem.

Optimize for:

1. Correctness
2. Security
3. Maintainability
4. Simplicity
5. User experience
6. Performance

Build this as a real maintainable application, not a prototype or tutorial project.

Before considering the implementation complete:

- Run the production build.
- Run tests.
- Run type checking.
- Check linting.
- Review RLS/security.
- Review authentication flows.
- Review recurrence edge cases.
- Review mobile UX.
- Review push notification behavior.
- Remove dead code.
- Remove debugging code.
- Remove unused dependencies.
- Update the README to match the final implementation.
