pub mod account;
pub mod knowledge;
pub mod ontology;
pub mod time;

use serde::{Deserialize, Serialize};
use serde_json;
use type_system::uri::BaseUri;
use utoipa::{openapi, ToSchema};

use crate::identifier::{
    knowledge::EntityId,
    ontology::OntologyTypeEditionId,
    time::{ProjectedTime, Timestamp},
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
    fn schema() -> openapi::RefOr<openapi::Schema> {
        openapi::OneOfBuilder::new()
            .item(openapi::Object::with_type(openapi::SchemaType::String))
            .example(Some(serde_json::json!(
                "6013145d-7392-4630-ab16-e99c59134cb6"
            )))
            .into()
    }
}

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EntityVertexId {
    base_id: EntityId,
    version: Timestamp<ProjectedTime>,
}

impl EntityVertexId {
    #[must_use]
    pub const fn new(base_id: EntityId, version: Timestamp<ProjectedTime>) -> Self {
        Self { base_id, version }
    }

    #[must_use]
    pub const fn base_id(&self) -> EntityId {
        self.base_id
    }

    #[must_use]
    pub const fn version(&self) -> Timestamp<ProjectedTime> {
        self.version
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize)]
#[serde(untagged)]
pub enum GraphElementVertexId {
    Ontology(OntologyTypeEditionId),
    KnowledgeGraph(EntityVertexId),
}

impl From<OntologyTypeEditionId> for GraphElementVertexId {
    fn from(id: OntologyTypeEditionId) -> Self {
        Self::Ontology(id)
    }
}

impl From<EntityVertexId> for GraphElementVertexId {
    fn from(id: EntityVertexId) -> Self {
        Self::KnowledgeGraph(id)
    }
}

// WARNING: This MUST be kept up to date with the enum variants.
//   We have to do this because utoipa doesn't understand serde untagged:
//   https://github.com/juhaku/utoipa/issues/320
impl ToSchema for GraphElementVertexId {
    fn schema() -> openapi::RefOr<openapi::Schema> {
        openapi::OneOfBuilder::new()
            .item(openapi::Ref::from_schema_name("OntologyTypeEditionId"))
            .item(openapi::Ref::from_schema_name("EntityVertexId"))
            .into()
    }
}
