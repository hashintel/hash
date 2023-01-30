use std::fmt;

use serde::{
    de::{self, SeqAccess, Visitor},
    Deserialize, Deserializer,
};
use utoipa::ToSchema;

use crate::{
    ontology::{EntityTypeQueryPath, EntityTypeQueryPathVisitor},
    store::query::{JsonPath, ParameterType, PathToken, QueryPath},
};

#[derive(Debug, PartialEq, Eq)]
pub enum EntityQueryPath<'p> {
    /// The [`EntityUuid`] of the [`EntityId`] belonging to the [`Entity`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// let path = EntityQueryPath::deserialize(json!(["uuid"]))?;
    /// assert_eq!(path, EntityQueryPath::Uuid);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityUuid`]: crate::knowledge::EntityUuid
    /// [`EntityId`]: crate::identifier::knowledge::EntityId
    /// [`Entity`]: crate::knowledge::Entity
    Uuid,
    /// The [`OwnedById`] of the [`EntityId`] belonging to the [`Entity`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// let path = EntityQueryPath::deserialize(json!(["ownedById"]))?;
    /// assert_eq!(path, EntityQueryPath::OwnedById);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`OwnedById`]: crate::provenance::OwnedById
    /// [`EntityId`]: crate::identifier::knowledge::EntityId
    /// [`Entity`]: crate::knowledge::Entity
    OwnedById,
    /// The [`EntityRecordId`] of the [`EntityRecordId`] belonging to the [`Entity`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// let path = EntityQueryPath::deserialize(json!(["recordId"]))?;
    /// assert_eq!(path, EntityQueryPath::RecordId);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityEditionId`]: crate::identifier::knowledge::EntityEditionId
    /// [`EntityRevisionId`]: crate::identifier::knowledge::EntityRevisionId
    /// [`Entity`]: crate::knowledge::Entity
    RecordId,
    /// The decision time axis of the [`EntityVersion`] belonging to the [`Entity`].
    ///
    /// To query for an [`EntityVersion`] the time projection is specified on the
    /// [`StructuralQuery`].
    ///
    /// [`StructuralQuery`]: crate::shared::subgraph::query::StructuralQuery
    /// [`EntityVersion`]: crate::identifier::knowledge::EntityVersion
    /// [`Entity`]: crate::knowledge::Entity
    DecisionTime,
    /// The transaction time axis of the [`EntityVersion`] belonging to the [`Entity`].
    ///
    /// To query for an [`EntityVersion`] the time projection is specified on the
    /// [`StructuralQuery`].
    ///
    /// [`StructuralQuery`]: crate::shared::subgraph::query::StructuralQuery
    /// [`EntityVersion`]: crate::identifier::knowledge::EntityVersion
    /// [`Entity`]: crate::knowledge::Entity
    TransactionTime,
    /// Whether or not the [`Entity`] is archived.
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// let path = EntityQueryPath::deserialize(json!(["archived"]))?;
    /// assert_eq!(path, EntityQueryPath::Archived);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`Entity`]: crate::knowledge::Entity
    Archived,
    /// The [`UpdatedById`] of the [`ProvenanceMetadata`] belonging to the [`Entity`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// let path = EntityQueryPath::deserialize(json!(["updatedById"]))?;
    /// assert_eq!(path, EntityQueryPath::UpdatedById);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`UpdatedById`]: crate::provenance::UpdatedById
    /// [`ProvenanceMetadata`]: crate::provenance::ProvenanceMetadata
    /// [`Entity`]: crate::knowledge::Entity
    UpdatedById,
    /// The [`EntityType`] of the [`EntityMetadata`] belonging to the [`Entity`].
    ///
    /// Deserializes from `["type", ...]` where `...` is a path to a field of an [`EntityType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::{knowledge::EntityQueryPath, ontology::EntityTypeQueryPath};
    /// let path = EntityQueryPath::deserialize(json!(["type", "baseUri"]))?;
    /// assert_eq!(path, EntityQueryPath::Type(EntityTypeQueryPath::BaseUri));
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`Entity`]: crate::knowledge::Entity
    /// [`EntityMetadata`]: crate::knowledge::EntityMetadata
    /// [`EntityType`]: type_system::EntityType
    Type(EntityTypeQueryPath<'p>),
    /// Represents an [`Entity`] linking to the [`Entity`].
    ///
    /// Deserializes from `["incomingLinks", ...]` where `...` is the path of the source
    /// [`Entity`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// let path = EntityQueryPath::deserialize(json!(["incomingLinks", "uuid"]))?;
    /// assert_eq!(
    ///     path,
    ///     EntityQueryPath::IncomingLinks(Box::new(EntityQueryPath::Uuid))
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`Entity`]: crate::knowledge::Entity
    IncomingLinks(Box<Self>),
    /// Represents an [`Entity`] linked from the [`Entity`].
    ///
    /// Deserializes from `["outgoingLinks", ...]` where `...` is the path of the target
    /// [`Entity`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// let path = EntityQueryPath::deserialize(json!(["outgoingLinks", "uuid"]))?;
    /// assert_eq!(
    ///     path,
    ///     EntityQueryPath::OutgoingLinks(Box::new(EntityQueryPath::Uuid))
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`Entity`]: crate::knowledge::Entity
    OutgoingLinks(Box<Self>),
    /// Corresponds to the entity specified by [`LinkData::left_entity_id()`].
    ///
    /// Deserializes from `["leftEntity", ...]` where `...` is the path of the left [`Entity`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// let path = EntityQueryPath::deserialize(json!(["leftEntity", "uuid"]))?;
    /// assert_eq!(
    ///     path,
    ///     EntityQueryPath::LeftEntity(Box::new(EntityQueryPath::Uuid))
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`Entity`]: crate::knowledge::Entity
    /// [`LinkData::left_entity_id()`]: crate::knowledge::LinkData::left_entity_id
    LeftEntity(Box<Self>),
    /// Corresponds to the entity specified by [`LinkData::right_entity_id()`].
    ///
    /// Deserializes from `["leftEntity", ...]` where `...` is the path of the right [`Entity`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// let path = EntityQueryPath::deserialize(json!(["rightEntity", "uuid"]))?;
    /// assert_eq!(
    ///     path,
    ///     EntityQueryPath::RightEntity(Box::new(EntityQueryPath::Uuid))
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`Entity`]: crate::knowledge::Entity
    /// [`LinkData::right_entity_id()`]: crate::knowledge::LinkData::right_entity_id
    RightEntity(Box<Self>),
    /// Corresponds to [`LinkData::left_to_right_order()`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// let path = EntityQueryPath::deserialize(json!(["leftToRightOrder"]))?;
    /// assert_eq!(path, EntityQueryPath::LeftToRightOrder);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`LinkData::left_to_right_order()`]: crate::knowledge::LinkData::left_to_right_order
    LeftToRightOrder,
    /// Corresponds to [`LinkData::right_to_left_order()`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// let path = EntityQueryPath::deserialize(json!(["rightToLeftOrder"]))?;
    /// assert_eq!(path, EntityQueryPath::RightToLeftOrder);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`LinkData::right_to_left_order()`]: crate::knowledge::LinkData::right_to_left_order
    RightToLeftOrder,
    /// Corresponds to [`Entity::properties()`].
    ///
    /// Deserializes from `["properties", ...]` where `...` is a path to a property URI of an
    /// [`Entity`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// let path = EntityQueryPath::deserialize(json!([
    ///     "properties",
    ///     "https://blockprotocol.org/@blockprotocol/types/property-type/address/",
    ///     0,
    ///     "street"
    /// ]))?;
    /// assert_eq!(
    ///     path.to_string(),
    ///     r#"properties.$."https://blockprotocol.org/@blockprotocol/types/property-type/address/"[0]."street""#
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`Entity`]: crate::knowledge::Entity
    /// [`Entity::properties()`]: crate::knowledge::Entity::properties
    Properties(Option<JsonPath<'p>>),
}

