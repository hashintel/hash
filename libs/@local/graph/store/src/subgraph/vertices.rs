use std::collections::HashMap;

use type_system::{
    knowledge::Entity,
    ontology::{DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata},
};

use crate::subgraph::identifier::{
    DataTypeVertexId, EntityTypeVertexId, EntityVertexId, PropertyTypeVertexId,
};

#[derive(Default, Debug)]
pub struct Vertices {
    pub data_types: HashMap<DataTypeVertexId, DataTypeWithMetadata>,
    pub property_types: HashMap<PropertyTypeVertexId, PropertyTypeWithMetadata>,
    pub entity_types: HashMap<EntityTypeVertexId, EntityTypeWithMetadata>,
    pub entities: HashMap<EntityVertexId, Entity>,
}
