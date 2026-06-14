# Firestore Rules Findings

- App web React/TypeScript with Firebase Auth, Firestore and Storage.
- Existing collections used by the app: `users`, `poop_logs`, `user_private`, `admin_audit_logs`, `app_settings`, `registration_requests`, `registration_attempts`, `cuiter_posts`.
- New Poopcoins collections: `poopcoin_transactions`, `poopcoin_chain/head`.
- User docs contain PII (`email`) but current app reads all users for ranking/profile display, so rules preserve the existing signed-in read model.
- Protected user fields for common users include role, points, active state, cooldown and now `poopcoinBalance`/`poopcoinMigratedAt`.
- Poopcoin ledger is readable by signed-in users and append-only except admin reversal status fields.
- Client writes Poopcoin transactions because Firebase Functions are intentionally out of scope.
- Security limitation: rules can validate shape and roles, but cannot recompute SHA-256 hashes or fully prove balance math.

## Devil's Advocate Notes

- Anonymous reads: denied for `poopcoin_transactions` and `poopcoin_chain`.
- Direct owner edit of `poopcoinBalance`: denied unless it is the only changed field and paired with the Poopcoin write path.
- Direct delete of ledger entries: denied.
- Non-admin reversal update: denied.
- Admin-only adjustment and migration transaction types: transaction creation requires `isAdmin()`.
- Schema pollution on Poopcoin transactions: blocked by `keys().hasOnly(...)`.
- Resource exhaustion: `reason`, `nonce`, ids and amount ranges are bounded.
- Remaining limitation: because this app intentionally avoids Firebase Functions, rules cannot recompute transaction hashes or fully prove every balance delta. This is a prototype rules layer, not blockchain-grade trust.
