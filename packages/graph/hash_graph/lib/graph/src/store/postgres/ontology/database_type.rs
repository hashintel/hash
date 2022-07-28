use crate::ontology::types::{DataType, EntityType, LinkType, OntologyType, PropertyType};

/// Provides an abstraction over elements of the Type System stored in the Database.
///
/// [`PostgresDatabase`]: crate::store::PostgresDatabase
pub trait OntologyDatabaseType: OntologyType {
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

impl OntologyDatabaseType for LinkType {
    fn table() -> &'static str {
        "link_types"
    }
}
