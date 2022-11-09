use serde::{Serialize, Serializer};
use serde_json;
use type_system::uri::VersionedUri;
use utoipa::{openapi, ToSchema};

use crate::knowledge::EntityId;

pub mod account;

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
