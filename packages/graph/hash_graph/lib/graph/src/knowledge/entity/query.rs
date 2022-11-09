use std::{borrow::Cow, fmt};

use serde::{
    de::{self, SeqAccess, Visitor},
    Deserialize, Deserializer,
};

use crate::{
    knowledge::Entity,
    ontology::{EntityTypeQueryPath, EntityTypeQueryPathVisitor},
    store::query::{ParameterType, QueryRecord, RecordPath},
};

#[derive(Debug, PartialEq, Eq)]
pub enum EntityQueryPath<'q> {
    Id,
    OwnedById,
    CreatedById,
    UpdatedById,
    RemovedById,
    Version,
    Archived,
    Type(EntityTypeQueryPath),
    Properties(Option<Cow<'q, str>>),
    IncomingLinks(Box<Self>),
    OutgoingLinks(Box<Self>),
    LeftEntity(Option<Box<Self>>),
    RightEntity(Option<Box<Self>>),
    LeftOrder,
    RightOrder,
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
            Self::Archived => fmt.write_str("archived"),
            Self::Type(path) => write!(fmt, "type.{path}"),
            Self::Properties(Some(property)) => write!(fmt, "properties.{property}"),
            Self::Properties(None) => fmt.write_str("properties"),
            Self::IncomingLinks(link) => write!(fmt, "incomingLinks.{link}"),
            Self::OutgoingLinks(link) => write!(fmt, "outgoingLinks.{link}"),
            Self::LeftEntity(Some(path)) => write!(fmt, "leftEntityUuid.{path}"),
            Self::LeftEntity(None) => fmt.write_str("leftEntityUuid"),
            Self::RightEntity(Some(path)) => write!(fmt, "rightEntityUuid.{path}"),
            Self::RightEntity(None) => fmt.write_str("rightEntityUuid"),
            Self::LeftOrder => fmt.write_str("leftOrder"),
            Self::RightOrder => fmt.write_str("rightOrder"),
        }
    }
}

impl RecordPath for EntityQueryPath<'_> {
    fn expected_type(&self) -> ParameterType {
        match self {
            Self::Id
            | Self::OwnedById
            | Self::CreatedById
            | Self::UpdatedById
            | Self::RemovedById
            | Self::LeftEntity(None)
            | Self::RightEntity(None) => ParameterType::Uuid,
            Self::LeftEntity(Some(path))
            | Self::RightEntity(Some(path))
            | Self::IncomingLinks(path)
            | Self::OutgoingLinks(path) => path.expected_type(),
            Self::Version => ParameterType::Timestamp,
            Self::Type(path) => path.expected_type(),
            Self::Properties(_) => ParameterType::Any,
            Self::LeftOrder | Self::RightOrder => ParameterType::Number,
            Self::Archived => ParameterType::Boolean,
        }
    }
}

/// A single token in an [`EntityQueryPath`].
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EntityQueryToken {
    Id,
    OwnedById,
    CreatedById,
    UpdatedById,
    RemovedById,
    Version,
    Archived,
    Type,
    Properties,
    IncomingLinks,
    OutgoingLinks,
    LeftEntity,
    RightEntity,
}

/// Deserializes an [`EntityQueryPath`] from a string sequence.
pub struct EntityQueryPathVisitor {
    /// The current position in the sequence when deserializing.
    position: usize,
}

impl EntityQueryPathVisitor {
    pub const EXPECTING: &'static str = "one of `id`, `ownedById`, `createdById`, `updatedById`, \
                                         `removedById`, `version`, `archived`, `type`, \
                                         `properties`, `incomingLinks`, `outgoingLinks`, \
                                         `leftEntity`, `rightEntity`";

    #[must_use]
    pub const fn new(position: usize) -> Self {
        Self { position }
    }
}

