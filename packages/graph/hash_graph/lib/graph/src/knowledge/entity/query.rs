use std::{borrow::Cow, fmt};

use error_stack::Report;
use serde::de;

use crate::{
    knowledge::Entity,
    ontology::EntityTypeQueryPath,
    store::query::{ParameterType, Path, QueryRecord, RecordPath},
};

#[derive(Debug, PartialEq, Eq)]
pub enum EntityQueryPath<'q> {
    Id,
    OwnedById,
    CreatedById,
    UpdatedById,
    RemovedById,
    Version,
    Type(EntityTypeQueryPath),
    Properties(Option<Cow<'q, str>>),
}

impl QueryRecord for Entity {
    type Path<'q> = EntityQueryPath<'q>;
}

impl fmt::Display for EntityQueryPath<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Id => fmt.write_str("id"),
            Self::OwnedById => fmt.write_str("ownedById"),
            Self::CreatedById => fmt.write_str("createdById"),
            Self::UpdatedById => fmt.write_str("updatedById"),
            Self::RemovedById => fmt.write_str("removedById"),
            Self::Version => fmt.write_str("version"),
            Self::Type(path) => write!(fmt, "type.{path}"),
            Self::Properties(Some(property)) => write!(fmt, "properties.{property}"),
            Self::Properties(None) => fmt.write_str("properties"),
        }
    }
}

impl RecordPath for EntityQueryPath<'_> {
    fn expected_type(&self) -> ParameterType {
        match self {
            Self::Id | Self::OwnedById | Self::CreatedById | Self::UpdatedById => {
                ParameterType::Uuid
            }
            Self::RemovedById => ParameterType::Uuid,
            Self::Version => ParameterType::Timestamp,
            Self::Type(path) => path.expected_type(),
            Self::Properties(_) => ParameterType::Any,
        }
    }
}

impl<'q> TryFrom<Path> for EntityQueryPath<'q> {
    type Error = Report<de::value::Error>;

    fn try_from(_path: Path) -> Result<Self, Self::Error> {
        todo!("https://app.asana.com/0/1203007126736607/1203167266370358/f")
    }
}
