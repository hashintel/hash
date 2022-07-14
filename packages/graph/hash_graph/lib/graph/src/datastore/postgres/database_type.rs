use crate::types::{
    schema::{DataType, EntityType, PropertyType},
    VersionedUri,
};

pub trait DatabaseType {
    fn id(&self) -> &VersionedUri;

    fn table() -> &'static str;
}

impl DatabaseType for DataType {
    fn id(&self) -> &VersionedUri {
        DataType::id(self)
    }

    fn table() -> &'static str {
        "data_types"
    }
}

impl DatabaseType for PropertyType {
    fn id(&self) -> &VersionedUri {
        PropertyType::id(self)
    }

    fn table() -> &'static str {
        "property_types"
    }
}

impl DatabaseType for EntityType {
    fn id(&self) -> &VersionedUri {
        EntityType::id(self)
    }

    fn table() -> &'static str {
        "entity_types"
    }
}
