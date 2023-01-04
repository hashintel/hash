pub mod account;
pub mod knowledge;
pub mod ontology;
pub mod time;

use serde::{Deserialize, Serialize};
use serde_json;
use type_system::uri::BaseUri;
use utoipa::{openapi, ToSchema};

use crate::identifier::{
    knowledge::{EntityEditionId, EntityId},
    ontology::OntologyTypeEditionId,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(untagged)]
pub enum GraphElementId {
    Ontology(BaseUri),
    KnowledgeGraph(EntityId),
}

// WARNING: This MUST be kept up to date with the enum variants.
//   We have to do this because utoipa doesn't understand serde untagged:
//   https://github.com/juhaku/utoipa/issues/320
impl ToSchema for GraphElementId {
    fn schema() -> openapi::Schema {
        openapi::OneOfBuilder::new()
            .item(openapi::Object::with_type(openapi::SchemaType::String))
            .example(Some(serde_json::json!(
                "6013145d-7392-4630-ab16-e99c59134cb6"
            )))
            .into()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize)]
#[serde(untagged)]
pub enum GraphElementEditionId {
    Ontology(OntologyTypeEditionId),
    KnowledgeGraph(EntityEditionId),
}

impl From<OntologyTypeEditionId> for GraphElementEditionId {
    fn from(id: OntologyTypeEditionId) -> Self {
        Self::Ontology(id)
    }
}

impl From<EntityEditionId> for GraphElementEditionId {
    fn from(id: EntityEditionId) -> Self {
        Self::KnowledgeGraph(id)
    }
}

// WARNING: This MUST be kept up to date with the enum variants.
//   We have to do this because utoipa doesn't understand serde untagged:
//   https://github.com/juhaku/utoipa/issues/320
impl ToSchema for GraphElementEditionId {
    fn schema() -> openapi::Schema {
        openapi::OneOfBuilder::new()
            .item(OntologyTypeEditionId::schema())
            .item(EntityEditionId::schema())
            .into()
    }
}
