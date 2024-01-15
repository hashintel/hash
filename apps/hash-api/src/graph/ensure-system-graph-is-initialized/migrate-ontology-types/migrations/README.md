# Writing migrations

## File naming and contents

- Files must end with `.migration.ts` or they will not be picked up by the migration runner.
- Files must have a short name which summarises what they do
- Each file must contain a migration function which is the default export
  - The function must return `migrationState`, which it receives as an argument

## Idempotency

- Assume that migration files will be run multiple times. They must leave the database in the same state every time.
- The helper functions in `util` handle this, e.g.
  - `createXTypeIfNotExists` will not create the type if it already exists
  - `updateSystemEntityType` will only update the type if the new version to assign does not exist

If you are writing new utilities, make sure that they are idempotent.

Avoid writing database mutations directly in migration files. Add or adapt an existing utility function
– it makes it easier for future migration writers to discover.

## Updating type dependencies

If you update an entity type, you must update the types that depend on it, i.e.

- if you have updated a link type, update any other type which has it as a link in its schema
- if you have updated an entity type, update any other type which refers to it as a possible destination of a link

`upgradeDependenciesInHashEntityType` currently requires that you provide the dependencies,
having figured them out from looking at existing types. This is obviously (a) error prone and (b) time consuming
and as we update more entity types should be replaced by automatic dependency detection.

## Updating entities

If you update an entity type, you must update the existing entities of that type to the new version.

This is handled by `upgradeEntitiesToNewTypeVersion`. Things to note about this:

1. It retrieves all users and orgs, and then cycles through them, using the web-scoped machine bot for each to retrieve
   and update the entities of that type in that user or org's web. **This may break** if we ever create – or allow users to create –
   entities of system types which the web-scoped machine bot cannot see.
1. If property changes are also required, you must update the `upgradeEntitiesToNewTypeVersion` function to handle them.
1. The entities to update are matched on the type's base URL. It is assumed that all entities of system types are on the same version,
   and all should be updated to the latest version.

## Migration state

The `migrationState` object contains a record of type base URLs to the version number of the type _at that point in the migration_,
i.e. all types will start at `1`, increment as migration files update them, and end up at whatever the latest version is.

If you are writing new utilities, make sure that the `migrationState` object is properly updated.

See existing utilities for examples.

## Codegen after migrations

After running migrations, you need to run two commands to generate new files in `@local/libs/hash-isomorphic-utils`:

### `ontology-type-ids.ts`

This file contains records of system types to their base URL and latest full versioned URL (`entityTypeId`).
It is used to be able to retrieve type ids of system types, e.g. to create entities of specific system types.

To update it following a migration:

1. The Graph must be running
1. Run `yarn generate-ontology-type-ids`

### `system-types/*`

This folder contains TypeScript types generated from the system types. This allows us to strongly type system type properties
when creating or reading them.

To update them following a migration:

1. You must have updated `ontology-type-ids.ts`, which is where the system types to generate are taken from
1. All of (a) the Graph, (b) the Node API, and (c) the frontend must be running
1. Run `yarn generate-system-types`
