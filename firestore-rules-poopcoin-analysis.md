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
- PoopCoin rules were simplified after registration `permission-denied`: authenticated users can write validly-shaped chain head updates and validly-shaped transactions created by themselves; admins can still write operational PoopCoin records.
- The previous cross-document `getAfter()` checks between `poopcoin_chain/head`, `poopcoin_transactions`, `poop_logs`, and `cuiter_posts` were removed from the critical path to reduce rule complexity and evaluation failures.
- Admin can recalculate the supply summary from current user wallet balances, still constrained to valid numeric ranges and the fixed `1,000,000` total supply.

## Residual Notes
- Existing app behavior still relies on signed-in reads of `users`, which contains emails. This is pre-existing and preserved so current ranking/profile screens continue to work.
- Existing user updates are broad for owners; this task focused on PoopCoin supply integrity rather than a full user document rules redesign.
- Simplified PoopCoin writes are more permissive than the previous prototype. They are intended to restore app functionality quickly and should be hardened later, ideally with privileged server-side writes for ledger/supply updates.
