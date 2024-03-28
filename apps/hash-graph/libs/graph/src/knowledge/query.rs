use std::{fmt, str::FromStr};

use graph_types::knowledge::entity::Entity;
use serde::{
    de::{self, SeqAccess, Visitor},
    Deserialize, Deserializer,
};
use temporal_versioning::{ClosedTemporalBound, TemporalTagged, TimeAxis};
#[cfg(feature = "utoipa")]
use utoipa::ToSchema;

use crate::{
    ontology::{EntityTypeQueryPath, EntityTypeQueryPathVisitor},
    store::{
        query::{parse_query_token, JsonPath, ParameterType, PathToken, QueryPath},
        QueryRecord, SubgraphRecord,
    },
    subgraph::{
        edges::{EdgeDirection, KnowledgeGraphEdgeKind, SharedEdgeKind},
        identifier::EntityVertexId,
    },
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
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
    /// [`EntityUuid`]: graph_types::knowledge::entity::EntityUuid
    /// [`EntityId`]: graph_types::knowledge::entity::EntityId
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
    /// [`OwnedById`]: graph_types::owned_by_id::OwnedById
    /// [`EntityId`]: graph_types::knowledge::entity::EntityId
    OwnedById,
    /// The [`DraftId`] of the [`EntityId`] belonging to the [`Entity`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// let path = EntityQueryPath::deserialize(json!(["draftId"]))?;
    /// assert_eq!(path, EntityQueryPath::DraftId);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`DraftId`]: graph_types::knowledge::entity::DraftId
    /// [`EntityId`]: graph_types::knowledge::entity::EntityId
    DraftId,
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
    /// [`EntityEditionId`]: graph_types::knowledge::entity::EntityEditionId
    /// [`EntityRecordId`]: graph_types::knowledge::entity::EntityRecordId
    EditionId,
    /// The decision time axis of the [`EntityTemporalMetadata`] belonging to the [`Entity`].
    ///
    /// It's not possible to query for the temporal axis directly, this has to be done via the
    /// `temporalAxes` parameter on [`StructuralQuery`]. The decision time is returned as part of
    /// [`EntityTemporalMetadata`] of the [`EntityMetadata`].
    ///
    /// [`StructuralQuery`]: crate::subgraph::query::StructuralQuery
    /// [`EntityMetadata`]: graph_types::knowledge::entity::EntityMetadata
    /// [`EntityTemporalMetadata`]: graph_types::knowledge::entity::EntityTemporalMetadata
    DecisionTime,
    /// The transaction time axis of the [`EntityTemporalMetadata`] belonging to the [`Entity`].
    ///
    /// It's not possible to query for the temporal axis directly, this has to be done via the
    /// `temporalAxes` parameter on [`StructuralQuery`]. The transaction time is returned as part
    /// of [`EntityTemporalMetadata`] of the [`EntityMetadata`].
    ///
    /// [`StructuralQuery`]: crate::subgraph::query::StructuralQuery
    /// [`EntityMetadata`]: graph_types::knowledge::entity::EntityMetadata
    /// [`EntityTemporalMetadata`]: graph_types::knowledge::entity::EntityTemporalMetadata
    TransactionTime,
    /// The list of [`EntityType`]s' [`BaseUrl`]s belonging to the [`Entity`].
    ///
    /// It's currently not possible to query for the list of types directly. Use [`EntityTypeEdge`]
    /// instead.
    ///
    /// [`BaseUrl`]: type_system::url::BaseUrl
    /// [`EntityType`]: type_system::EntityType
    /// [`EntityTypeEdge`]: Self::EntityTypeEdge
    TypeBaseUrls,
    /// The list of [`EntityType`]s' versions belonging to the [`Entity`].
    ///
    /// It's currently not possible to query for the list of types directly. Use [`EntityTypeEdge`]
    /// instead.
    ///
    /// [`EntityType`]: type_system::EntityType
    /// [`EntityTypeEdge`]: Self::EntityTypeEdge
    TypeVersions,
    /// The confidence value for the [`Entity`].
    ///
    /// It's currently not possible to query for the entity confidence value directly.
    EntityConfidence,
    /// The confidence value for the [`Entity`]'s left entity link.
    ///
    /// It's currently not possible to query for the entity confidence value directly.
    LeftEntityConfidence,
    /// The confidence value for the [`Entity`]'s right entity link.
    ///
    /// It's currently not possible to query for the entity confidence value directly.
    RightEntityConfidence,
    /// The list of all property pointers of an [`Entity`].
    ///
    /// It's currently not possible to query for the list of property pointers directly.
    PropertyPaths,
    /// The list of all confidence values belonging to [`PropertyPaths`]' properties.
    ///
    /// It's currently not possible to query for the list of confidence values directly.
    ///
    /// [`PropertyPaths`]: Self::PropertyPaths
    PropertyConfidences,
    /// The timestamp of the transaction time when the [`Entity`] was _first inserted_ into the
    /// database.
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// let path = EntityQueryPath::deserialize(json!(["createdAtTransactionTime"]))?;
    /// assert_eq!(path, EntityQueryPath::CreatedAtTransactionTime);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`StructuralQuery`]: crate::subgraph::query::StructuralQuery
    /// [`EntityMetadata`]: graph_types::knowledge::entity::EntityMetadata
    /// [`EntityTemporalMetadata`]: graph_types::knowledge::entity::EntityTemporalMetadata
    CreatedAtTransactionTime,
    /// The timestamp of the decision time when the [`Entity`] was _first inserted_ into the
    /// database.
    ///
    /// This does not take into account if the [`Entity`] was updated with an earlier decision
    /// time.
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// let path = EntityQueryPath::deserialize(json!(["createdAtDecisionTime"]))?;
    /// assert_eq!(path, EntityQueryPath::CreatedAtDecisionTime);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`StructuralQuery`]: crate::subgraph::query::StructuralQuery
    /// [`EntityMetadata`]: graph_types::knowledge::entity::EntityMetadata
    /// [`EntityTemporalMetadata`]: graph_types::knowledge::entity::EntityTemporalMetadata
    CreatedAtDecisionTime,
    /// The timestamp of the transaction time when the first non-draft edition of the [`Entity`]
    /// was inserted into the database. This may be the first edition, if created as non-draft.
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// let path = EntityQueryPath::deserialize(json!(["firstNonDraftCreatedAtTransactionTime"]))?;
    /// assert_eq!(path, EntityQueryPath::FirstNonDraftCreatedAtTransactionTime);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`StructuralQuery`]: crate::subgraph::query::StructuralQuery
    /// [`EntityMetadata`]: graph_types::knowledge::entity::EntityMetadata
    /// [`EntityTemporalMetadata`]: graph_types::knowledge::entity::EntityTemporalMetadata
    FirstNonDraftCreatedAtTransactionTime,
    /// The timestamp of the decision time when the [`Entity`] was _first undrafted_ in the
    /// database.
    ///
    /// This does not take into account if the [`Entity`] was updated with an earlier decision
    /// time.
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// let path = EntityQueryPath::deserialize(json!(["firstNonDraftCreatedAtDecisionTime"]))?;
    /// assert_eq!(path, EntityQueryPath::FirstNonDraftCreatedAtDecisionTime);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`StructuralQuery`]: crate::subgraph::query::StructuralQuery
    /// [`EntityMetadata`]: graph_types::knowledge::entity::EntityMetadata
    /// [`EntityTemporalMetadata`]: graph_types::knowledge::entity::EntityTemporalMetadata
    FirstNonDraftCreatedAtDecisionTime,
    /// Whether or not the [`Entity`] is in a draft state.
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// let path = EntityQueryPath::deserialize(json!(["archived"]))?;
    /// assert_eq!(path, EntityQueryPath::Archived);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    Archived,
    /// The [`EditionCreatedById`] of the [`EntityProvenanceMetadata`] belonging to the [`Entity`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// let path = EntityQueryPath::deserialize(json!(["editionCreatedById"]))?;
    /// assert_eq!(path, EntityQueryPath::EditionCreatedById);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EditionCreatedById`]: graph_types::account::EditionCreatedById
    /// [`EntityProvenanceMetadata`]: graph_types::knowledge::entity::EntityProvenanceMetadata
    EditionCreatedById,
    /// The [`CreatedById`] of the [`EntityProvenanceMetadata`] belonging to the [`Entity`]
    /// when it was _first inserted_ into the database.
    ///
    /// This does not take into account if the [`Entity`] was updated with an earlier decision
    /// time.
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
    /// [`CreatedById`]: graph_types::account::CreatedById
    /// [`EntityProvenanceMetadata`]: graph_types::knowledge::entity::EntityProvenanceMetadata
    CreatedById,
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
    /// assert_eq!(
    ///     path,
    ///     EntityQueryPath::EntityTypeEdge {
    ///         edge_kind: SharedEdgeKind::IsOfType,
    ///         path: EntityTypeQueryPath::BaseUrl,
    ///         inheritance_depth: None,
    ///     }
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// It's possible to specify the inheritance search depths:
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::{knowledge::EntityQueryPath, ontology::EntityTypeQueryPath};
    /// # use graph::subgraph::edges::SharedEdgeKind;
    /// let path = EntityQueryPath::deserialize(json!(["type(inheritanceDepth = 10)", "baseUrl"]))?;
    /// assert_eq!(
    ///     path,
    ///     EntityQueryPath::EntityTypeEdge {
    ///         edge_kind: SharedEdgeKind::IsOfType,
    ///         path: EntityTypeQueryPath::BaseUrl,
    ///         inheritance_depth: Some(10),
    ///     }
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityType`]: type_system::PropertyType
    EntityTypeEdge {
        edge_kind: SharedEdgeKind,
        path: EntityTypeQueryPath<'p>,
        inheritance_depth: Option<u32>,
    },
    /// An edge between two [`Entities`][`Entity`] using a [`KnowledgeGraphEdgeKind`].
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
    /// # use graph::subgraph::edges::{EdgeDirection, KnowledgeGraphEdgeKind};
    /// let path = EntityQueryPath::deserialize(json!(["leftEntity", "uuid"]))?;
    /// assert_eq!(
    ///     path,
    ///     EntityQueryPath::EntityEdge {
    ///         edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
    ///         path: Box::new(EntityQueryPath::Uuid),
    ///         direction: EdgeDirection::Outgoing,
    ///     }
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`LinkData::left_entity_id()`]: graph_types::knowledge::link::LinkData::left_entity_id
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
    /// # use graph::subgraph::edges::{EdgeDirection, KnowledgeGraphEdgeKind};
    /// let path = EntityQueryPath::deserialize(json!(["rightEntity", "uuid"]))?;
    /// assert_eq!(
    ///     path,
    ///     EntityQueryPath::EntityEdge {
    ///         edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
    ///         path: Box::new(EntityQueryPath::Uuid),
    ///         direction: EdgeDirection::Outgoing,
    ///     }
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`LinkData::right_entity_id()`]: graph_types::knowledge::link::LinkData::right_entity_id
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
    /// # use graph::subgraph::edges::{EdgeDirection, KnowledgeGraphEdgeKind};
    /// let path = EntityQueryPath::deserialize(json!(["incomingLinks", "uuid"]))?;
    /// assert_eq!(
    ///     path,
    ///     EntityQueryPath::EntityEdge {
    ///         edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
    ///         path: Box::new(EntityQueryPath::Uuid),
    ///         direction: EdgeDirection::Incoming,
    ///     }
    /// );
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
    /// # use graph::subgraph::edges::{EdgeDirection, KnowledgeGraphEdgeKind};
    /// let path = EntityQueryPath::deserialize(json!(["outgoingLinks", "uuid"]))?;
    /// assert_eq!(
    ///     path,
    ///     EntityQueryPath::EntityEdge {
    ///         edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
    ///         path: Box::new(EntityQueryPath::Uuid),
    ///         direction: EdgeDirection::Incoming,
    ///     }
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    EntityEdge {
        edge_kind: KnowledgeGraphEdgeKind,
        path: Box<Self>,
        direction: EdgeDirection,
    },
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
    Properties(Option<JsonPath<'p>>),
    /// The embedding for the whole entity blob.
    ///
    /// Deserializes from `["embedding"]`:
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::knowledge::EntityQueryPath;
    /// let path = EntityQueryPath::deserialize(json!(["embedding"]))?;
    /// assert_eq!(path, EntityQueryPath::Embedding);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    Embedding,
}

impl fmt::Display for EntityQueryPath<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Uuid => fmt.write_str("uuid"),
            Self::OwnedById => fmt.write_str("ownedById"),
            Self::DraftId => fmt.write_str("draftId"),
            Self::EditionCreatedById => fmt.write_str("editionCreatedById"),
            Self::CreatedById => fmt.write_str("createdById"),
            Self::EditionId => fmt.write_str("editionId"),
            Self::DecisionTime => fmt.write_str("decisionTime"),
            Self::TransactionTime => fmt.write_str("transactionTime"),
            Self::TypeBaseUrls => fmt.write_str("typeBaseUrls"),
            Self::TypeVersions => fmt.write_str("typeVersions"),
            Self::CreatedAtDecisionTime => fmt.write_str("createdAtDecisionTime"),
            Self::CreatedAtTransactionTime => fmt.write_str("createdAtTransactionTime"),
            Self::FirstNonDraftCreatedAtDecisionTime => {
                fmt.write_str("firstNonDraftCreatedAtDecisionTime")
            }
            Self::FirstNonDraftCreatedAtTransactionTime => {
                fmt.write_str("firstNonDraftCreatedAtTransactionTime")
            }
            Self::Archived => fmt.write_str("archived"),
            Self::Properties(Some(property)) => write!(fmt, "properties.{property}"),
            Self::Properties(None) => fmt.write_str("properties"),
            Self::Embedding => fmt.write_str("embedding"),
            Self::EntityTypeEdge {
                edge_kind: SharedEdgeKind::IsOfType,
                path,
                inheritance_depth: Some(depth),
            } => write!(fmt, "type({depth}).{path}"),
            Self::EntityTypeEdge {
                edge_kind: SharedEdgeKind::IsOfType,
                path,
                inheritance_depth: None,
            } => write!(fmt, "type.{path}"),
            Self::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                path,
                direction: EdgeDirection::Outgoing,
            } => write!(fmt, "leftEntity.{path}"),
            Self::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                path,
                direction: EdgeDirection::Outgoing,
            } => write!(fmt, "rightEntity.{path}"),
            Self::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                path,
                direction: EdgeDirection::Incoming,
            } => write!(fmt, "outgoingLinks.{path}"),
            Self::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                path,
                direction: EdgeDirection::Incoming,
            } => write!(fmt, "incomingLinks.{path}"),
            Self::EntityConfidence => fmt.write_str("entityConfidence"),
            Self::LeftEntityConfidence => fmt.write_str("leftEntityConfidence"),
            Self::RightEntityConfidence => fmt.write_str("rightEntityConfidence"),
            Self::PropertyPaths => fmt.write_str("propertyPaths"),
            Self::PropertyConfidences => fmt.write_str("propertyConfidences"),
        }
    }
}

impl QueryPath for EntityQueryPath<'_> {
    fn expected_type(&self) -> ParameterType {
        match self {
            Self::EditionId
            | Self::Uuid
            | Self::OwnedById
            | Self::DraftId
            | Self::EditionCreatedById
            | Self::CreatedById => ParameterType::Uuid,
            Self::DecisionTime | Self::TransactionTime => ParameterType::TimeInterval,
            Self::TypeBaseUrls => ParameterType::Vector(Box::new(ParameterType::VersionedUrl)),
            Self::TypeVersions => {
                ParameterType::Vector(Box::new(ParameterType::OntologyTypeVersion))
            }
            Self::CreatedAtDecisionTime
            | Self::CreatedAtTransactionTime
            | Self::FirstNonDraftCreatedAtDecisionTime
            | Self::FirstNonDraftCreatedAtTransactionTime => ParameterType::Timestamp,
            Self::Properties(_) => ParameterType::Any,
            Self::EntityConfidence | Self::LeftEntityConfidence | Self::RightEntityConfidence => {
                ParameterType::F64
            }
            Self::PropertyPaths => ParameterType::Vector(Box::new(ParameterType::Text)),
            Self::PropertyConfidences | Self::Embedding => {
                ParameterType::Vector(Box::new(ParameterType::F64))
            }
            Self::Archived => ParameterType::Boolean,
            Self::EntityTypeEdge { path, .. } => path.expected_type(),
            Self::EntityEdge { path, .. } => path.expected_type(),
        }
    }
}

/// A single token in an [`EntityQueryPath`].
#[derive(Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[serde(rename_all = "camelCase")]
pub enum EntityQueryToken {
    // TODO: we want to expose `EntityId` here instead
    Uuid,
    EditionId,
    DraftId,
    Archived,
    OwnedById,
    EditionCreatedById,
    CreatedById,
    CreatedAtTransactionTime,
    CreatedAtDecisionTime,
    FirstNonDraftCreatedAtTransactionTime,
    FirstNonDraftCreatedAtDecisionTime,
    Type,
    Properties,
    Embedding,
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
    pub const EXPECTING: &'static str =
        "one of `uuid`, `editionId`, `draftId`, `archived`, `ownedById`, `editionCreatedById`, \
         `createdById`, `createdAtTransactionTime`, `createdAtDecisionTime`, \
         `firstNonDraftCreatedAtTransactionTime`, `firstNonDraftCreatedAtDecisionTime`, `type`, \
         `properties`, `embedding`, `incomingLinks`, `outgoingLinks`, `leftEntity`, `rightEntity`";

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
        let query_token: String = seq
            .next_element()?
            .ok_or_else(|| de::Error::invalid_length(self.position, &self))?;
        let (token, mut parameters) = parse_query_token(&query_token)?;
        self.position += 1;

        let query_path = match token {
            EntityQueryToken::Uuid => EntityQueryPath::Uuid,
            EntityQueryToken::EditionId => EntityQueryPath::EditionId,
            EntityQueryToken::OwnedById => EntityQueryPath::OwnedById,
            EntityQueryToken::DraftId => EntityQueryPath::DraftId,
            EntityQueryToken::EditionCreatedById => EntityQueryPath::EditionCreatedById,
            EntityQueryToken::CreatedById => EntityQueryPath::CreatedById,
            EntityQueryToken::CreatedAtTransactionTime => EntityQueryPath::CreatedAtTransactionTime,
            EntityQueryToken::CreatedAtDecisionTime => EntityQueryPath::CreatedAtDecisionTime,
            EntityQueryToken::FirstNonDraftCreatedAtTransactionTime => {
                EntityQueryPath::FirstNonDraftCreatedAtTransactionTime
            }
            EntityQueryToken::FirstNonDraftCreatedAtDecisionTime => {
                EntityQueryPath::FirstNonDraftCreatedAtDecisionTime
            }
            EntityQueryToken::Archived => EntityQueryPath::Archived,
            EntityQueryToken::Embedding => EntityQueryPath::Embedding,
            EntityQueryToken::Type => EntityQueryPath::EntityTypeEdge {
                edge_kind: SharedEdgeKind::IsOfType,
                path: EntityTypeQueryPathVisitor::new(self.position).visit_seq(seq)?,
                inheritance_depth: parameters
                    .remove("inheritanceDepth")
                    .map(u32::from_str)
                    .transpose()
                    .map_err(de::Error::custom)?,
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
                direction: EdgeDirection::Outgoing,
            },
            EntityQueryToken::RightEntity => EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                path: Box::new(Self::new(self.position).visit_seq(seq)?),
                direction: EdgeDirection::Outgoing,
            },
            EntityQueryToken::OutgoingLinks => EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                path: Box::new(Self::new(self.position).visit_seq(seq)?),
                direction: EdgeDirection::Incoming,
            },
            EntityQueryToken::IncomingLinks => EntityQueryPath::EntityEdge {
                edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
                path: Box::new(Self::new(self.position).visit_seq(seq)?),
                direction: EdgeDirection::Incoming,
            },
        };

        if !parameters.is_empty() {
            return Err(de::Error::custom(format!(
                "unknown parameters: {}",
                parameters.into_keys().collect::<Vec<_>>().join(", ")
            )));
        }

        Ok(query_path)
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

#[derive(Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[serde(rename_all = "camelCase")]
pub enum EntityQuerySortingToken {
    Archived,
    Properties,
    RecordCreatedAtTransactionTime,
    RecordCreatedAtDecisionTime,
    CreatedAtTransactionTime,
    CreatedAtDecisionTime,
}

/// Deserializes an [`EntityQueryPath`] from a string sequence.
pub struct EntityQuerySortingVisitor {
    /// The current position in the sequence when deserializing.
    position: usize,
}

impl EntityQuerySortingVisitor {
    pub const EXPECTING: &'static str =
        "one of `archived`, `properties`, `recordCreatedAtTransactionTime`, \
         `recordCreatedAtDecisionTime`, `createdAtTransactionTime`, `createdAtDecisionTime`";

    #[must_use]
    pub const fn new(position: usize) -> Self {
        Self { position }
    }
}

impl<'de> Visitor<'de> for EntityQuerySortingVisitor {
    type Value = EntityQueryPath<'de>;

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str(Self::EXPECTING)
    }

    fn visit_seq<A>(mut self, mut seq: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let token: EntityQuerySortingToken = seq
            .next_element()?
            .ok_or_else(|| de::Error::invalid_length(self.position, &self))?;
        self.position += 1;

        Ok(match token {
            EntityQuerySortingToken::Archived => EntityQueryPath::Archived,
            EntityQuerySortingToken::RecordCreatedAtTransactionTime => {
                EntityQueryPath::TransactionTime
            }
            EntityQuerySortingToken::RecordCreatedAtDecisionTime => EntityQueryPath::DecisionTime,
            EntityQuerySortingToken::CreatedAtTransactionTime => {
                EntityQueryPath::CreatedAtTransactionTime
            }
            EntityQuerySortingToken::CreatedAtDecisionTime => {
                EntityQueryPath::CreatedAtDecisionTime
            }
            EntityQuerySortingToken::Properties => {
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
        })
    }
}

impl<'de: 'p, 'p> EntityQueryPath<'p> {
    /// Deserializes an [`EntityQueryPath`] from a string sequence represeting sorting keys
    ///
    /// # Errors
    ///
    /// If the sequence could not be deserialized
    pub fn deserialize_from_sorting_tokens<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_seq(EntityQuerySortingVisitor::new(0))
    }

    #[must_use]
    pub fn into_owned(self) -> EntityQueryPath<'static> {
        match self {
            Self::Uuid => EntityQueryPath::Uuid,
            Self::OwnedById => EntityQueryPath::OwnedById,
            Self::DraftId => EntityQueryPath::DraftId,
            Self::EditionId => EntityQueryPath::EditionId,
            Self::DecisionTime => EntityQueryPath::DecisionTime,
            Self::TransactionTime => EntityQueryPath::TransactionTime,
            Self::TypeBaseUrls => EntityQueryPath::TypeBaseUrls,
            Self::TypeVersions => EntityQueryPath::TypeVersions,
            Self::CreatedAtTransactionTime => EntityQueryPath::CreatedAtTransactionTime,
            Self::CreatedAtDecisionTime => EntityQueryPath::CreatedAtDecisionTime,
            Self::FirstNonDraftCreatedAtTransactionTime => {
                EntityQueryPath::FirstNonDraftCreatedAtTransactionTime
            }
            Self::FirstNonDraftCreatedAtDecisionTime => {
                EntityQueryPath::FirstNonDraftCreatedAtDecisionTime
            }
            Self::Archived => EntityQueryPath::Archived,
            Self::EditionCreatedById => EntityQueryPath::EditionCreatedById,
            Self::CreatedById => EntityQueryPath::CreatedById,
            Self::EntityTypeEdge {
                path,
                edge_kind,
                inheritance_depth,
            } => EntityQueryPath::EntityTypeEdge {
                path: path.into_owned(),
                edge_kind,
                inheritance_depth,
            },
            Self::EntityEdge {
                path,
                edge_kind,
                direction,
            } => EntityQueryPath::EntityEdge {
                path: Box::new(path.into_owned()),
                edge_kind,
                direction,
            },
            Self::Properties(path) => EntityQueryPath::Properties(path.map(JsonPath::into_owned)),
            Self::Embedding => EntityQueryPath::Embedding,
            Self::EntityConfidence => EntityQueryPath::EntityConfidence,
            Self::LeftEntityConfidence => EntityQueryPath::LeftEntityConfidence,
            Self::RightEntityConfidence => EntityQueryPath::RightEntityConfidence,
            Self::PropertyPaths => EntityQueryPath::PropertyPaths,
            Self::PropertyConfidences => EntityQueryPath::PropertyConfidences,
        }
    }
}

impl QueryRecord for Entity {
    type QueryPath<'p> = EntityQueryPath<'p>;
}

impl SubgraphRecord for Entity {
    type VertexId = EntityVertexId;

    #[must_use]
    fn vertex_id(&self, time_axis: TimeAxis) -> EntityVertexId {
        let ClosedTemporalBound::Inclusive(timestamp) = match time_axis {
            TimeAxis::DecisionTime => self
                .metadata
                .temporal_versioning
                .decision_time
                .start()
                .cast(),
            TimeAxis::TransactionTime => self
                .metadata
                .temporal_versioning
                .transaction_time
                .start()
                .cast(),
        };
        EntityVertexId {
            base_id: self.metadata.record_id.entity_id,
            revision_id: timestamp,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{borrow::Cow, iter::once};

    use super::*;

    #[test]
    fn sorting_path_deserialization_error() {
        assert_eq!(
            EntityQueryPath::deserialize_from_sorting_tokens(de::value::SeqDeserializer::<
                _,
                de::value::Error,
            >::new(once("invalid")))
            .expect_err("managed to convert entity query sorting path")
            .to_string(),
            format!(
                "unknown variant `invalid`, expected {}",
                EntityQuerySortingVisitor::EXPECTING
            )
        );
    }

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
                path: EntityTypeQueryPath::Version,
                inheritance_depth: None,
            }
        );
        assert_eq!(
            deserialize(["type(inheritanceDepth = 5)", "version"]),
            EntityQueryPath::EntityTypeEdge {
                edge_kind: SharedEdgeKind::IsOfType,
                path: EntityTypeQueryPath::Version,
                inheritance_depth: Some(5),
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
                direction: EdgeDirection::Outgoing
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
