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
    /// The [`EntityVersion`] of the [`EntityEditionId`] belonging to the [`Entity`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// let path = EntityQueryPath::deserialize(json!(["version"]))?;
    /// assert_eq!(path, EntityQueryPath::Version);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// In addition to specifying the version directly, it's also possible to compare the version
    /// with a `"latest"` parameter, which will only match the latest version of the [`Entity`].
    ///
    /// ```rust
    /// # use std::borrow::Cow;
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::{Entity, EntityQueryPath};
    /// # use graph::store::query::{Filter, FilterExpression, Parameter};
    /// let filter_value = json!({ "equal": [{ "path": ["version"] }, { "parameter": "latest" }] });
    /// let path = Filter::<Entity>::deserialize(filter_value)?;
    /// assert_eq!(path, Filter::Equal(
    ///     Some(FilterExpression::Path(EntityQueryPath::Version)),
    ///     Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed("latest")))))
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// ```rust
    /// # use std::borrow::Cow;
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use type_system::DataType;
    /// # use graph::{store::query::{Filter, FilterExpression, Parameter}, ontology::DataTypeQueryPath};
    /// let filter_value = json!({ "equal": [{ "path": ["version"] }, { "parameter": "latest" }] });
    /// let path = Filter::<DataType>::deserialize(filter_value)?;
    /// assert_eq!(path, Filter::Equal(
    ///     Some(FilterExpression::Path(DataTypeQueryPath::Version)),
    ///     Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed("latest")))))
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// Typically, this is a timestamp, but also `"latest"` can be specified as a parameter.
    ///
    /// [`EntityVersion`]: crate::identifier::knowledge::EntityVersion
    /// [`EntityEditionId`]: crate::identifier::knowledge::EntityEditionId
    /// [`Entity`]: crate::knowledge::Entity
    Version,
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
    /// The [`CreatedById`] of the [`ProvenanceMetadata`] belonging to the [`Entity`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// let path = EntityQueryPath::deserialize(json!(["createdById"]))?;
    /// assert_eq!(path, EntityQueryPath::CreatedById);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`CreatedById`]: crate::provenance::CreatedById
    /// [`ProvenanceMetadata`]: crate::provenance::ProvenanceMetadata
    /// [`Entity`]: crate::knowledge::Entity
    CreatedById,
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
    Type(EntityTypeQueryPath),
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
    /// Corresponds to the entity specified by [`LinkEntityMetadata::left_entity_id()`].
    ///
    /// It's `None` if this entity is not a link.
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
    ///     EntityQueryPath::LeftEntity(Some(Box::new(EntityQueryPath::Uuid)))
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`Entity`]: crate::knowledge::Entity
    /// [`LinkEntityMetadata::left_entity_id()`]: crate::knowledge::LinkEntityMetadata::left_entity_id
    LeftEntity(Box<Self>),
    /// Corresponds to the entity specified by [`LinkEntityMetadata::right_entity_id()`].
    ///
    /// It's `None` if this entity is not a link.
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
    ///     EntityQueryPath::RightEntity(Some(Box::new(EntityQueryPath::Uuid)))
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`Entity`]: crate::knowledge::Entity
    /// [`LinkEntityMetadata::right_entity_id()`]: crate::knowledge::LinkEntityMetadata::right_entity_id
    RightEntity(Box<Self>),
    /// Corresponds to [`LinkEntityMetadata::left_order()`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// let path = EntityQueryPath::deserialize(json!(["leftOrder"]))?;
    /// assert_eq!(path, EntityQueryPath::LeftOrder);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`LinkEntityMetadata::left_order()`]: crate::knowledge::LinkEntityMetadata::left_order
    LeftOrder,
    /// Corresponds to [`LinkEntityMetadata::right_order()`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// let path = EntityQueryPath::deserialize(json!(["rightOrder"]))?;
    /// assert_eq!(path, EntityQueryPath::RightOrder);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`LinkEntityMetadata::right_order()`]: crate::knowledge::LinkEntityMetadata::right_order
    RightOrder,
    /// Corresponds to [`Entity::properties()`].
    ///
    /// Deserializes from `["properties", ...]` where `...` is a path to a property URI of an
    /// [`Entity`].
    ///
    /// ```rust
    /// # use std::borrow::Cow;
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// let path = EntityQueryPath::deserialize(json!([
    ///     "properties",
    ///     "https://blockprotocol.org/@blockprotocol/types/property-type/name/"
    /// ]))?;
    /// assert_eq!(
    ///     path,
    ///     EntityQueryPath::Properties(Some(Cow::Borrowed(
    ///         "https://blockprotocol.org/@blockprotocol/types/property-type/name/"
    ///     )))
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`Entity`]: crate::knowledge::Entity
    /// [`Entity::properties()`]: crate::knowledge::Entity::properties
    Properties(Option<Cow<'q, str>>),
}

