use core::fmt;

use error_stack::Context;

#[derive(Debug)]
pub struct StoreError;

impl ::core::error::Error for StoreError {}

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

impl ::core::error::Error for DeletionError {}

#[derive(Debug)]
#[must_use]
pub struct BaseUrlAlreadyExists;

impl fmt::Display for BaseUrlAlreadyExists {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("tried to insert a new base URL but it already existed")
    }
}

impl ::core::error::Error for BaseUrlAlreadyExists {}

#[derive(Debug)]
#[must_use]
pub struct EntityDoesNotExist;

impl fmt::Display for EntityDoesNotExist {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Entity does not exist")
    }
}

impl ::core::error::Error for EntityDoesNotExist {}

#[derive(Debug)]
#[must_use]
pub struct RaceConditionOnUpdate;

impl fmt::Display for RaceConditionOnUpdate {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("The entity that should be updated was unexpectedly updated at the same time")
    }
}

impl ::core::error::Error for RaceConditionOnUpdate {}

#[derive(Debug)]
#[must_use]
pub struct VersionedUrlAlreadyExists;

impl fmt::Display for VersionedUrlAlreadyExists {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("tried to insert a versioned URL but it already existed")
    }
}

impl ::core::error::Error for VersionedUrlAlreadyExists {}

#[derive(Debug)]
#[must_use]
pub struct OntologyVersionDoesNotExist;

impl fmt::Display for OntologyVersionDoesNotExist {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("tried to update an ontology type which does not exist")
    }
}

impl ::core::error::Error for OntologyVersionDoesNotExist {}

#[derive(Debug)]
#[must_use]
pub struct OntologyTypeIsNotOwned;

impl fmt::Display for OntologyTypeIsNotOwned {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("tried to update a non-owned ontology type")
    }
}

impl ::core::error::Error for OntologyTypeIsNotOwned {}

#[derive(Debug)]
pub struct MigrationError;

impl ::core::error::Error for MigrationError {}

impl fmt::Display for MigrationError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("The store encountered a migration error")
    }
}
