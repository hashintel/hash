use error_stack::Report;
use serde::de;
use type_system::LinkType;

use crate::store::query::{Path, QueryRecord};

#[derive(Debug, PartialEq, Eq)]
pub enum LinkTypeQueryPath {
    OwnedById,
    BaseUri,
    VersionedUri,
    Version,
    Title,
    Description,
    RelatedKeywords,
}

impl QueryRecord for LinkType {
    type Path<'q> = LinkTypeQueryPath;
}

impl TryFrom<Path> for LinkTypeQueryPath {
    type Error = Report<de::value::Error>;

    fn try_from(_path: Path) -> Result<Self, Self::Error> {
        todo!("https://app.asana.com/0/1203007126736607/1203167266370357/f")
    }
}
