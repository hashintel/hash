use std::{fmt, str::FromStr};

use serde::{
    de::{self, Deserializer, SeqAccess, Visitor},
    Deserialize,
};
use utoipa::ToSchema;

use crate::{
    knowledge::EntityQueryPath,
    ontology::{property_type::PropertyTypeQueryPathVisitor, PropertyTypeQueryPath, Selector},
    store::query::{
        parse_query_token, JsonPath, OntologyQueryPath, ParameterType, PathToken, QueryPath,
    },
    subgraph::edges::{EdgeDirection, OntologyEdgeKind, SharedEdgeKind},
};

/// A path to a [`EntityType`] field.
///
/// [`EntityType`]: type_system::EntityType
#[derive(Debug, PartialEq, Eq)]
pub enum EntityTypeQueryPath<'p> {
    /// The [`BaseUrl`] of the [`EntityType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::EntityTypeQueryPath;
    /// let path = EntityTypeQueryPath::deserialize(json!(["baseUrl"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::BaseUrl);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityType`]: type_system::EntityType
    /// [`BaseUrl`]: type_system::url::BaseUrl
    BaseUrl,
    /// The version of the [`EntityType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::EntityTypeQueryPath;
    /// let path = EntityTypeQueryPath::deserialize(json!(["version"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::Version);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// In addition to specifying the version directly, it's also possible to compare the version
    /// with a `"latest"` parameter, which will only match the latest version of the
    /// [`EntityType`].
    ///
    /// ```rust
    /// # use std::borrow::Cow;
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::{store::query::{Filter, FilterExpression, Parameter}};
    /// # use graph::ontology::EntityTypeQueryPath;
    /// # use graph_types::ontology::EntityTypeWithMetadata;
    /// let filter_value = json!({ "equal": [{ "path": ["version"] }, { "parameter": "latest" }] });
    /// let path = Filter::<EntityTypeWithMetadata>::deserialize(filter_value)?;
    /// assert_eq!(path, Filter::Equal(
    ///     Some(FilterExpression::Path(EntityTypeQueryPath::Version)),
    ///     Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed("latest")))))
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityType`]: type_system::EntityType
    Version,
    /// The [`VersionedUrl`] of the [`EntityType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::EntityTypeQueryPath;
    /// let path = EntityTypeQueryPath::deserialize(json!(["versionedUrl"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::VersionedUrl);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityType`]: type_system::EntityType
    /// [`VersionedUrl`]: type_system::url::VersionedUrl
    VersionedUrl,
    /// The transaction time of the [`EntityType`].
    ///
    /// It's not possible to query for the temporal axis directly, this has to be done via the
    /// `temporalAxes` parameter on [`StructuralQuery`].
    ///
    /// [`EntityType`]: type_system::EntityType
    /// [`StructuralQuery`]: crate::subgraph::query::StructuralQuery
    TransactionTime,
    /// The [`OwnedById`] of the [`OntologyElementMetadata`] belonging to the [`EntityType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::EntityTypeQueryPath;
    /// let path = EntityTypeQueryPath::deserialize(json!(["ownedById"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::OwnedById);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityType`]: type_system::EntityType
    /// [`OwnedById`]: graph_types::provenance::OwnedById
    /// [`OntologyElementMetadata`]: graph_types::ontology::OntologyElementMetadata
    OwnedById,
    /// The [`RecordCreatedById`] of the [`ProvenanceMetadata`] belonging to the [`EntityType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::EntityTypeQueryPath;
    /// let path = EntityTypeQueryPath::deserialize(json!(["recordCreatedById"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::RecordCreatedById);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityType`]: type_system::EntityType
    /// [`RecordCreatedById`]: graph_types::provenance::RecordCreatedById
    /// [`ProvenanceMetadata`]: graph_types::provenance::ProvenanceMetadata
    RecordCreatedById,
    /// The [`RecordArchivedById`] of the [`ProvenanceMetadata`] belonging to the [`EntityType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::EntityTypeQueryPath;
    /// let path = EntityTypeQueryPath::deserialize(json!(["recordArchivedById"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::RecordArchivedById);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityType`]: type_system::EntityType
    /// [`RecordArchivedById`]: graph_types::provenance::RecordArchivedById
    /// [`ProvenanceMetadata`]: graph_types::provenance::ProvenanceMetadata
    RecordArchivedById,
    /// Corresponds to [`EntityType::title()`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::EntityTypeQueryPath;
    /// let path = EntityTypeQueryPath::deserialize(json!(["title"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::Title);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityType::title()`]: type_system::EntityType::title
    Title,
    /// Corresponds to [`EntityType::description()`]
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::EntityTypeQueryPath;
    /// let path = EntityTypeQueryPath::deserialize(json!(["description"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::Description);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityType::description()`]: type_system::EntityType::description
    Description,
    /// Corresponds to [`EntityType::examples()`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::EntityTypeQueryPath;
    /// let path = EntityTypeQueryPath::deserialize(json!(["examples"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::Examples);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityType::examples()`]: type_system::EntityType::examples
    Examples,
    /// Corresponds to [`EntityType::required()`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::EntityTypeQueryPath;
    /// let path = EntityTypeQueryPath::deserialize(json!(["required"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::Required);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityType::required()`]: type_system::EntityType::required
    Required,
    /// The label property metadata of the entity type.
    LabelProperty,
    /// The icon of the entity type.
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::EntityTypeQueryPath;
    /// let path = EntityTypeQueryPath::deserialize(json!(["icon"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::Icon);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    Icon,
    /// An edge to a [`PropertyType`] using an [`OntologyEdgeKind`].
    PropertyTypeEdge {
        edge_kind: OntologyEdgeKind,
        path: PropertyTypeQueryPath<'p>,
        inheritance_depth: Option<u32>,
    },
    /// An edge between two [`EntityType`]s using an [`OntologyEdgeKind`].
    ///
    /// Allowed edge kinds are:
    /// - [`InheritsFrom`]
    /// - [`ConstrainsLinksOn`]
    /// - [`ConstrainsLinkDestinationsOn`]
    ///
    /// [`EntityType`]: type_system::EntityType
    /// [`InheritsFrom`]: OntologyEdgeKind::InheritsFrom
    /// [`ConstrainsLinksOn`]: OntologyEdgeKind::ConstrainsLinksOn
    /// [`ConstrainsLinkDestinationsOn`]: OntologyEdgeKind::ConstrainsLinkDestinationsOn
    ///
    ///
    /// ## Inheritance
    ///
    /// Currently, does not correspond to any field of [`EntityType`].
    ///
    /// In the future, this will most likely correspond to something like
    /// `EntityType::inherits_from()`.
    ///
    /// As an [`EntityType`] can inherit from multiple [`EntityType`]s, the deserialized path
    /// requires an additional selector to identify the [`EntityType`] to query. Currently,
    /// only the `*` selector is available, so the path will be deserialized as
    /// `["inheritsFrom", "*", ...]` where `...` is the path to the desired field of the
    /// [`EntityType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::EntityTypeQueryPath;
    /// # use graph::subgraph::edges::{EdgeDirection, OntologyEdgeKind};
    /// let path = EntityTypeQueryPath::deserialize(json!(["inheritsFrom", "*", "baseUrl"]))?;
    /// assert_eq!(
    ///     path,
    ///     EntityTypeQueryPath::EntityTypeEdge {
    ///         edge_kind: OntologyEdgeKind::InheritsFrom,
    ///         path: Box::new(EntityTypeQueryPath::BaseUrl),
    ///         direction: EdgeDirection::Outgoing,
    ///         inheritance_depth: None,
    ///     }
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// It's also possible to create a query path for the reversed direction:
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::EntityTypeQueryPath;
    /// # use graph::subgraph::edges::{EdgeDirection, OntologyEdgeKind};
    /// let path = EntityTypeQueryPath::deserialize(json!(["children", "*", "baseUrl"]))?;
    /// assert_eq!(
    ///     path,
    ///     EntityTypeQueryPath::EntityTypeEdge {
    ///         edge_kind: OntologyEdgeKind::InheritsFrom,
    ///         path: Box::new(EntityTypeQueryPath::BaseUrl),
    ///         direction: EdgeDirection::Incoming,
    ///         inheritance_depth: None,
    ///     }
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// ### Specifying the inheritance depth
    ///
    /// By passing `inheritanceDepth` as a parameter it's possible to limit the searched depth:
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::EntityTypeQueryPath;
    /// # use graph::subgraph::edges::{EdgeDirection, OntologyEdgeKind};
    /// let path =
    ///     EntityTypeQueryPath::deserialize(json!([
    ///         "inheritsFrom(inheritanceDepth=10)",
    ///         "*",
    ///         "baseUrl"
    ///     ]))?;
    /// assert_eq!(
    ///     path,
    ///     EntityTypeQueryPath::EntityTypeEdge {
    ///         edge_kind: OntologyEdgeKind::InheritsFrom,
    ///         path: Box::new(EntityTypeQueryPath::BaseUrl),
    ///         direction: EdgeDirection::Outgoing,
    ///         inheritance_depth: Some(10),
    ///     }
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// and similary for the reversed direction:
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::EntityTypeQueryPath;
    /// # use graph::subgraph::edges::{EdgeDirection, OntologyEdgeKind};
    /// let path =
    ///     EntityTypeQueryPath::deserialize(json!(["children(inheritanceDepth=10)", "*", "baseUrl"]))?;
    /// assert_eq!(
    ///     path,
    ///     EntityTypeQueryPath::EntityTypeEdge {
    ///         edge_kind: OntologyEdgeKind::InheritsFrom,
    ///         path: Box::new(EntityTypeQueryPath::BaseUrl),
    ///         direction: EdgeDirection::Incoming,
    ///         inheritance_depth: Some(10),
    ///     }
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    ///
    ///
    /// ## Constraining links
    ///
    /// Corresponds to the keys of [`EntityType::link_mappings()`].
    ///
    /// As an [`EntityType`] can link to multiple [`EntityType`]s, the deserialized path
    /// requires an additional selector to identify the [`EntityType`] to query. Currently,
    /// only the `*` selector is available, so the path will be deserialized as
    /// `["links", "*", ...]` where `...` is the path to the desired field of the
    /// [`EntityType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::EntityTypeQueryPath;
    /// # use graph::subgraph::edges::{EdgeDirection, OntologyEdgeKind};
    /// let path = EntityTypeQueryPath::deserialize(json!(["links", "*", "baseUrl"]))?;
    /// assert_eq!(
    ///     path,
    ///     EntityTypeQueryPath::EntityTypeEdge {
    ///         edge_kind: OntologyEdgeKind::ConstrainsLinksOn,
    ///         path: Box::new(EntityTypeQueryPath::BaseUrl),
    ///         direction: EdgeDirection::Outgoing,
    ///         inheritance_depth: None,
    ///     }
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// ### Specifying the inheritance depth
    ///
    /// By passing `inheritanceDepth` as a parameter it's possible to limit the searched depth:
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::EntityTypeQueryPath;
    /// # use graph::subgraph::edges::{EdgeDirection, OntologyEdgeKind};
    /// let path =
    ///     EntityTypeQueryPath::deserialize(json!(["links(inheritanceDepth=10)", "*", "baseUrl"]))?;
    /// assert_eq!(
    ///     path,
    ///     EntityTypeQueryPath::EntityTypeEdge {
    ///         edge_kind: OntologyEdgeKind::ConstrainsLinksOn,
    ///         path: Box::new(EntityTypeQueryPath::BaseUrl),
    ///         direction: EdgeDirection::Outgoing,
    ///         inheritance_depth: Some(10),
    ///     }
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityType::link_mappings()`]: type_system::EntityType::link_mappings
    ///
    ///
    /// ## Constraining link destinations
    ///
    /// Corresponds to the values of [`EntityType::link_mappings()`].
    ///
    /// Only used internally and not available for deserialization, yet.
    EntityTypeEdge {
        edge_kind: OntologyEdgeKind,
        path: Box<Self>,
        direction: EdgeDirection,
        inheritance_depth: Option<u32>,
    },
    /// A reversed edge from an [`Entity`] to this [`EntityType`] using a [`SharedEdgeKind`].
    ///
    /// The corresponding edge is [`EntityQueryPath::EntityTypeEdge`].
    ///
    /// Only used internally and not available for deserialization.
    ///
    /// [`EntityType`]: type_system::PropertyType
    /// [`Entity`]: graph_types::knowledge::entity::Entity
    EntityEdge {
        edge_kind: SharedEdgeKind,
        path: Box<EntityQueryPath<'p>>,
        inheritance_depth: Option<u32>,
    },
    /// Only used internally and not available for deserialization.
    OntologyId,
    /// Only used internally and not available for deserialization.
    Schema(Option<JsonPath<'p>>),
    /// Only used internally and not available for deserialization.
    ClosedSchema(Option<JsonPath<'p>>),
    /// Only used internally and not available for deserialization.
    AdditionalMetadata,
}

impl OntologyQueryPath for EntityTypeQueryPath<'_> {
    fn ontology_id() -> Self {
        Self::OntologyId
    }

    fn base_url() -> Self {
        Self::BaseUrl
    }

    fn versioned_url() -> Self {
        Self::VersionedUrl
    }

    fn version() -> Self {
        Self::Version
    }

    fn transaction_time() -> Self {
        Self::TransactionTime
    }

    fn record_created_by_id() -> Self {
        Self::RecordCreatedById
    }

    fn record_archived_by_id() -> Self {
        Self::RecordArchivedById
    }

    fn schema() -> Self {
        Self::Schema(None)
    }

    fn additional_metadata() -> Self {
        Self::AdditionalMetadata
    }
}

impl QueryPath for EntityTypeQueryPath<'_> {
    fn expected_type(&self) -> ParameterType {
        match self {
            Self::OntologyId
            | Self::OwnedById
            | Self::RecordCreatedById
            | Self::RecordArchivedById => ParameterType::Uuid,
            Self::Schema(_) | Self::ClosedSchema(_) | Self::AdditionalMetadata => {
                ParameterType::Object
            }
            Self::Examples | Self::Required => ParameterType::Any,
            Self::BaseUrl | Self::LabelProperty => ParameterType::BaseUrl,
            Self::VersionedUrl => ParameterType::VersionedUrl,
            Self::Version => ParameterType::OntologyTypeVersion,
            Self::TransactionTime => ParameterType::TimeInterval,
            Self::Title | Self::Description | Self::Icon => ParameterType::Text,
            Self::PropertyTypeEdge { path, .. } => path.expected_type(),
            Self::EntityTypeEdge { path, .. } => path.expected_type(),
            Self::EntityEdge { path, .. } => path.expected_type(),
        }
    }
}

impl fmt::Display for EntityTypeQueryPath<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::OntologyId => fmt.write_str("ontologyId"),
            Self::BaseUrl => fmt.write_str("baseUrl"),
            Self::Version => fmt.write_str("version"),
            Self::VersionedUrl => fmt.write_str("versionedUrl"),
            Self::TransactionTime => fmt.write_str("transactionTime"),
            Self::OwnedById => fmt.write_str("ownedById"),
            Self::RecordCreatedById => fmt.write_str("recordCreatedById"),
            Self::RecordArchivedById => fmt.write_str("recordArchivedById"),
            Self::Schema(Some(path)) => write!(fmt, "schema.{path}"),
            Self::Schema(None) => fmt.write_str("schema"),
            Self::ClosedSchema(Some(path)) => write!(fmt, "closedSchema.{path}"),
            Self::ClosedSchema(None) => fmt.write_str("closedSchema"),
            Self::Title => fmt.write_str("title"),
            Self::Description => fmt.write_str("description"),
            Self::Examples => fmt.write_str("examples"),
            Self::Required => fmt.write_str("required"),
            Self::LabelProperty => fmt.write_str("labelProperty"),
            Self::Icon => fmt.write_str("icon"),
            Self::PropertyTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsPropertiesOn,
                path,
                inheritance_depth: Some(depth),
            } => write!(fmt, "properties({depth}).{path}"),
            Self::PropertyTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsPropertiesOn,
                path,
                inheritance_depth: None,
            } => write!(fmt, "properties.{path}"),
            Self::PropertyTypeEdge {
                edge_kind, path, ..
            } => write!(fmt, "<{edge_kind:?}>.{path}"),
            Self::EntityTypeEdge {
                edge_kind: OntologyEdgeKind::InheritsFrom,
                path,
                direction: _,
                inheritance_depth: Some(depth),
            } => write!(fmt, "inheritsFrom({depth}).{path}"),
            Self::EntityTypeEdge {
                edge_kind: OntologyEdgeKind::InheritsFrom,
                path,
                direction: _,
                inheritance_depth: None,
            } => write!(fmt, "inheritsFrom.{path}"),
            Self::EntityTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsLinksOn,
                path,
                direction: _,
                inheritance_depth: Some(depth),
            } => write!(fmt, "links({depth}).{path}"),
            Self::EntityTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsLinksOn,
                path,
                direction: _,
                inheritance_depth: None,
            } => write!(fmt, "links.{path}"),
            Self::EntityTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsLinkDestinationsOn,
                path,
                direction: _,
                inheritance_depth: Some(depth),
            } => write!(fmt, "linkDestinations({depth}).{path}"),
            Self::EntityTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsLinkDestinationsOn,
                path,
                direction: _,
                inheritance_depth: None,
            } => write!(fmt, "linkDestinations.{path}"),
            Self::EntityTypeEdge {
                edge_kind, path, ..
            } => write!(fmt, "<{edge_kind:?}>.{path}"),
            Self::EntityEdge {
                edge_kind: SharedEdgeKind::IsOfType,
                path,
                inheritance_depth: Some(depth),
            } => write!(fmt, "isTypeOf({depth}).{path}"),
            Self::EntityEdge {
                edge_kind: SharedEdgeKind::IsOfType,
                path,
                inheritance_depth: None,
            } => write!(fmt, "isTypeOf.{path}"),
            Self::AdditionalMetadata => fmt.write_str("additionalMetadata"),
        }
    }
}

/// A single token in a [`EntityTypeQueryPath`].
#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub enum EntityTypeQueryToken {
    BaseUrl,
    Version,
    VersionedUrl,
    OwnedById,
    RecordCreatedById,
    RecordArchivedById,
    Title,
    Description,
    Examples,
    Properties,
    Required,
    LabelProperty,
    Icon,
    Links,
    InheritsFrom,
    Children,
    #[serde(skip)]
    Schema,
    #[serde(skip)]
    ClosedSchema,
}

/// Deserializes an [`EntityTypeQueryPath`] from a string sequence.
pub struct EntityTypeQueryPathVisitor {
    /// The current position in the sequence when deserializing.
    position: usize,
}

impl EntityTypeQueryPathVisitor {
    pub const EXPECTING: &'static str = "one of `baseUrl`, `version`, `versionedUrl`, \
                                         `ownedById`, `recordCreatedById`, `recordArchivedById`, \
                                         `title`, `description`, `examples`, `properties`, \
                                         `required`, `labelProperty`, `icon`, `links`, \
                                         `inheritsFrom`, `children`";

    #[must_use]
    pub const fn new(position: usize) -> Self {
        Self { position }
    }
}

impl<'de> Visitor<'de> for EntityTypeQueryPathVisitor {
    type Value = EntityTypeQueryPath<'de>;

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str(Self::EXPECTING)
    }

    #[expect(clippy::too_many_lines)]
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
            EntityTypeQueryToken::OwnedById => EntityTypeQueryPath::OwnedById,
            EntityTypeQueryToken::RecordCreatedById => EntityTypeQueryPath::RecordCreatedById,
            EntityTypeQueryToken::RecordArchivedById => EntityTypeQueryPath::RecordArchivedById,
            EntityTypeQueryToken::BaseUrl => EntityTypeQueryPath::BaseUrl,
            EntityTypeQueryToken::VersionedUrl => EntityTypeQueryPath::VersionedUrl,
            EntityTypeQueryToken::Version => EntityTypeQueryPath::Version,
            EntityTypeQueryToken::Title => EntityTypeQueryPath::Title,
            EntityTypeQueryToken::Description => EntityTypeQueryPath::Description,
            EntityTypeQueryToken::Examples => EntityTypeQueryPath::Examples,
            EntityTypeQueryToken::Properties => {
                seq.next_element::<Selector>()?
                    .ok_or_else(|| de::Error::invalid_length(self.position, &self))?;
                self.position += 1;

                EntityTypeQueryPath::PropertyTypeEdge {
                    edge_kind: OntologyEdgeKind::ConstrainsPropertiesOn,
                    path: PropertyTypeQueryPathVisitor::new(self.position).visit_seq(seq)?,
                    inheritance_depth: parameters
                        .remove("inheritanceDepth")
                        .map(u32::from_str)
                        .transpose()
                        .map_err(de::Error::custom)?,
                }
            }
            EntityTypeQueryToken::Required => EntityTypeQueryPath::Required,
            EntityTypeQueryToken::LabelProperty => EntityTypeQueryPath::LabelProperty,
            EntityTypeQueryToken::Icon => EntityTypeQueryPath::Icon,
            EntityTypeQueryToken::Links => {
                seq.next_element::<Selector>()?
                    .ok_or_else(|| de::Error::invalid_length(self.position, &self))?;
                self.position += 1;

                EntityTypeQueryPath::EntityTypeEdge {
                    edge_kind: OntologyEdgeKind::ConstrainsLinksOn,
                    path: Box::new(Self::new(self.position).visit_seq(seq)?),
                    direction: EdgeDirection::Outgoing,
                    inheritance_depth: parameters
                        .remove("inheritanceDepth")
                        .map(u32::from_str)
                        .transpose()
                        .map_err(de::Error::custom)?,
                }
            }
            EntityTypeQueryToken::InheritsFrom => {
                seq.next_element::<Selector>()?
                    .ok_or_else(|| de::Error::invalid_length(self.position, &self))?;
                self.position += 1;

                EntityTypeQueryPath::EntityTypeEdge {
                    edge_kind: OntologyEdgeKind::InheritsFrom,
                    path: Box::new(Self::new(self.position).visit_seq(seq)?),
                    direction: EdgeDirection::Outgoing,
                    inheritance_depth: parameters
                        .remove("inheritanceDepth")
                        .map(u32::from_str)
                        .transpose()
                        .map_err(de::Error::custom)?,
                }
            }
            EntityTypeQueryToken::Children => {
                seq.next_element::<Selector>()?
                    .ok_or_else(|| de::Error::invalid_length(self.position, &self))?;
                self.position += 1;

                EntityTypeQueryPath::EntityTypeEdge {
                    edge_kind: OntologyEdgeKind::InheritsFrom,
                    path: Box::new(Self::new(self.position).visit_seq(seq)?),
                    direction: EdgeDirection::Incoming,
                    inheritance_depth: parameters
                        .remove("inheritanceDepth")
                        .map(u32::from_str)
                        .transpose()
                        .map_err(de::Error::custom)?,
                }
            }
            EntityTypeQueryToken::Schema => {
                let mut path_tokens = Vec::new();
                while let Some(field) = seq.next_element::<PathToken<'de>>()? {
                    path_tokens.push(field);
                    self.position += 1;
                }

                if path_tokens.is_empty() {
                    EntityTypeQueryPath::Schema(None)
                } else {
                    EntityTypeQueryPath::Schema(Some(JsonPath::from_path_tokens(path_tokens)))
                }
            }
            EntityTypeQueryToken::ClosedSchema => {
                let mut path_tokens = Vec::new();
                while let Some(field) = seq.next_element::<PathToken<'de>>()? {
                    path_tokens.push(field);
                    self.position += 1;
                }

                if path_tokens.is_empty() {
                    EntityTypeQueryPath::ClosedSchema(None)
                } else {
                    EntityTypeQueryPath::ClosedSchema(Some(JsonPath::from_path_tokens(path_tokens)))
                }
            }
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

impl<'de: 'p, 'p> Deserialize<'de> for EntityTypeQueryPath<'p> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_seq(EntityTypeQueryPathVisitor::new(0))
    }
}

#[cfg(test)]
mod tests {
    use std::iter::once;

    use super::*;

    fn deserialize<'p>(segments: impl IntoIterator<Item = &'p str>) -> EntityTypeQueryPath<'p> {
        EntityTypeQueryPath::deserialize(
            de::value::SeqDeserializer::<_, de::value::Error>::new(segments.into_iter())
        )
        .expect("could not deserialize path")
    }

    #[test]
    fn deserialization() {
        assert_eq!(deserialize(["baseUrl"]), EntityTypeQueryPath::BaseUrl);
        assert_eq!(deserialize(["version"]), EntityTypeQueryPath::Version);
        assert_eq!(
            deserialize(["versionedUrl"]),
            EntityTypeQueryPath::VersionedUrl
        );
        assert_eq!(deserialize(["ownedById"]), EntityTypeQueryPath::OwnedById);
        assert_eq!(deserialize(["title"]), EntityTypeQueryPath::Title);
        assert_eq!(
            deserialize(["description"]),
            EntityTypeQueryPath::Description
        );
        assert_eq!(deserialize(["examples"]), EntityTypeQueryPath::Examples);
        assert_eq!(
            deserialize(["properties", "*", "version"]),
            EntityTypeQueryPath::PropertyTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsPropertiesOn,
                path: PropertyTypeQueryPath::Version,
                inheritance_depth: None,
            }
        );
        assert_eq!(deserialize(["required"]), EntityTypeQueryPath::Required);
        assert_eq!(
            deserialize(["links", "*", "version"]),
            EntityTypeQueryPath::EntityTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsLinksOn,
                path: Box::new(EntityTypeQueryPath::Version),
                direction: EdgeDirection::Outgoing,
                inheritance_depth: None,
            },
        );

        assert_eq!(
            EntityTypeQueryPath::deserialize(
                de::value::SeqDeserializer::<_, de::value::Error>::new(once("ontology_id"))
            )
            .expect_err(
                "managed to convert entity type query path with hidden token when it should have \
                 errored"
            )
            .to_string(),
            format!(
                "unknown variant `ontology_id`, expected {}",
                EntityTypeQueryPathVisitor::EXPECTING
            )
        );

        assert_eq!(
            EntityTypeQueryPath::deserialize(
                de::value::SeqDeserializer::<_, de::value::Error>::new(once("schema"))
            )
            .expect_err(
                "managed to convert entity type query path with hidden token when it should have \
                 errored"
            )
            .to_string(),
            format!(
                "unknown variant `schema`, expected {}",
                EntityTypeQueryPathVisitor::EXPECTING
            )
        );

        assert_eq!(
            EntityTypeQueryPath::deserialize(
                de::value::SeqDeserializer::<_, de::value::Error>::new(
                    ["baseUrl", "test"].into_iter()
                )
            )
            .expect_err(
                "managed to convert entity type query path with multiple tokens when it should \
                 have errored"
            )
            .to_string(),
            "invalid length 2, expected 1 element in sequence"
        );

        assert_eq!(
            EntityTypeQueryPath::deserialize(
                de::value::SeqDeserializer::<_, de::value::Error>::new(
                    ["properties", "*"].into_iter()
                )
            )
            .expect_err("managed to convert entity type query path with missing tokens")
            .to_string(),
            format!(
                "invalid length 2, expected {}",
                PropertyTypeQueryPathVisitor::EXPECTING
            )
        );

        assert_eq!(
            EntityTypeQueryPath::deserialize(
                de::value::SeqDeserializer::<_, de::value::Error>::new(
                    ["links", "*", "versionedUrl", "invalid"].into_iter()
                )
            )
            .expect_err(
                "managed to convert entity type query path with multiple tokens when it should \
                 have errored"
            )
            .to_string(),
            "invalid length 4, expected 3 elements in sequence"
        );
    }
}