impl fmt::Display for EntityQueryPath<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Uuid => fmt.write_str("uuid"),
            Self::OwnedById => fmt.write_str("ownedById"),
            Self::UpdatedById => fmt.write_str("updatedById"),
            Self::RecordId => fmt.write_str("recordId"),
            Self::DecisionTime => fmt.write_str("decisionTime"),
            Self::TransactionTime => fmt.write_str("transactionTime"),
            Self::Archived => fmt.write_str("archived"),
            Self::Type(path) => write!(fmt, "type.{path}"),
            Self::Properties(Some(property)) => write!(fmt, "properties.{property}"),
            Self::Properties(None) => fmt.write_str("properties"),
            Self::IncomingLinks(link) => write!(fmt, "incomingLinks.{link}"),
            Self::OutgoingLinks(link) => write!(fmt, "outgoingLinks.{link}"),
            Self::LeftEntity(path) => write!(fmt, "leftEntityUuid.{path}"),
            Self::RightEntity(path) => write!(fmt, "rightEntityUuid.{path}"),
            Self::LeftToRightOrder => fmt.write_str("leftToRightOrder"),
            Self::RightToLeftOrder => fmt.write_str("rightToLeftOrder"),
        }
    }
}

impl QueryPath for EntityQueryPath<'_> {
    fn expected_type(&self) -> ParameterType {
        match self {
            Self::Uuid | Self::OwnedById | Self::UpdatedById => ParameterType::Uuid,
            Self::RecordId => ParameterType::UnsignedInteger,
            Self::LeftEntity(path)
            | Self::RightEntity(path)
            | Self::IncomingLinks(path)
            | Self::OutgoingLinks(path) => path.expected_type(),
            Self::DecisionTime | Self::TransactionTime => ParameterType::TimeInterval,
            Self::Type(path) => path.expected_type(),
            Self::Properties(_) => ParameterType::Any,
            Self::LeftToRightOrder | Self::RightToLeftOrder => ParameterType::Number,
            Self::Archived => ParameterType::Boolean,
        }
    }
}

