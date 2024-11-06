#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("the store encountered an error")]
#[must_use]
pub struct StoreError;

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("could not delete from the store")]
#[must_use]
pub struct DeletionError;

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("tried to insert a new base URL but it already existed")]
#[must_use]
pub struct BaseUrlAlreadyExists;

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("entity does not exist")]
#[must_use]
pub struct EntityDoesNotExist;

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("the entity that should be updated was unexpectedly updated at the same time")]
#[must_use]
pub struct RaceConditionOnUpdate;

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("tried to insert a versioned URL but it already existed")]
#[must_use]
pub struct VersionedUrlAlreadyExists;

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("tried to update an ontology type which does not exist")]
#[must_use]
pub struct OntologyVersionDoesNotExist;

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("tried to update a non-owned ontology type")]
#[must_use]
pub struct OntologyTypeIsNotOwned;

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("the store encountered a migration error")]
#[must_use]
pub struct MigrationError;
