//! The sync table: the append-only table of entity changes of an integration.
//!
//! A run adds rows and changes no existing row. The Graph requests of a run are built from its
//! rows, so the table stores neither request bodies nor batch numbers.

pub(crate) mod read;
pub(crate) mod write;

use serde::{Deserialize, Serialize};
use type_system::{
    knowledge::{entity::id::EntityId, property::PropertyObjectWithMetadata},
    ontology::VersionedUrl,
};

use crate::run::RunId;

/// What a [`Change`] does to an entity or a link.
///
/// The variants are declared in the order Send sends them.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Operation {
    CreateEntity,
    UpdateEntity,
    CreateLink,
    UpdateLink,
    ArchiveLink,
    ArchiveEntity,
}

/// One row of the sync table.
#[derive(Debug, Clone, PartialEq)]
pub struct Change {
    /// The run that added the row.
    pub run_id: RunId,
    /// The position of the row in its run, starting at zero.
    pub order_id: u64,
    pub op: Operation,
    /// The id of the entity or link.
    pub entity_id: EntityId,
    /// The entity type or link type.
    pub entity_type: VersionedUrl,
    /// The left endpoint of a link. `None` for an entity.
    pub left_entity_id: Option<EntityId>,
    /// The right endpoint of a link. `None` for an entity.
    pub right_entity_id: Option<EntityId>,
    /// The properties the change carries. A property that is absent keeps its value in the
    /// Graph. Empty for an archive.
    pub properties: PropertyObjectWithMetadata,
}
