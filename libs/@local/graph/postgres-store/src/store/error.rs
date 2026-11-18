use core::{error::Error, fmt};

use type_system::ontology::VersionedUrl;

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

/// An entity type that would let a link point to a link.
#[derive(Debug)]
#[must_use]
pub enum LinkToLinkConstraint {
    /// The entity type allows the link type `destination_id` as a link destination.
    Destination {
        entity_type_id: VersionedUrl,
        destination_id: VersionedUrl,
    },
    /// The entity type is a link type and declares the link `link_type_id`.
    Source {
        entity_type_id: VersionedUrl,
        link_type_id: VersionedUrl,
    },
}

impl fmt::Display for LinkToLinkConstraint {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Destination {
                entity_type_id,
                destination_id,
            } => write!(
                fmt,
                "the entity type `{entity_type_id}` allows the link type `{destination_id}` as a \
                 link destination, and links to links are not supported yet"
            ),
            Self::Source {
                entity_type_id,
                link_type_id,
            } => write!(
                fmt,
                "the link type `{entity_type_id}` declares the link `{link_type_id}`, and links \
                 to links are not supported yet"
            ),
        }
    }
}

impl Error for LinkToLinkConstraint {}
