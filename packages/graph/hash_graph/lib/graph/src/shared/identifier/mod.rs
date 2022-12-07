use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json;
use type_system::uri::BaseUri;
use utoipa::{openapi, ToSchema};

use crate::identifier::{
    knowledge::{EntityEditionId, EntityId},
    ontology::OntologyTypeEditionId,
};

pub mod account;
pub mod knowledge;
pub mod ontology;

pub type Timestamp = DateTime<Utc>;

#[derive(Debug, Copy, Clone, Hash, PartialEq, Eq, Serialize, Deserialize)]
pub struct Timespan {
    pub from: Timestamp,
    pub to: Option<Timestamp>,
}

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

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(untagged)]
pub enum GraphElementEditionId {
    Ontology(OntologyTypeEditionId),
    KnowledgeGraph(EntityEditionId),
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