/// A single token in an [`EntityQueryPath`].
#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub enum EntityQueryToken {
    // TODO: we want to expose `EntityId` here instead
    Uuid,
    RecordId,
    Archived,
    OwnedById,
    UpdatedById,
    Type,
    Properties,
    IncomingLinks,
    OutgoingLinks,
    LeftEntity,
    RightEntity,
    LeftToRightOrder,
    RightToLeftOrder,
}

/// Deserializes an [`EntityQueryPath`] from a string sequence.
pub struct EntityQueryPathVisitor {
    /// The current position in the sequence when deserializing.
    position: usize,
}

impl EntityQueryPathVisitor {
    pub const EXPECTING: &'static str = "one of `uuid`, `recordId`, `archived`, `ownedById`, \
                                         `updatedById`, `type`, `properties`, `incomingLinks`, \
                                         `outgoingLinks`, `leftEntity`, `rightEntity`, \
                                         `leftToRightOrder`, `rightToLeftOrder`";

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
            EntityQueryToken::Uuid => EntityQueryPath::Uuid,
            EntityQueryToken::RecordId => EntityQueryPath::RecordId,
            EntityQueryToken::OwnedById => EntityQueryPath::OwnedById,
            EntityQueryToken::UpdatedById => EntityQueryPath::UpdatedById,
            EntityQueryToken::Archived => EntityQueryPath::Archived,
            EntityQueryToken::Type => EntityQueryPath::Type(
                EntityTypeQueryPathVisitor::new(self.position).visit_seq(seq)?,
            ),
            EntityQueryToken::Properties => {
                let mut path_tokens = Vec::new();
                while let Some(property) = seq.next_element::<PathToken<'de>>()? {
                    path_tokens.push(property);
                    self.position += 1;
                }

                if path_tokens.is_empty() {
                    EntityQueryPath::Properties(None)
                } else {
                    EntityQueryPath::Properties(Some(JsonPath::from_path_tokens(path_tokens)))
                }
            }
            EntityQueryToken::OutgoingLinks => {
                EntityQueryPath::OutgoingLinks(Box::new(Self::new(self.position).visit_seq(seq)?))
            }
            EntityQueryToken::IncomingLinks => {
                EntityQueryPath::IncomingLinks(Box::new(Self::new(self.position).visit_seq(seq)?))
            }
            EntityQueryToken::LeftEntity => {
                EntityQueryPath::LeftEntity(Box::new(Self::new(self.position).visit_seq(seq)?))
            }
            EntityQueryToken::RightEntity => {
                EntityQueryPath::RightEntity(Box::new(Self::new(self.position).visit_seq(seq)?))
            }
            EntityQueryToken::LeftToRightOrder => EntityQueryPath::LeftToRightOrder,
            EntityQueryToken::RightToLeftOrder => EntityQueryPath::RightToLeftOrder,
        })
    }
}

impl<'de: 'p, 'p> Deserialize<'de> for EntityQueryPath<'p> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_seq(EntityQueryPathVisitor::new(0))
    }
}

#[cfg(test)]
mod tests {
    use std::{borrow::Cow, iter::once};

    use super::*;

    fn deserialize<'p>(segments: impl IntoIterator<Item = &'p str>) -> EntityQueryPath<'p> {
        EntityQueryPath::deserialize(de::value::SeqDeserializer::<_, de::value::Error>::new(
            segments.into_iter(),
        ))
        .expect("could not deserialize path")
    }

    #[test]
    fn deserialization() {
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
            EntityQueryPath::Properties(Some(JsonPath::from_path_tokens(vec![PathToken::Field(
                Cow::Borrowed("https://blockprotocol.org/@alice/types/property-type/name/")
            )])))
        );
        assert_eq!(
            deserialize(["leftEntity", "uuid"]),
            EntityQueryPath::LeftEntity(Box::new(EntityQueryPath::Uuid))
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
                ["recordId", "test"].into_iter()
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
