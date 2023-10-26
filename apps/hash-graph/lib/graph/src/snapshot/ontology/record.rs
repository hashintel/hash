use authorization::schema::{
    DataTypeRelationAndSubject, EntityTypeRelationAndSubject, PropertyTypeRelationAndSubject,
};
use graph_types::ontology::OntologyType;
use serde::{Deserialize, Serialize};
use type_system::{DataType, EntityType, PropertyType};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    rename_all = "camelCase",
    bound(
        serialize = "T::Representation: Serialize, T::Metadata: Serialize, R: Serialize",
        deserialize = "T::Representation: Deserialize<'de>, T::Metadata: Deserialize<'de>, R: \
                       Deserialize<'de>"
    )
)]
pub struct OntologyTypeSnapshotRecord<T: OntologyType, R> {
    pub schema: T::Representation,
    pub metadata: T::Metadata,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub relations: Vec<R>,
}

pub type DataTypeSnapshotRecord = OntologyTypeSnapshotRecord<DataType, DataTypeRelationAndSubject>;
pub type PropertyTypeSnapshotRecord =
    OntologyTypeSnapshotRecord<PropertyType, PropertyTypeRelationAndSubject>;
pub type EntityTypeSnapshotRecord =
    OntologyTypeSnapshotRecord<EntityType, EntityTypeRelationAndSubject>;
