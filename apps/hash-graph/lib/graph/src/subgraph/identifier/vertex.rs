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
        EdgeEndpoint,
    },
};

pub trait VertexId {
    type BaseId;
    type RevisionId;

    fn base_id(&self) -> &Self::BaseId;
    fn revision_id(&self) -> Self::RevisionId;
}

macro_rules! define_ontology_type_vertex_id {
    ($name:ident, $ontology_type:ty, $vertex_set:ident) => {
        #[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, ToSchema)]
        #[serde(rename_all = "camelCase")]
        pub struct $name {
            pub base_id: BaseUrl,
            pub revision_id: OntologyTypeVersion,
        }

        impl VertexId for $name {
            type BaseId = BaseUrl;
            type RevisionId = OntologyTypeVersion;

            fn base_id(&self) -> &Self::BaseId {
                &self.base_id
            }

            fn revision_id(&self) -> Self::RevisionId {
                self.revision_id
            }
        }

        impl VertexIndex<$ontology_type> for $name {
            fn vertices_entry<'a>(&self, vertices: &'a Vertices) -> Option<&'a $ontology_type> {
                vertices.$vertex_set.get(self)
            }

            fn vertices_entry_mut<'a>(
                &self,
                vertices: &'a mut Vertices,
            ) -> RawEntryMut<'a, Self, $ontology_type, RandomState> {
                vertices.$vertex_set.raw_entry_mut().from_key(self)
            }
        }

        impl EdgeEndpoint for $name {
            type BaseId = BaseUrl;
            type RightEndpoint = OntologyTypeVersion;

            fn base_id(&self) -> &Self::BaseId {
                &self.base_id
            }

            fn revision_id(&self) -> Self::RightEndpoint {
                self.revision_id
            }
        }

        impl From<VersionedUrl> for $name {
            fn from(url: VersionedUrl) -> Self {
                Self {
                    base_id: url.base_url,
                    revision_id: OntologyTypeVersion::new(url.version),
                }
            }
        }
    };
}

define_ontology_type_vertex_id!(DataTypeVertexId, DataTypeWithMetadata, data_types);
define_ontology_type_vertex_id!(
    PropertyTypeVertexId,
    PropertyTypeWithMetadata,
    property_types
);
define_ontology_type_vertex_id!(EntityTypeVertexId, EntityTypeWithMetadata, entity_types);

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
