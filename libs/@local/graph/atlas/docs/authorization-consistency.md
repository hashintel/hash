# Deferred authorization consistency

## Status

Cross-process authorization revision and snapshot linearization are deferred.
The current deployment accepts the possibility that authorization state changes
after permission checks but before an Atlas generation becomes active.

This is an explicit product trade-off, not a claim that the race is solved.
Atlas must not add PostgreSQL tables, triggers, or authorization-wide database
locks until this decision is revisited.

## What remains safe

The generation runner still:

- checks entity and entity-type permissions before relation geometry is admitted;
- samples an `AuthorizationRevisionProvider` before and after those permission calls;
- binds the observed revision and extraction receipt identity into the frozen input;
- publishes a candidate before activation; and
- withdraws that candidate's discoverability marker under the activation lock
  when the final optimistic revision read has changed; and
- verifies artifacts, signatures, and the projector checkpoint when reopening the
  active generation.

These checks detect some authorization changes. They do not make permission
evaluation and filesystem activation one atomic operation.

The local fitter records two distinct WAL-derived values in its receipt:
`extractionAuthorizationRevision` is sampled inside the repeatable-read
extraction transaction, while `authorizationRevision` is sampled around the
later permission reads and is the revision bound into the generated manifest.
They are intentionally not presented as one linearized revision.

## Accepted gap

`AuthorizationActivationLeaseProvider` is designed to keep the verified
authorization revision stable through the `active.json` compare-and-swap. HASH
Graph currently has no shared revision or lease implementation covering every
Cedar policy, principal, role, and hierarchy mutation.

An interim provider may:

1. read the best available application-owned authorization epoch;
2. compare it with the revision frozen by the runner; and
3. return a no-op lease when they match.

That is an optimistic recheck only. The current local path removes the candidate
marker if that recheck detects drift, but a mutation can still commit after the
recheck and before activation. A stale generation could therefore become active
until the next fit or operational correction.

Extraction snapshot provenance has the same limitation. An application-issued
receipt can bind the actor, temporal axes, payload hashes, and frozen-input hash,
but it does not prove that all reads came from one store-owned repeatable-read
snapshot unless the extractor supplies and authenticates such a token.

## Why database changes were rejected for now

The strongest design considered adding a revision row, mutation triggers, and a
PostgreSQL advisory-lock protocol. That would affect every authorization
mutation path and database migration, making Atlas substantially more invasive
than desired at this stage.

No part of that design is included in the current implementation.

## Future implementation options

The eventual solution should be selected explicitly from these approaches:

1. **Application-owned epoch**
   - Keep a revision in the authorization service or deployment configuration.
   - Increment it for every permission-relevant mutation.
   - Simple, but correctness depends on complete mutation-path discipline.
2. **External coordination service**
   - Store the revision and a shared/exclusive lease in an existing distributed
     coordination system.
   - Avoids graph-schema changes, but every mutator must still participate.
3. **PostgreSQL advisory-lock protocol without new tables**
   - Derive a revision by canonically hashing authorization rows.
   - Use a shared activation lock and exclusive locks in all mutators.
   - Avoids schema changes but adds expensive reads and invasive write-path code.
4. **PostgreSQL revision row and triggers**
   - Maintain a monotonic revision transactionally.
   - Use shared activation and exclusive mutation locks.
   - Strongest database-local option, but requires the migration explicitly
     declined for the current milestone.

Before choosing an option, inventory all permission-relevant writes, including
policy CRUD, action hierarchy changes, role assignment, team hierarchy changes,
inline policy creation, system-policy seeding, and administrative restore.

## Required correctness work

When this deferral is lifted:

1. Define the exact authorization state covered by one revision.
2. Make every relevant mutation advance that revision atomically.
3. Make permission reads observe one revision and one temporal view.
4. Acquire a cross-process lease that confirms the expected revision.
5. Hold the lease through candidate verification and active-pointer
   compare-and-swap.
6. Issue extraction receipts from the component that owns the database
   transaction, rather than from request data alone.
7. Bind the actor, temporal axes, authorization revision, ontology hash,
   knowledge hash, and frozen-input hash into the receipt.
8. Add concurrent tests proving that mutation blocks or causes activation to
   fail, cancellation releases leases, and pooled connections cannot retain a
   lock or open transaction.

## Revisit criteria

Revisit this decision before any of the following:

- Atlas serves users with materially different visibility scopes;
- policy or role changes must revoke coordinate influence promptly;
- fitting and authorization mutation run in separate processes at meaningful
  frequency;
- Atlas activation becomes automated or frequent; or
- the release process is expected to provide a strict noninterference claim.

Until then, operators should treat authorization drift as an accepted deployment
risk, trigger a new fit after material policy changes, and avoid describing the
activation boundary as transactionally authorization-consistent.
