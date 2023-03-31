use std::collections::HashMap;

use crate::{
    knowledge::Entity,
    ontology::{DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata},
    subgraph::identifier::{
        DataTypeVertexId, EntityTypeVertexId, EntityVertexId, PropertyTypeVertexId,
    },
};

#[derive(Default, Debug)]
pub struct Vertices {
    pub data_types: HashMap<DataTypeVertexId, DataTypeWithMetadata>,
    pub property_types: HashMap<PropertyTypeVertexId, PropertyTypeWithMetadata>,
    pub entity_types: HashMap<EntityTypeVertexId, EntityTypeWithMetadata>,
    pub entities: HashMap<EntityVertexId, Entity>,
}
