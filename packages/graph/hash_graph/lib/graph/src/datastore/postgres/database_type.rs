use crate::types::{
    schema::{DataType, EntityType, PropertyType},
    VersionedUri,
};

/// A type, which is stored in a [`PostgresDatabase`].
///
/// [`PostgresDatabase`]: crate::datastore::PostgresDatabase
pub trait DatabaseType {
    /// Returns the identifying ID of this type.
    fn uri(&self) -> &VersionedUri;

    /// Returns the table, where this type is stored.
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
