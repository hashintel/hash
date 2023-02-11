use std::collections::HashMap;

use crate::{
    identifier::{ontology::OntologyTypeEditionId, EntityVertexId},
    knowledge::Entity,
    ontology::{DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata},
};

#[derive(Default, Debug)]
pub struct Vertices {
    pub data_types: HashMap<OntologyTypeEditionId, DataTypeWithMetadata>,
    pub property_types: HashMap<OntologyTypeEditionId, PropertyTypeWithMetadata>,
    pub entity_types: HashMap<OntologyTypeEditionId, EntityTypeWithMetadata>,
    pub entities: HashMap<EntityVertexId, Entity>,
}
