use std::collections::hash_map::Entry;

use hash_graph_temporal_versioning::Timestamp;
use serde::{Deserialize, Serialize};
use type_system::{
    knowledge::entity::{Entity, EntityId},
    ontology::{
        DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata,
        id::{BaseUrl, OntologyTypeVersion, VersionedUrl},
    },
};
#[cfg(feature = "utoipa")]
use utoipa::ToSchema;

use crate::subgraph::{EdgeEndpoint, temporal_axes::VariableAxis, vertices::Vertices};

pub trait VertexId: Sized {
    type BaseId;
    type RevisionId;
    type Record;

    fn base_id(&self) -> &Self::BaseId;
    fn revision_id(&self) -> &Self::RevisionId;

    /// Returns a shared reference to the [`Record`] vertex in the subgraph.
    ///
    /// [`Record`]: Self::Record
    fn subgraph_entry<'a>(&self, vertices: &'a Vertices) -> Option<&'a Self::Record>;

    /// Returns a mutable reference to the [`Record`] vertex in the subgraph.
    ///
    /// [`Record`]: Self::Record
    fn subgraph_entry_mut(self, vertices: &mut Vertices) -> Entry<'_, Self, Self::Record>;
}

macro_rules! define_ontology_type_vertex_id {
    ($name:ident, $ontology_type:ty, $vertex_set:ident) => {
        #[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, Deserialize)]
        #[cfg_attr(feature = "utoipa", derive(ToSchema))]
        #[serde(rename_all = "camelCase")]
        pub struct $name {
            pub base_id: BaseUrl,
            pub revision_id: OntologyTypeVersion,
        }

        impl VertexId for $name {
            type BaseId = BaseUrl;
            type Record = $ontology_type;
            type RevisionId = OntologyTypeVersion;

            fn base_id(&self) -> &Self::BaseId {
                &self.base_id
            }

            fn revision_id(&self) -> &Self::RevisionId {
                &self.revision_id
            }

            fn subgraph_entry<'a>(&self, vertices: &'a Vertices) -> Option<&'a $ontology_type> {
                vertices.$vertex_set.get(self)
            }

            fn subgraph_entry_mut(
                self,
                vertices: &mut Vertices,
            ) -> Entry<'_, Self, $ontology_type> {
                vertices.$vertex_set.entry(self)
            }
        }

        impl EdgeEndpoint for $name {
            type BaseId = BaseUrl;
            type RevisionId = OntologyTypeVersion;

            fn base_id(&self) -> &Self::BaseId {
                &self.base_id
            }

            fn revision_id(&self) -> &Self::RevisionId {
                &self.revision_id
            }
        }

        impl From<VersionedUrl> for $name {
            fn from(url: VersionedUrl) -> Self {
                Self {
                    base_id: url.base_url,
                    revision_id: url.version,
                }
            }
        }

        impl From<$name> for VersionedUrl {
            fn from(vertex_id: $name) -> Self {
                Self {
                    base_url: vertex_id.base_id,
                    version: vertex_id.revision_id,
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

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct EntityVertexId {
    pub base_id: EntityId,
    pub revision_id: Timestamp<VariableAxis>,
}

impl VertexId for EntityVertexId {
    type BaseId = EntityId;
    type Record = Entity;
    type RevisionId = Timestamp<VariableAxis>;

    fn base_id(&self) -> &Self::BaseId {
        &self.base_id
    }

    fn revision_id(&self) -> &Self::RevisionId {
        &self.revision_id
    }

    fn subgraph_entry<'a>(&self, vertices: &'a Vertices) -> Option<&'a Entity> {
        vertices.entities.get(self)
    }

    fn subgraph_entry_mut(self, vertices: &mut Vertices) -> Entry<'_, Self, Entity> {
        vertices.entities.entry(self)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
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
