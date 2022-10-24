use error_stack::Report;
use serde::de;
use type_system::PropertyType;

use crate::{
    ontology::DataTypeQueryPath,
    store::query::{Path, QueryRecord},
};

#[derive(Debug, PartialEq, Eq)]
pub enum PropertyTypeQueryPath<'q> {
    OwnedById,
    BaseUri,
    VersionedUri,
    Version,
    Title,
    Description,
    DataTypes(DataTypeQueryPath<'q>),
    PropertyTypes(Box<Self>),
}

impl QueryRecord for PropertyType {
    type Path<'q> = PropertyTypeQueryPath<'q>;
}

impl<'q> TryFrom<Path> for PropertyTypeQueryPath<'q> {
    type Error = Report<de::value::Error>;

    fn try_from(_path: Path) -> Result<Self, Self::Error> {
        todo!("https://app.asana.com/0/1203007126736607/1203167266370354/f")
    }
}
