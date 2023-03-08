use serde::Serialize;
use type_system::url::{BaseUrl, VersionedUrl};
use utoipa::ToSchema;

use crate::{
    identifier::{
        knowledge::EntityId,
        ontology::OntologyTypeVersion,
        time::{Timestamp, VariableAxis},
    },
    subgraph::identifier::EdgeEndpoint,
};

pub trait VertexId {
    type BaseId;
    type RevisionId;

    fn base_id(&self) -> &Self::BaseId;
    fn revision_id(&self) -> Self::RevisionId;
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct OntologyTypeVertexId {
    pub base_id: BaseUrl,
    pub revision_id: OntologyTypeVersion,
}

impl VertexId for OntologyTypeVertexId {
    type BaseId = BaseUrl;
    type RevisionId = OntologyTypeVersion;

    fn base_id(&self) -> &Self::BaseId {
        &self.base_id
    }

    fn revision_id(&self) -> Self::RevisionId {
        self.revision_id
    }
}

impl From<VersionedUrl> for OntologyTypeVertexId {
    fn from(url: VersionedUrl) -> Self {
        Self {
            base_id: url.base_url,
            revision_id: OntologyTypeVersion::new(url.version),
        }
    }
}

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EntityVertexId {
    pub base_id: EntityId,
    pub revision_id: Timestamp<VariableAxis>,
}

impl VertexId for EntityVertexId {
    type BaseId = EntityId;
    type RevisionId = Timestamp<VariableAxis>;

    fn base_id(&self) -> &Self::BaseId {
        &self.base_id
    }

    fn revision_id(&self) -> Self::RevisionId {
        self.revision_id
    }
}

impl EdgeEndpoint for OntologyTypeVertexId {
    type BaseId = BaseUrl;
    type RightEndpoint = OntologyTypeVersion;

    fn base_id(&self) -> &Self::BaseId {
        &self.base_id
    }

    fn revision_id(&self) -> Self::RightEndpoint {
        self.revision_id
    }
}
