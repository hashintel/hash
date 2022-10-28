use core::fmt;

use postgres_types::{FromSql, ToSql};
use serde::{Deserialize, Serialize, Serializer};
use serde_json;
use type_system::uri::VersionedUri;
use utoipa::{openapi, ToSchema};
use uuid::Uuid;

use crate::knowledge::EntityId;

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema, FromSql, ToSql,
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

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum GraphElementIdentifier {
    OntologyElementId(VersionedUri),
    // TODO: owned_by_id and version are required to identify a specific instance of an entity
    //  https://app.asana.com/0/1202805690238892/1203214689883091/f
    KnowledgeGraphElementId(EntityId),
}

impl Serialize for GraphElementIdentifier {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::KnowledgeGraphElementId(identifier) => identifier.serialize(serializer),
            Self::OntologyElementId(identifier) => identifier.serialize(serializer),
        }
    }
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
