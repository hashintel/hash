use std::collections::hash_map::{RandomState, RawEntryMut};

use serde::Serialize;
use type_system::url::{BaseUrl, VersionedUrl};
use utoipa::ToSchema;

use crate::{
    identifier::{knowledge::EntityId, ontology::OntologyTypeVersion, time::Timestamp},
    knowledge::Entity,
    ontology::{DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata},
    subgraph::{
        temporal_axes::VariableAxis,
        vertices::{VertexIndex, Vertices},
    },
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

impl VertexIndex<DataTypeWithMetadata> for OntologyTypeVertexId {
    fn vertices_entry<'a>(&self, vertices: &'a Vertices) -> Option<&'a DataTypeWithMetadata> {
        vertices.data_types.get(self)
    }

    fn vertices_entry_mut<'a>(
        &self,
        vertices: &'a mut Vertices,
    ) -> RawEntryMut<'a, Self, DataTypeWithMetadata, RandomState> {
        vertices.data_types.raw_entry_mut().from_key(self)
    }
}

impl VertexIndex<PropertyTypeWithMetadata> for OntologyTypeVertexId {
    fn vertices_entry<'a>(&self, vertices: &'a Vertices) -> Option<&'a PropertyTypeWithMetadata> {
        vertices.property_types.get(self)
    }

    fn vertices_entry_mut<'a>(
        &self,
        vertices: &'a mut Vertices,
    ) -> RawEntryMut<'a, Self, PropertyTypeWithMetadata, RandomState> {
        vertices.property_types.raw_entry_mut().from_key(self)
    }
}

impl VertexIndex<EntityTypeWithMetadata> for OntologyTypeVertexId {
    fn vertices_entry<'a>(&self, vertices: &'a Vertices) -> Option<&'a EntityTypeWithMetadata> {
        vertices.entity_types.get(self)
    }

    fn vertices_entry_mut<'a>(
        &self,
        vertices: &'a mut Vertices,
    ) -> RawEntryMut<'a, Self, EntityTypeWithMetadata, RandomState> {
        vertices.entity_types.raw_entry_mut().from_key(self)
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

impl VertexIndex<Entity> for EntityVertexId {
    fn vertices_entry<'a>(&self, vertices: &'a Vertices) -> Option<&'a Entity> {
        vertices.entities.get(self)
    }

    fn vertices_entry_mut<'a>(
        &self,
        vertices: &'a mut Vertices,
    ) -> RawEntryMut<'a, Self, Entity, RandomState> {
        vertices.entities.raw_entry_mut().from_key(self)
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
