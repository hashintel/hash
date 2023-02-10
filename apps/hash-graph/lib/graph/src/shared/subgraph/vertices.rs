use std::collections::HashMap;

use crate::{
    identifier::{ontology::OntologyTypeRecordId, EntityVertexId},
    knowledge::Entity,
    ontology::{DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata},
};

#[derive(Default, Debug)]
pub struct Vertices {
    pub data_types: HashMap<OntologyTypeRecordId, DataTypeWithMetadata>,
    pub property_types: HashMap<OntologyTypeRecordId, PropertyTypeWithMetadata>,
    pub entity_types: HashMap<OntologyTypeRecordId, EntityTypeWithMetadata>,
    pub entities: HashMap<EntityVertexId, Entity>,
}
