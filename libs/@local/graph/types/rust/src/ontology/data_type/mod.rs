use type_system::{ontology::provenance::OntologyOwnership, url::OntologyTypeRecordId};

pub use self::lookup::DataTypeLookup;

mod lookup;

/// A [`DataTypeMetadata`] that has not yet been fully resolved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PartialDataTypeMetadata {
    pub record_id: OntologyTypeRecordId,
    pub ownership: OntologyOwnership,
}
