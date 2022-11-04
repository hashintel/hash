use core::fmt;

use chrono::{DateTime, Utc};
use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Serialize};
use serde_json;
use type_system::uri::{BaseUri, VersionedUri};
use utoipa::{openapi, ToSchema};
use uuid::Uuid;

use crate::{knowledge::EntityId, provenance::OwnedById};

#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    Hash,
    PartialOrd,
    Ord,
    Serialize,
    Deserialize,
    ToSchema,
    FromSql,
    ToSql,
)]
#[repr(transparent)]
#[postgres(transparent)]
pub struct AccountId(Uuid);

impl AccountId {
    #[must_use]
    pub const fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

impl fmt::Display for AccountId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "{}", &self.0)
    }
}

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord, Serialize, ToSchema)]
pub struct EntityIdentifier {
    owned_by_id: OwnedById,
    // TODO: rename this to entity_uuid?
    entity_id: EntityId,
}

// TODO: move this to the type system package
pub type OntologyTypeVersion = u32;
pub type Timestamp = DateTime<Utc>;
pub type EntityVersion = Timestamp;

/// Simply a pair-struct which holds an [`EntityIdentifier`] and a [`Timestamp`].
///
/// This can be helpful to describe the state of the graph rooted at an [`Entity`] at a specific
/// [`Timestamp`]. The [`Timestamp`] here is *not* necessarily the same as an [`EntityVersion`] as
/// the [`Timestamp`] might be in the middle of an entity edition's lifetime.
#[derive(Debug, Clone, Hash, PartialEq, Eq, PartialOrd, Ord, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EntityAndTimestamp {
    entity_id: EntityIdentifier,
    timestamp: Timestamp,
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(untagged)]
pub enum GraphElementIdentifier {
    OntologyElementId(BaseUri),
    KnowledgeGraphElementId(EntityIdentifier),
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub enum GraphElementEditionIdentifier {
    OntologyElementEditionId(VersionedUri),
    KnowledgeGraphElementEditionId((EntityIdentifier, EntityVersion)),
}

// TODO: We have to do this because utoipa doesn't understand serde untagged
//  https://github.com/juhaku/utoipa/issues/320
impl ToSchema for GraphElementIdentifier {
    fn schema() -> openapi::Schema {
        openapi::OneOfBuilder::new()
            .item(openapi::Object::with_type(openapi::SchemaType::String))
            .example(Some(serde_json::json!(
                "6013145d-7392-4630-ab16-e99c59134cb6"
            )))
            .into()
    }
}