impl QueryRecord for Entity {
    type Path<'q> = EntityQueryPath<'q>;
}

impl fmt::Display for EntityQueryPath<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Uuid => fmt.write_str("uuid"),
            Self::OwnedById => fmt.write_str("ownedById"),
            Self::CreatedById => fmt.write_str("createdById"),
            Self::UpdatedById => fmt.write_str("updatedById"),
            Self::Version => fmt.write_str("version"),
            Self::Archived => fmt.write_str("archived"),
            Self::Type(path) => write!(fmt, "type.{path}"),
            Self::Properties(Some(property)) => write!(fmt, "properties.{property}"),
            Self::Properties(None) => fmt.write_str("properties"),
            Self::IncomingLinks(link) => write!(fmt, "incomingLinks.{link}"),
            Self::OutgoingLinks(link) => write!(fmt, "outgoingLinks.{link}"),
            Self::LeftEntity(path) => write!(fmt, "leftEntityUuid.{path}"),
            Self::RightEntity(path) => write!(fmt, "rightEntityUuid.{path}"),
            Self::LeftOrder => fmt.write_str("leftOrder"),
            Self::RightOrder => fmt.write_str("rightOrder"),
        }
    }
}

impl RecordPath for EntityQueryPath<'_> {
    fn expected_type(&self) -> ParameterType {
        match self {
            Self::Uuid | Self::OwnedById | Self::CreatedById | Self::UpdatedById => {
                ParameterType::Uuid
            }
            Self::LeftEntity(path)
            | Self::RightEntity(path)
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
    // TODO: we want to expose `EntityId` here instead
    Uuid,
    Version,
    Archived,
    OwnedById,
    CreatedById,
    UpdatedById,
    Type,
    Properties,
    IncomingLinks,
    OutgoingLinks,
    LeftEntity,
    RightEntity,
    LeftOrder,
    RightOrder,
}

/// Deserializes an [`EntityQueryPath`] from a string sequence.
pub struct EntityQueryPathVisitor {
    /// The current position in the sequence when deserializing.
    position: usize,
}

impl EntityQueryPathVisitor {
    pub const EXPECTING: &'static str = "one of `uuid`, `version`, `archived`, `ownedById`, \
                                         `createdById`, `updatedById`, `type`, `properties`, \
                                         `incomingLinks`, `outgoingLinks`, `leftEntity`, \
                                         `rightEntity`, `leftOrder`, `rightOrder`";

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
            EntityQueryToken::OwnedById => EntityQueryPath::OwnedById,
            EntityQueryToken::CreatedById => EntityQueryPath::CreatedById,
            EntityQueryToken::UpdatedById => EntityQueryPath::UpdatedById,
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
            EntityQueryToken::LeftEntity => {
                EntityQueryPath::LeftEntity(Box::new(Self::new(self.position).visit_seq(seq)?))
            }
            EntityQueryToken::RightEntity => {
                EntityQueryPath::RightEntity(Box::new(Self::new(self.position).visit_seq(seq)?))
            }
            EntityQueryToken::LeftOrder => EntityQueryPath::LeftOrder,
            EntityQueryToken::RightOrder => EntityQueryPath::RightOrder,
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
