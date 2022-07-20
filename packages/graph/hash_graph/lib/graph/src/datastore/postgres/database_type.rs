use crate::types::{
    schema::{DataType, EntityType, LinkType, PropertyType},
    VersionedUri,
};

/// Provides an abstraction over elements of the Type System stored in the Database.
///
/// [`PostgresDatabase`]: crate::datastore::PostgresDatabase
pub trait DatabaseType {
    /// Returns the unique versioned URI used to identify this instance of a type.
    fn uri(&self) -> &VersionedUri;

    /// Returns the name of the table where this type is stored.
    fn table() -> &'static str;
}

impl DatabaseType for DataType {
    fn uri(&self) -> &VersionedUri {
        self.id()
    }

    fn table() -> &'static str {
        "data_types"
    }
}

impl DatabaseType for PropertyType {
    fn uri(&self) -> &VersionedUri {
        self.id()
    }

    fn table() -> &'static str {
        "property_types"
    }
}

impl DatabaseType for EntityType {
    fn uri(&self) -> &VersionedUri {
        self.id()
    }

    fn table() -> &'static str {
        "entity_types"
    }
}

impl DatabaseType for LinkType {
    fn uri(&self) -> &VersionedUri {
        self.id()
    }

    fn table() -> &'static str {
        "link_types"
    }
}
