use serde::{Deserialize, Serialize, Serializer};
use serde_json;
use type_system::uri::VersionedUri;
use utoipa::{openapi, ToSchema};

use crate::knowledge::EntityId;

// TODO - This is temporary and introduced for consistency, we need to introduce actual IDs for
//  links, should be revisited as part of https://app.asana.com/0/0/1203157172269853/f
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LinkId {
    pub source_entity_id: EntityId,
    pub target_entity_id: EntityId,
    #[schema(value_type = String)]
    pub link_type_id: VersionedUri,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum GraphElementIdentifier {
    OntologyElementId(VersionedUri),
    // TODO: owned_by_id and version are required to identify a specific instance of an entity
    //  https://app.asana.com/0/1202805690238892/1203214689883091/f
    KnowledgeGraphElementId(EntityId),
    Temporary(LinkId),
}

impl Serialize for GraphElementIdentifier {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::KnowledgeGraphElementId(identifier) => identifier.serialize(serializer),
            Self::OntologyElementId(identifier) => identifier.serialize(serializer),
            Self::Temporary(identifier) => serializer.serialize_str(&format!(
                "<SOURCE>{}<TARGET>{}<TYPE>{}",
                &identifier.source_entity_id,
                &identifier.target_entity_id,
                &identifier.link_type_id
            )),
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
