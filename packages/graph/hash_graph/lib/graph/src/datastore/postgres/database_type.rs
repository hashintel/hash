use crate::types::{
    schema::{DataType, EntityType, PropertyType},
    VersionedUri,
};

pub trait DatabaseType {
    fn uri(&self) -> &VersionedUri;

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
