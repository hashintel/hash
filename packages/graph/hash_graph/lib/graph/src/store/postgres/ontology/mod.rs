mod data_type;
mod entity_type;
mod property_type;
mod read;

use type_system::{uri::VersionedUri, DataType, EntityType, PropertyType};

use crate::ontology::OntologyType;

/// Provides an abstraction over elements of the Type System stored in the Database.
///
/// [`PostgresDatabase`]: crate::store::PostgresDatabase
pub trait OntologyDatabaseType: OntologyType {
    /// Returns the name of the table where this type is stored.
    fn table() -> &'static str;

    fn versioned_uri(&self) -> &VersionedUri;
}

impl OntologyDatabaseType for DataType {
    fn table() -> &'static str {
        "data_types"
    }

    fn versioned_uri(&self) -> &VersionedUri {
        self.id()
    }
}

impl OntologyDatabaseType for PropertyType {
    fn table() -> &'static str {
        "property_types"
    }

    fn versioned_uri(&self) -> &VersionedUri {
        self.id()
    }
}

impl OntologyDatabaseType for EntityType {
    fn table() -> &'static str {
        "entity_types"
    }

    fn versioned_uri(&self) -> &VersionedUri {
        self.id()
    }
}
