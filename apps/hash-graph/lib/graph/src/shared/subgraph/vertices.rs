use std::collections::HashMap;

use crate::{
    identifier::EntityVertexId,
    knowledge::Entity,
    ontology::{DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata},
    subgraph::identifier::OntologyTypeVertexId,
};

#[derive(Default, Debug)]
pub struct Vertices {
    pub data_types: HashMap<OntologyTypeVertexId, DataTypeWithMetadata>,
    pub property_types: HashMap<OntologyTypeVertexId, PropertyTypeWithMetadata>,
    pub entity_types: HashMap<OntologyTypeVertexId, EntityTypeWithMetadata>,
    pub entities: HashMap<EntityVertexId, Entity>,
}
