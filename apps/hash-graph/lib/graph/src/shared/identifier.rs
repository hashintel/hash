pub mod account;
pub mod knowledge;
pub mod ontology;
pub mod time;

use serde::Serialize;
use type_system::uri::{BaseUri, VersionedUri};
use utoipa::ToSchema;

use crate::identifier::{
    knowledge::EntityId,
    ontology::OntologyTypeVersion,
    time::{Timestamp, VariableAxis},
};

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EntityVertexId {
    pub base_id: EntityId,
    pub revision_id: Timestamp<VariableAxis>,
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct OntologyTypeVertexId {
    pub base_id: BaseUri,
    pub revision_id: OntologyTypeVersion,
}

impl From<VersionedUri> for OntologyTypeVertexId {
    fn from(uri: VersionedUri) -> Self {
        Self {
            base_id: uri.base_uri,
            revision_id: OntologyTypeVersion::new(uri.version),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, ToSchema)]
#[serde(untagged)]
pub enum GraphElementVertexId {
    Ontology(OntologyTypeVertexId),
    KnowledgeGraph(EntityVertexId),
}

impl From<OntologyTypeVertexId> for GraphElementVertexId {
    fn from(id: OntologyTypeVertexId) -> Self {
        Self::Ontology(id)
    }
}

impl From<EntityVertexId> for GraphElementVertexId {
    fn from(id: EntityVertexId) -> Self {
        Self::KnowledgeGraph(id)
    }
}

pub trait VertexId {
    type BaseId;
    type RevisionId;

    fn new(base_id: Self::BaseId, revision_id: Self::RevisionId) -> Self;
    fn base_id(&self) -> &Self::BaseId;
    fn revision_id(&self) -> Self::RevisionId;
}

impl VertexId for OntologyTypeVertexId {
    type BaseId = BaseUri;
    type RevisionId = OntologyTypeVersion;

    fn new(base_id: Self::BaseId, revision_id: Self::RevisionId) -> Self {
        Self {
            base_id,
            revision_id,
        }
    }

    fn base_id(&self) -> &Self::BaseId {
        &self.base_id
    }

    fn revision_id(&self) -> Self::RevisionId {
        self.revision_id
    }
}

impl VertexId for EntityVertexId {
    type BaseId = EntityId;
    type RevisionId = Timestamp<VariableAxis>;

    fn new(base_id: Self::BaseId, revision_id: Self::RevisionId) -> Self {
        Self {
            base_id,
            revision_id,
        }
    }

    fn base_id(&self) -> &Self::BaseId {
        &self.base_id
    }

    fn revision_id(&self) -> Self::RevisionId {
        self.revision_id
    }
}
