use type_system::ontology::{id::OntologyTypeRecordId, provenance::OntologyOwnership};

pub use self::lookup::DataTypeLookup;

mod lookup;

/// A [`DataTypeMetadata`] that has not yet been fully resolved.
///
/// [`DataTypeMetadata`]: type_system::ontology::data_type::DataTypeMetadata
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PartialDataTypeMetadata {
    pub record_id: OntologyTypeRecordId,
    pub ownership: OntologyOwnership,
}
