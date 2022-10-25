use error_stack::Report;
use serde::de;
use type_system::EntityType;

use crate::{
    ontology::{LinkTypeQueryPath, PropertyTypeQueryPath},
    store::query::{Path, QueryRecord},
};

#[derive(Debug, PartialEq, Eq)]
pub enum EntityTypeQueryPath {
    OwnedById,
    BaseUri,
    VersionedUri,
    Version,
    Title,
    Description,
    Default,
    Examples,
    Properties(PropertyTypeQueryPath),
    Required,
    Links(LinkTypeQueryPath),
    RequiredLinks,
}

impl QueryRecord for EntityType {
    type Path<'q> = EntityTypeQueryPath;
}

impl TryFrom<Path> for EntityTypeQueryPath {
    type Error = Report<de::value::Error>;

    fn try_from(_path: Path) -> Result<Self, Self::Error> {
        todo!("https://app.asana.com/0/1203007126736607/1203167266370356/f")
    }
}
