use core::{error::Error, fmt, num::NonZero};
use std::collections::HashSet;

use type_system::{
    knowledge::entity::EntityId,
    ontology::{BaseUrl, VersionedUrl},
    provenance::validation::ProvenanceViolation,
};

#[derive(Debug)]
#[must_use]
pub struct InsertionError;

impl fmt::Display for InsertionError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Could not insert into store")
    }
}

impl Error for InsertionError {}

#[derive(Debug, Clone)]
#[must_use]
pub struct QueryError;

impl fmt::Display for QueryError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Could not query from store")
    }
}

impl Error for QueryError {}

#[derive(Debug)]
#[must_use]
pub struct UpdateError;

impl fmt::Display for UpdateError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Could not update store")
    }
}

impl Error for UpdateError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not create the entities: {_variant}")]
#[must_use]
pub enum EntityCreationError {
    #[display("the actor may not instantiate the entity types `{}`",
        entity_type_ids.iter().map(VersionedUrl::to_string).collect::<Vec<_>>().join(", "))]
    InstantiationForbidden {
        entity_type_ids: HashSet<VersionedUrl>,
    },
    #[display("the actor may not create the entities `{}`",
        entity_ids.iter().map(EntityId::to_string).collect::<Vec<_>>().join(", "))]
    CreationForbidden { entity_ids: Vec<EntityId> },
    #[display("the entity types `{}` do not exist or the actor may not view them",
        entity_type_ids.iter().map(VersionedUrl::to_string).collect::<Vec<_>>().join(", "))]
    UnknownEntityTypes {
        entity_type_ids: HashSet<VersionedUrl>,
    },
    #[display("the entity types `{}` are archived",
        entity_type_ids.iter().map(VersionedUrl::to_string).collect::<Vec<_>>().join(", "))]
    ArchivedEntityTypes {
        entity_type_ids: HashSet<VersionedUrl>,
    },
    #[display("the entity types of an entity define the property `{property_type}` differently")]
    IncompatibleEntityTypes { property_type: BaseUrl },
    #[display("the provenance of the entities breaks a rule")]
    InvalidProvenance {
        /// Each broken rule, with the index of its entity in the request, in the order of the
        /// entities.
        violations: Vec<(usize, ProvenanceViolation)>,
    },
    #[display("the entities do not match their entity types")]
    InvalidEntities,
    #[display("store operation failed")]
    Store,
}

impl Error for EntityCreationError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not delete from the store: {_variant}")]
#[must_use]
pub enum DeletionError {
    #[display("decision time must not exceed transaction time")]
    InvalidDecisionTime,
    #[display("{count} incoming links point to the target entities")]
    IncomingLinksExist { count: u64 },
    #[display("expected {expected} entity_ids rows affected, got {actual}")]
    InconsistentEntityIds { expected: u64, actual: u64 },
    #[display("store operation failed")]
    Store,
}

impl Error for DeletionError {}

#[derive(Debug, derive_more::Display)]
#[display("Could not check permissions: {_variant}")]
pub enum CheckPermissionError {
    #[display("Could not resolve policies")]
    BuildPolicyContext,
    #[display("Could not build policy set")]
    BuildPolicySet,
    #[display("Could not evaluate policy set")]
    EvaluatePolicySet,
    #[display("Could not compile filter")]
    CompileFilter,
    #[display("Store operation failed")]
    StoreError,
}

impl Error for CheckPermissionError {}

/// Failure to cluster entities by embedding similarity.
#[derive(Debug, derive_more::Display)]
#[display("Could not cluster entities: {_variant}")]
#[must_use]
pub enum ClusterError {
    #[display("dimension {dimension} is not a positive multiple of 8")]
    InvalidDimension { dimension: NonZero<u16> },
    #[display("dimension {dimension} exceeds maximum allowed dimension {max}")]
    DimensionTooLarge { dimension: NonZero<u16>, max: u16 },
    #[display("cluster count {count} exceeds maximum allowed {max}")]
    KTooLarge { count: u16, max: u16 },
    #[display("embedding query failed")]
    Store,
}

impl Error for ClusterError {}
