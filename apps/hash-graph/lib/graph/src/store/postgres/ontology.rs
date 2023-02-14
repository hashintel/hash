mod data_type;
mod entity_type;
mod ontology_id;
mod property_type;
mod read;

use type_system::{DataType, EntityType, PropertyType};

pub use self::ontology_id::OntologyId;
use crate::{ontology::OntologyType, store::postgres::query::PostgresRecord};

/// Provides an abstraction over elements of the Type System stored in the Database.
///
/// [`PostgresDatabase`]: crate::store::PostgresDatabase
pub trait OntologyDatabaseType: OntologyType<WithMetadata: PostgresRecord> {
    /// Returns the name of the table where this type is stored.
    fn table() -> &'static str;
}

impl OntologyDatabaseType for DataType {
    fn table() -> &'static str {
        "data_types"
    }
}

impl OntologyDatabaseType for PropertyType {
    fn table() -> &'static str {
        "property_types"
    }
}

impl OntologyDatabaseType for EntityType {
    fn table() -> &'static str {
        "entity_types"
    }
}
