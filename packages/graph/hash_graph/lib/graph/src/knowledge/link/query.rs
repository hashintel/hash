use std::fmt;

use error_stack::Report;
use serde::de;

use crate::{
    knowledge::{entity::EntityQueryPath, Link},
    ontology::LinkTypeQueryPath,
    store::query::{ParameterType, Path, QueryRecord, RecordPath},
};

// TODO: To be removed, see https://app.asana.com/0/1200211978612931/1203250001255259/f
#[derive(Debug, PartialEq, Eq)]
pub enum LinkQueryPath<'q> {
    OwnedById,
    CreatedById,
    Type(LinkTypeQueryPath),
    Source(Option<EntityQueryPath<'q>>),
    Target(Option<EntityQueryPath<'q>>),
    Index,
}

impl QueryRecord for Link {
    type Path<'q> = LinkQueryPath<'q>;
}

impl fmt::Display for LinkQueryPath<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::OwnedById => fmt.write_str("ownedById"),
            Self::CreatedById => fmt.write_str("createdById"),
            Self::Type(path) => write!(fmt, "type.{path}"),
            Self::Source(None) => fmt.write_str("source"),
            Self::Source(Some(path)) => write!(fmt, "source.{path}"),
            Self::Target(None) => fmt.write_str("target"),
            Self::Target(Some(path)) => write!(fmt, "target.{path}"),
            Self::Index => fmt.write_str("index"),
        }
    }
}

impl RecordPath for LinkQueryPath<'_> {
    fn expected_type(&self) -> ParameterType {
        match self {
            Self::OwnedById | Self::CreatedById | Self::Source(None) | Self::Target(None) => {
                ParameterType::Uuid
            }
            Self::Type(path) => path.expected_type(),
            Self::Source(Some(path)) | Self::Target(Some(path)) => path.expected_type(),
            Self::Index => ParameterType::Number,
        }
    }
}

impl<'q> TryFrom<Path> for LinkQueryPath<'q> {
    type Error = Report<de::value::Error>;

    fn try_from(_path: Path) -> Result<Self, Self::Error> {
        todo!("https://app.asana.com/0/0/1203167266370359/f")
    }
}
