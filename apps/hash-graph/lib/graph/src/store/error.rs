use std::fmt;

use error_stack::Context;

#[derive(Debug)]
pub struct StoreError;

impl Context for StoreError {}

impl fmt::Display for StoreError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("The store encountered an error")
    }
}

#[derive(Debug)]
#[must_use]
pub struct InsertionError;

impl fmt::Display for InsertionError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Could not insert into store")
    }
}

impl Context for InsertionError {}

#[derive(Debug, Clone)]
#[must_use]
pub struct QueryError;

impl fmt::Display for QueryError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Could not query from store")
    }
}

impl Context for QueryError {}

#[derive(Debug)]
#[must_use]
pub struct UpdateError;

impl fmt::Display for UpdateError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Could not update store")
    }
}

impl Context for UpdateError {}

#[derive(Debug)]
#[must_use]
pub struct BaseUriAlreadyExists;

impl fmt::Display for BaseUriAlreadyExists {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("tried to insert a new base URI but it already existed")
    }
}

impl Context for BaseUriAlreadyExists {}

#[derive(Debug)]
#[must_use]
pub struct EntityDoesNotExist;

impl fmt::Display for EntityDoesNotExist {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Entity does not exist")
    }
}

impl Context for EntityDoesNotExist {}

#[derive(Debug)]
#[must_use]
pub struct RaceConditionOnUpdate;

impl fmt::Display for RaceConditionOnUpdate {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("The entity that should be updated was unexpectedly updated at the same time")
    }
}

impl Context for RaceConditionOnUpdate {}

#[derive(Debug)]
#[must_use]
pub struct VersionedUriAlreadyExists;

impl fmt::Display for VersionedUriAlreadyExists {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("tried to insert a versioned URI but it already existed")
    }
}

impl Context for VersionedUriAlreadyExists {}

#[derive(Debug)]
#[must_use]
pub struct OntologyVersionDoesNotExist;

impl fmt::Display for OntologyVersionDoesNotExist {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("tried to update an ontology type which does not exist")
    }
}

impl Context for OntologyVersionDoesNotExist {}

#[derive(Debug)]
#[must_use]
pub struct OntologyTypeIsNotOwned;

impl fmt::Display for OntologyTypeIsNotOwned {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("tried to update a non-owned ontology type")
    }
}

impl Context for OntologyTypeIsNotOwned {}

#[derive(Debug)]
pub struct MigrationError;

impl Context for MigrationError {}

impl fmt::Display for MigrationError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("The store encountered a migration error")
    }
}
