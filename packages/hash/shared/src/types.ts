// The types exported here are expected to be branded.

export type Uuid = string;
export type AccountId = Uuid;
export type ownedById = Uuid;

export type EntityUuid = Uuid;
export type EntityEditionId = string;

// Since we already use a template string here, we will keep it. When we
// brand these types, this may not be needed anymore.
export type VersionedUri = `${string}/v/${number}`;
export type BaseUri = string;