impl<'de> Visitor<'de> for EntityQueryPathVisitor {
    type Value = EntityQueryPath<'de>;

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str(Self::EXPECTING)
    }

    fn visit_seq<A>(mut self, mut seq: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let token = seq
            .next_element()?
            .ok_or_else(|| de::Error::invalid_length(self.position, &self))?;
        self.position += 1;

        Ok(match token {
            EntityQueryToken::Id => EntityQueryPath::Id,
            EntityQueryToken::OwnedById => EntityQueryPath::OwnedById,
            EntityQueryToken::CreatedById => EntityQueryPath::CreatedById,
            EntityQueryToken::UpdatedById => EntityQueryPath::UpdatedById,
            EntityQueryToken::RemovedById => EntityQueryPath::RemovedById,
            EntityQueryToken::Version => EntityQueryPath::Version,
            EntityQueryToken::Archived => EntityQueryPath::Archived,
            EntityQueryToken::Type => EntityQueryPath::Type(
                EntityTypeQueryPathVisitor::new(self.position).visit_seq(seq)?,
            ),
            EntityQueryToken::Properties => {
                let property = seq
                    .next_element()?
                    .ok_or_else(|| de::Error::invalid_length(self.position, &self))?;
                EntityQueryPath::Properties(Some(property))
            }
            EntityQueryToken::OutgoingLinks => {
                EntityQueryPath::OutgoingLinks(Box::new(Self::new(self.position).visit_seq(seq)?))
            }
            EntityQueryToken::IncomingLinks => {
                EntityQueryPath::IncomingLinks(Box::new(Self::new(self.position).visit_seq(seq)?))
            }
            EntityQueryToken::LeftEntity => EntityQueryPath::LeftEntity(Some(Box::new(
                Self::new(self.position).visit_seq(seq)?,
            ))),
            EntityQueryToken::RightEntity => EntityQueryPath::RightEntity(Some(Box::new(
                Self::new(self.position).visit_seq(seq)?,
            ))),
        })
    }
}

impl<'de: 'q, 'q> Deserialize<'de> for EntityQueryPath<'q> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_seq(EntityQueryPathVisitor::new(0))
    }
}

#[cfg(test)]
mod tests {
    use std::iter::once;

    use super::*;

    fn deserialize<'q>(segments: impl IntoIterator<Item = &'q str>) -> EntityQueryPath<'q> {
        EntityQueryPath::deserialize(de::value::SeqDeserializer::<_, de::value::Error>::new(
            segments.into_iter(),
        ))
        .expect("could not deserialize path")
    }

    #[test]
    fn deserialization() {
        assert_eq!(deserialize(["version"]), EntityQueryPath::Version);
        assert_eq!(deserialize(["ownedById"]), EntityQueryPath::OwnedById);
        assert_eq!(
            deserialize(["type", "version"]),
            EntityQueryPath::Type(EntityTypeQueryPath::Version)
        );
        assert_eq!(
            deserialize([
                "properties",
                "https://blockprotocol.org/@alice/types/property-type/name/"
            ]),
            EntityQueryPath::Properties(Some(Cow::Borrowed(
                "https://blockprotocol.org/@alice/types/property-type/name/"
            )))
        );
        assert_eq!(
            deserialize(["leftEntity", "id"]),
            EntityQueryPath::LeftEntity(Some(Box::new(EntityQueryPath::Id)))
        );

        assert_eq!(
            EntityQueryPath::deserialize(de::value::SeqDeserializer::<_, de::value::Error>::new(
                once("invalid")
            ))
            .expect_err(
                "managed to convert entity query path with hidden token when it should have \
                 errored"
            )
            .to_string(),
            format!(
                "unknown variant `invalid`, expected {}",
                EntityQueryPathVisitor::EXPECTING
            )
        );

        assert_eq!(
            EntityQueryPath::deserialize(de::value::SeqDeserializer::<_, de::value::Error>::new(
                ["version", "test"].into_iter()
            ))
            .expect_err(
                "managed to convert entity query path with multiple tokens when it should have \
                 errored"
            )
            .to_string(),
            "invalid length 2, expected 1 element in sequence"
        );
    }
}
