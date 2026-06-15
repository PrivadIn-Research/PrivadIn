# Firestore Rules Analysis - PoopCoin Economy

## Scope
- Firestore database: `(default)`, Native mode, Standard edition.
- Touched collections/documents: `app_settings/global`, `poopcoin_chain/head`, `poopcoin_transactions/{hash}`, `users/{uid}`, `poop_logs/{id}`, `cuiter_posts/{id}`, `admin_audit_logs/{id}`.

## App Queries
- `poopcoin_transactions`: `orderBy("sequence", "desc")`, `limit(50)`; recalculation reads only the latest transaction with `orderBy("sequence", "desc")`, `limit(1)` to preserve chain continuity.
- `users`: recalculation reads wallet balances and treats their sum as the already reserved PoopCoin supply.
- `cuiter_posts`: `orderBy("createdAt", "desc")`, paginated with `startAfter`; profile query uses `where("userId", "==", uid)`, `orderBy("createdAt", "desc")`, `limit`.
- `poop_logs`: `orderBy("createdAt", "desc")`, and `where("userId", "==", uid)`.
- `app_settings/global` and `poopcoin_chain/head`: realtime document reads.

## Rule Changes
- `app_settings` admin writes now validate optional `poopcoinsPerLog`, `cuiterPostCost`, and PoopCoin rule timestamp/by fields.
- `poopcoin_chain/head` accepts supply fields: `totalSupply`, `mintedSupply`, `burnedSupply`, `circulatingSupply`, `supplyMigratedAt`.
- Non-admin head updates must point at a just-created transaction and follow the expected supply transition for `mint_log`, `legacy_mint`, `cuiter_spend`, or unchanged supply for `transfer`.
- Non-admin `mint_log` transactions must be paired with a `poop_logs/{id}` document created in the same commit; `cuiter_spend` transactions must be paired with a `cuiter_posts/{id}` document created in the same commit.
- Admin can recalculate the supply summary from current user wallet balances, still constrained to valid numeric ranges and the fixed `1,000,000` total supply.

## Residual Notes
- Existing app behavior still relies on signed-in reads of `users`, which contains emails. This is pre-existing and preserved so current ranking/profile screens continue to work.
- Existing user updates are broad for owners; this task focused on PoopCoin supply integrity rather than a full user document rules redesign.
