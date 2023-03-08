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
pub struct DataTypeVertexId {
    pub base_id: BaseUrl,
    pub revision_id: OntologyTypeVersion,
}

impl VertexId for DataTypeVertexId {
    type BaseId = BaseUrl;
    type RevisionId = OntologyTypeVersion;

    fn base_id(&self) -> &Self::BaseId {
        &self.base_id
    }

    fn revision_id(&self) -> Self::RevisionId {
        self.revision_id
    }
}

impl VertexIndex<DataTypeWithMetadata> for DataTypeVertexId {
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

impl From<VersionedUrl> for DataTypeVertexId {
    fn from(url: VersionedUrl) -> Self {
        Self {
            base_id: url.base_url,
            revision_id: OntologyTypeVersion::new(url.version),
        }
    }
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PropertyTypeVertexId {
    pub base_id: BaseUrl,
    pub revision_id: OntologyTypeVersion,
}

impl VertexId for PropertyTypeVertexId {
    type BaseId = BaseUrl;
    type RevisionId = OntologyTypeVersion;

    fn base_id(&self) -> &Self::BaseId {
        &self.base_id
    }

    fn revision_id(&self) -> Self::RevisionId {
        self.revision_id
    }
}

impl VertexIndex<PropertyTypeWithMetadata> for PropertyTypeVertexId {
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

impl From<VersionedUrl> for PropertyTypeVertexId {
    fn from(url: VersionedUrl) -> Self {
        Self {
            base_id: url.base_url,
            revision_id: OntologyTypeVersion::new(url.version),
        }
    }
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EntityTypeVertexId {
    pub base_id: BaseUrl,
    pub revision_id: OntologyTypeVersion,
}

impl VertexId for EntityTypeVertexId {
    type BaseId = BaseUrl;
    type RevisionId = OntologyTypeVersion;

    fn base_id(&self) -> &Self::BaseId {
        &self.base_id
    }

    fn revision_id(&self) -> Self::RevisionId {
        self.revision_id
    }
}

impl VertexIndex<EntityTypeWithMetadata> for EntityTypeVertexId {
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

impl From<VersionedUrl> for EntityTypeVertexId {
    fn from(url: VersionedUrl) -> Self {
        Self {
            base_id: url.base_url,
            revision_id: OntologyTypeVersion::new(url.version),
        }
    }
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, ToSchema)]
#[serde(untagged)]
pub enum OntologyTypeVertexId {
    DataType(DataTypeVertexId),
    PropertyType(PropertyTypeVertexId),
    EntityType(EntityTypeVertexId),
}

impl VertexId for OntologyTypeVertexId {
    type BaseId = BaseUrl;
    type RevisionId = OntologyTypeVersion;

    fn base_id(&self) -> &Self::BaseId {
        match self {
            OntologyTypeVertexId::DataType(id) => id.base_id(),
            OntologyTypeVertexId::PropertyType(id) => id.base_id(),
            OntologyTypeVertexId::EntityType(id) => id.base_id(),
        }
    }

    fn revision_id(&self) -> Self::RevisionId {
        match self {
            OntologyTypeVertexId::DataType(id) => id.revision_id(),
            OntologyTypeVertexId::PropertyType(id) => id.revision_id(),
            OntologyTypeVertexId::EntityType(id) => id.revision_id(),
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
    DataType(DataTypeVertexId),
    PropertyType(PropertyTypeVertexId),
    EntityType(EntityTypeVertexId),
    KnowledgeGraph(EntityVertexId),
}

impl From<DataTypeVertexId> for GraphElementVertexId {
    fn from(id: DataTypeVertexId) -> Self {
        Self::DataType(id)
    }
}

impl From<PropertyTypeVertexId> for GraphElementVertexId {
    fn from(id: PropertyTypeVertexId) -> Self {
        Self::PropertyType(id)
    }
}

impl From<EntityTypeVertexId> for GraphElementVertexId {
    fn from(id: EntityTypeVertexId) -> Self {
        Self::EntityType(id)
    }
}

impl From<EntityVertexId> for GraphElementVertexId {
    fn from(id: EntityVertexId) -> Self {
        Self::KnowledgeGraph(id)
    }
}
