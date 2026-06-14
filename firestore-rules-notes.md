## Firestore notes for current changes

- `users/{uid}`
  - owner updates profile, nickname, avatar, work schedule, bathroom duration
  - owner accepts terms through `termsAccepted`, `acceptedAt`, `acceptedTermsVersion`
  - admin may deactivate/reactivate via `isActive`, `deactivatedAt`, `deactivatedBy`
- `poop_logs/{id}`
  - app creates logs for authenticated owner with `competitionEdition`
  - app queries by `userId == auth.uid`
  - app/admin query ordered by `createdAt desc`
- `app_settings/global`
  - public read
  - admin updates competition announcement and terms version/text
- `admin_audit_logs/{id}`
  - admin full read/create
  - authenticated users need read access only for `reset_weekly` docs used to rebuild competition history
