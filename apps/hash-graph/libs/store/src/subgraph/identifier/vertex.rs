use std::collections::hash_map::{RandomState, RawEntryMut};

use graph_types::{
    knowledge::entity::{Entity, EntityId},
    ontology::{DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata},
};
use serde::{Deserialize, Serialize};
use temporal_versioning::Timestamp;
use type_system::url::{BaseUrl, OntologyTypeVersion, VersionedUrl};
#[cfg(feature = "utoipa")]
use utoipa::ToSchema;

use crate::subgraph::{temporal_axes::VariableAxis, vertices::Vertices, EdgeEndpoint};

pub trait VertexId: Sized {
    type BaseId;
    type RevisionId;
    type Record;

    fn base_id(&self) -> &Self::BaseId;
    fn revision_id(&self) -> Self::RevisionId;

    /// Returns a shared reference to the [`Record`] vertex in the subgraph.
    ///
    /// [`Record`]: Self::Record
    fn subgraph_entry<'a>(&self, vertices: &'a Vertices) -> Option<&'a Self::Record>;

    /// Returns a mutable reference to the [`Record`] vertex in the subgraph.
    ///
    /// [`Record`]: Self::Record
    fn subgraph_entry_mut<'a>(
        &self,
        vertices: &'a mut Vertices,
    ) -> RawEntryMut<'a, Self, Self::Record, RandomState>;
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

            fn revision_id(&self) -> Self::RevisionId {
                self.revision_id
            }

            fn subgraph_entry<'a>(&self, vertices: &'a Vertices) -> Option<&'a $ontology_type> {
                vertices.$vertex_set.get(self)
            }

            fn subgraph_entry_mut<'a>(
                &self,
                vertices: &'a mut Vertices,
            ) -> RawEntryMut<'a, Self, $ontology_type, RandomState> {
                vertices.$vertex_set.raw_entry_mut().from_key(self)
            }
        }

        impl EdgeEndpoint for $name {
            type BaseId = BaseUrl;
            type RevisionId = OntologyTypeVersion;

            fn base_id(&self) -> &Self::BaseId {
                &self.base_id
            }

            fn revision_id(&self) -> Self::RevisionId {
                self.revision_id
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

    fn revision_id(&self) -> Self::RevisionId {
        self.revision_id
    }

    fn subgraph_entry<'a>(&self, vertices: &'a Vertices) -> Option<&'a Entity> {
        vertices.entities.get(self)
    }

    fn subgraph_entry_mut<'a>(
        &self,
        vertices: &'a mut Vertices,
    ) -> RawEntryMut<'a, Self, Entity, RandomState> {
        vertices.entities.raw_entry_mut().from_key(self)
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
