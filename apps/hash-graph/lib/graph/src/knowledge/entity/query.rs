use std::fmt;

use serde::{
    de::{self, SeqAccess, Visitor},
    Deserialize, Deserializer,
};
use utoipa::ToSchema;

use crate::{
    ontology::{EntityTypeQueryPath, EntityTypeQueryPathVisitor},
    store::query::{JsonPath, ParameterType, PathToken, QueryPath},
    subgraph::edges::{KnowledgeGraphEdgeKind, SharedEdgeKind},
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
    /// The [`EntityEditionId`] of the [`EntityRecordId`] belonging to the [`Entity`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// let path = EntityQueryPath::deserialize(json!(["editionId"]))?;
    /// assert_eq!(path, EntityQueryPath::EditionId);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityEditionId`]: crate::identifier::knowledge::EntityEditionId
    /// [`EntityRecordId`]: crate::identifier::knowledge::EntityRecordId
    /// [`Entity`]: crate::knowledge::Entity
    EditionId,
    /// The decision time axis of the [`EntityTemporalMetadata`] belonging to the [`Entity`].
    ///
    /// It's not possible to query for the temporal axis directly, this has to be done via the
    /// `temporalAxes` parameter on [`StructuralQuery`]. The decision time is returned as part of
    /// [`EntityTemporalMetadata`] of the [`EntityMetadata`].
    ///
    /// [`StructuralQuery`]: crate::subgraph::query::StructuralQuery
    /// [`EntityMetadata`]: crate::knowledge::EntityMetadata
    /// [`EntityTemporalMetadata`]: crate::identifier::knowledge::EntityTemporalMetadata
    /// [`Entity`]: crate::knowledge::Entity
    DecisionTime,
    /// The transaction time axis of the [`EntityTemporalMetadata`] belonging to the [`Entity`].
    ///
    /// It's not possible to query for the temporal axis directly, this has to be done via the
    /// `temporalAxes` parameter on [`StructuralQuery`]. The transaction time is returned as part
    /// of [`EntityTemporalMetadata`] of the [`EntityMetadata`].
    ///
    /// [`StructuralQuery`]: crate::subgraph::query::StructuralQuery
    /// [`EntityMetadata`]: crate::knowledge::EntityMetadata
    /// [`EntityTemporalMetadata`]: crate::identifier::knowledge::EntityTemporalMetadata
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
    /// The [`RecordCreatedById`] of the [`ProvenanceMetadata`] belonging to the [`Entity`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// let path = EntityQueryPath::deserialize(json!(["recordCreatedById"]))?;
    /// assert_eq!(path, EntityQueryPath::RecordCreatedById);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`RecordCreatedById`]: crate::provenance::RecordCreatedById
    /// [`ProvenanceMetadata`]: crate::provenance::ProvenanceMetadata
    /// [`Entity`]: crate::knowledge::Entity
    RecordCreatedById,
    /// An edge from this [`Entity`] to it's [`EntityType`] using a [`SharedEdgeKind`].
    ///
    /// The corresponding reversed edge is [`EntityTypeQueryPath::EntityEdge`].
    ///
    /// Deserializes from `["type", ...]` where `...` is a path to a field of an [`EntityType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::{knowledge::EntityQueryPath, ontology::EntityTypeQueryPath};
    /// # use graph::subgraph::edges::SharedEdgeKind;
    /// let path = EntityQueryPath::deserialize(json!(["type", "baseUrl"]))?;
    /// assert_eq!(path, EntityQueryPath::EntityTypeEdge {
    ///     edge_kind: SharedEdgeKind::IsOfType,
    ///     path: EntityTypeQueryPath::BaseUrl,
    /// });
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityType`]: type_system::PropertyType
    /// [`Entity`]: crate::knowledge::Entity
    EntityTypeEdge {
        edge_kind: SharedEdgeKind,
        path: EntityTypeQueryPath<'p>,
    },
    /// An edge between two [`Entities`][`Entity`] using a [`KnowledgeGraphEdgeKind`].
    ///
    /// [`Entity`]: crate::knowledge::Entity
    ///
    ///
    /// # Left entity
    ///
    /// Corresponds to the [`Entity`] specified by [`LinkData::left_entity_id()`].
    ///
    /// Deserializes from `["leftEntity", ...]` where `...` is the path of the left [`Entity`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// # use graph::subgraph::edges::KnowledgeGraphEdgeKind;
    /// let path = EntityQueryPath::deserialize(json!(["leftEntity", "uuid"]))?;
    /// assert_eq!(path, EntityQueryPath::EntityEdge {
    ///     edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
    ///     path: Box::new(EntityQueryPath::Uuid),
    ///     reversed: false
    /// });
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`LinkData::left_entity_id()`]: crate::knowledge::LinkData::left_entity_id
    ///
    ///
    /// # Right entity
    ///
    /// Corresponds to the [`Entity`] specified by [`LinkData::right_entity_id()`].
    ///
    /// Deserializes from `["rightEntity", ...]` where `...` is the path of the left [`Entity`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// # use graph::subgraph::edges::KnowledgeGraphEdgeKind;
    /// let path = EntityQueryPath::deserialize(json!(["rightEntity", "uuid"]))?;
    /// assert_eq!(path, EntityQueryPath::EntityEdge {
    ///     edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
    ///     path: Box::new(EntityQueryPath::Uuid),
    ///     reversed: false
    /// });
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`LinkData::right_entity_id()`]: crate::knowledge::LinkData::right_entity_id
    ///
    ///
    /// # Incoming links
    ///
    /// Represents an [`Entity`] linked from this [`Entity`].
    ///
    /// Deserializes from `["incomingLinks", ...]` where `...` is the path of the target
    /// [`Entity`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// # use graph::subgraph::edges::KnowledgeGraphEdgeKind;
    /// let path = EntityQueryPath::deserialize(json!(["incomingLinks", "uuid"]))?;
    /// assert_eq!(path, EntityQueryPath::EntityEdge {
    ///     edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
    ///     path: Box::new(EntityQueryPath::Uuid),
    ///     reversed: true
    /// });
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    ///
    /// # Outgoing links
    ///
    /// Represents an [`Entity`] linked from this [`Entity`].
    ///
    /// Deserializes from `["outgoingLinks", ...]` where `...` is the path of the target
    /// [`Entity`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// # use graph::subgraph::edges::KnowledgeGraphEdgeKind;
    /// let path = EntityQueryPath::deserialize(json!(["outgoingLinks", "uuid"]))?;
    /// assert_eq!(path, EntityQueryPath::EntityEdge {
    ///     edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
    ///     path: Box::new(EntityQueryPath::Uuid),
    ///     reversed: true
    /// });
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    EntityEdge {
        edge_kind: KnowledgeGraphEdgeKind,
        path: Box<Self>,
        reversed: bool,
    },
    /// Corresponds to [`EntityLinkOrder::left_to_right`].
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
    /// [`EntityLinkOrder::left_to_right`]: crate::knowledge::EntityLinkOrder::left_to_right
    LeftToRightOrder,
    /// Corresponds to [`EntityLinkOrder::right_to_left`].
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
    /// [`EntityLinkOrder::right_to_left`]: crate::knowledge::EntityLinkOrder::right_to_left
    RightToLeftOrder,
    /// Corresponds to [`Entity::properties`].
    ///
    /// Deserializes from `["properties", ...]` where `...` is a path to a property URL of an
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
    /// [`Entity::properties`]: crate::knowledge::Entity::properties
    Properties(Option<JsonPath<'p>>),
}

impl fmt::Display for EntityQueryPath<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Uuid => fmt.write_str("uuid"),
            Self::OwnedById => fmt.write_str("ownedById"),
            Self::RecordCreatedById => fmt.write_str("recordCreatedById"),
            Self::EditionId => fmt.write_str("editionId"),
            Self::DecisionTime => fmt.write_str("decisionTime"),
            Self::TransactionTime => fmt.write_str("transactionTime"),
            Self::Archived => fmt.write_str("archived"),
            Self::Properties(Some(property)) => write!(fmt, "properties.{property}"),
            Self::Properties(None) => fmt.write_str("properties"),
            Self::EntityTypeEdge {
                edge_kind: SharedEdgeKind::IsOfType,
                path,
            } => write!(fmt, "type.{path}"),
            Self::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                path,
                reversed: false,
            } => write!(fmt, "leftEntity.{path}"),
            Self::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                path,
                reversed: false,
            } => write!(fmt, "rightEntity.{path}"),
            Self::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                path,
                reversed: true,
            } => write!(fmt, "outgoingLinks.{path}"),
            Self::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                path,
                reversed: true,
            } => write!(fmt, "incomingLinks.{path}"),
            Self::LeftToRightOrder => fmt.write_str("leftToRightOrder"),
            Self::RightToLeftOrder => fmt.write_str("rightToLeftOrder"),
        }
    }
}

impl QueryPath for EntityQueryPath<'_> {
    fn expected_type(&self) -> ParameterType {
        match self {
            Self::EditionId | Self::Uuid | Self::OwnedById | Self::RecordCreatedById => {
                ParameterType::Uuid
            }
            Self::DecisionTime | Self::TransactionTime => ParameterType::TimeInterval,
            Self::Properties(_) => ParameterType::Any,
            Self::LeftToRightOrder | Self::RightToLeftOrder => ParameterType::Number,
            Self::Archived => ParameterType::Boolean,
            Self::EntityTypeEdge { path, .. } => path.expected_type(),
            Self::EntityEdge { path, .. } => path.expected_type(),
        }
    }
}

/// A single token in an [`EntityQueryPath`].
#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub enum EntityQueryToken {
    // TODO: we want to expose `EntityId` here instead
    Uuid,
    EditionId,
    Archived,
    OwnedById,
    RecordCreatedById,
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
    pub const EXPECTING: &'static str = "one of `uuid`, `editionId`, `archived`, `ownedById`, \
                                         `recordCreatedById`, `type`, `properties`, \
                                         `incomingLinks`, `outgoingLinks`, `leftEntity`, \
                                         `rightEntity`, `leftToRightOrder`, `rightToLeftOrder`";

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
            EntityQueryToken::EditionId => EntityQueryPath::EditionId,
            EntityQueryToken::OwnedById => EntityQueryPath::OwnedById,
            EntityQueryToken::RecordCreatedById => EntityQueryPath::RecordCreatedById,
            EntityQueryToken::Archived => EntityQueryPath::Archived,
            EntityQueryToken::Type => EntityQueryPath::EntityTypeEdge {
                edge_kind: SharedEdgeKind::IsOfType,
                path: EntityTypeQueryPathVisitor::new(self.position).visit_seq(seq)?,
            },
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
            EntityQueryToken::LeftEntity => EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                path: Box::new(Self::new(self.position).visit_seq(seq)?),
                reversed: false,
            },
            EntityQueryToken::RightEntity => EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                path: Box::new(Self::new(self.position).visit_seq(seq)?),
                reversed: false,
            },
            EntityQueryToken::OutgoingLinks => EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                path: Box::new(Self::new(self.position).visit_seq(seq)?),
                reversed: true,
            },
            EntityQueryToken::IncomingLinks => EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                path: Box::new(Self::new(self.position).visit_seq(seq)?),
                reversed: true,
            },
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
            EntityQueryPath::EntityTypeEdge {
                edge_kind: SharedEdgeKind::IsOfType,
                path: EntityTypeQueryPath::Version
            }
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
            EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                path: Box::new(EntityQueryPath::Uuid),
                reversed: false
            }
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
                ["editionId", "test"].into_iter()
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
