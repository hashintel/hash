// The types exported here are expected to be branded.
// Perhaps some of these should be put into the subgraph stdlib instead?

export type ownedById = string;
export type AccountId = string;

export type EntityId = string;
export type EntityUuid = string;
export type EntityEditionId = string;

// Since we already use a template string here, we will keep it. When we
// brand these types, this may not be needed anymore.
export type VersionedUri = `${string}/v/${number}`;
export type BaseUri = string;
