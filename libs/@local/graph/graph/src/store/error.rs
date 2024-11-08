use core::{error::Error, fmt};

#[derive(Debug)]
pub struct StoreError;

impl Error for StoreError {}

impl fmt::Display for StoreError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("The store encountered an error")
    }
}

#[derive(Debug)]
#[must_use]
pub struct DeletionError;

impl fmt::Display for DeletionError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Could not delete from the store")
    }
}

impl Error for DeletionError {}

#[derive(Debug)]
#[must_use]
pub struct BaseUrlAlreadyExists;

impl fmt::Display for BaseUrlAlreadyExists {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("tried to insert a new base URL but it already existed")
    }
}

impl Error for BaseUrlAlreadyExists {}

#[derive(Debug)]
#[must_use]
pub struct EntityDoesNotExist;

impl fmt::Display for EntityDoesNotExist {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Entity does not exist")
    }
}

impl Error for EntityDoesNotExist {}

#[derive(Debug)]
#[must_use]
pub struct RaceConditionOnUpdate;

impl fmt::Display for RaceConditionOnUpdate {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("The entity that should be updated was unexpectedly updated at the same time")
    }
}

impl Error for RaceConditionOnUpdate {}

#[derive(Debug)]
#[must_use]
pub struct VersionedUrlAlreadyExists;

impl fmt::Display for VersionedUrlAlreadyExists {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("tried to insert a versioned URL but it already existed")
    }
}

impl Error for VersionedUrlAlreadyExists {}

#[derive(Debug)]
#[must_use]
pub struct OntologyVersionDoesNotExist;

impl fmt::Display for OntologyVersionDoesNotExist {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("tried to update an ontology type which does not exist")
    }
}

impl Error for OntologyVersionDoesNotExist {}

#[derive(Debug)]
#[must_use]
pub struct OntologyTypeIsNotOwned;

impl fmt::Display for OntologyTypeIsNotOwned {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("tried to update a non-owned ontology type")
    }
}

impl Error for OntologyTypeIsNotOwned {}
