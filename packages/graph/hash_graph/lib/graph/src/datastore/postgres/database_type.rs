use crate::types::{
    schema::{DataType, EntityType, PropertyType},
    VersionedUri,
};

pub trait DataBaseType {
    fn id(&self) -> &VersionedUri;

    fn table() -> &'static str;
}

impl DataBaseType for DataType {
    fn id(&self) -> &VersionedUri {
        DataType::id(self)
    }

    fn table() -> &'static str {
        "data_types"
    }
}

impl DataBaseType for PropertyType {
    fn id(&self) -> &VersionedUri {
        PropertyType::id(self)
    }

    fn table() -> &'static str {
        "property_types"
    }
}

impl DataBaseType for EntityType {
    fn id(&self) -> &VersionedUri {
        EntityType::id(self)
    }

    fn table() -> &'static str {
        "entity_types"
    }
}
