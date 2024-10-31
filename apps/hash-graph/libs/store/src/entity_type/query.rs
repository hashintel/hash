use core::{
    fmt::{self, Write},
    str::FromStr,
};

use serde::{
    Deserialize, Serialize,
    de::{self, Deserializer, SeqAccess, Visitor},
};
#[cfg(feature = "utoipa")]
use utoipa::ToSchema;

use crate::{
    entity::EntityQueryPath,
    filter::{
        JsonPath, OntologyQueryPath, ParameterType, PathToken, QueryPath, Selector,
        parse_query_token,
    },
    property_type::{PropertyTypeQueryPath, PropertyTypeQueryPathVisitor},
    subgraph::edges::{EdgeDirection, OntologyEdgeKind, SharedEdgeKind},
};

/// A path to a [`EntityType`] field.
///
/// [`EntityType`]: type_system::schema::EntityType
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum EntityTypeQueryPath<'p> {
    /// The [`BaseUrl`] of the [`EntityType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use hash_graph_store::entity_type::EntityTypeQueryPath;
    /// let path = EntityTypeQueryPath::deserialize(json!(["baseUrl"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::BaseUrl);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityType`]: type_system::schema::EntityType
    /// [`BaseUrl`]: type_system::url::BaseUrl
    BaseUrl,
    /// The version of the [`EntityType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use hash_graph_store::entity_type::EntityTypeQueryPath;
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
    /// # use hash_graph_store::{filter::{Filter, FilterExpression, Parameter}};
    /// # use hash_graph_store::entity_type::EntityTypeQueryPath;
    /// # use graph_types::ontology::EntityTypeWithMetadata;
    /// let filter_value = json!({ "equal": [{ "path": ["version"] }, { "parameter": "latest" }] });
    /// let path = Filter::<EntityTypeWithMetadata>::deserialize(filter_value)?;
    /// assert_eq!(path, Filter::Equal(
    ///     Some(FilterExpression::Path { path: EntityTypeQueryPath::Version }),
    ///     Some(FilterExpression::Parameter { parameter: Parameter::Text(Cow::Borrowed("latest")), convert: None }))
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityType`]: type_system::schema::EntityType
    Version,
    /// The [`VersionedUrl`] of the [`EntityType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use hash_graph_store::entity_type::EntityTypeQueryPath;
    /// let path = EntityTypeQueryPath::deserialize(json!(["versionedUrl"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::VersionedUrl);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityType`]: type_system::schema::EntityType
    /// [`VersionedUrl`]: type_system::url::VersionedUrl
    VersionedUrl,
    /// The transaction time of the [`EntityType`].
    ///
    /// It's not possible to query for the temporal axis directly, this has to be done via the
    /// `temporalAxes` parameter on the request.
    ///
    /// [`EntityType`]: type_system::schema::EntityType
    TransactionTime,
    /// The [`OwnedById`] of the [`EntityTypeMetadata`] belonging to the [`EntityType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use hash_graph_store::entity_type::EntityTypeQueryPath;
    /// let path = EntityTypeQueryPath::deserialize(json!(["ownedById"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::OwnedById);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityType`]: type_system::schema::EntityType
    /// [`OwnedById`]: graph_types::owned_by_id::OwnedById
    /// [`EntityTypeMetadata`]: graph_types::ontology::EntityTypeMetadata
    OwnedById,
    /// Corresponds to [`EntityType::title()`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use hash_graph_store::entity_type::EntityTypeQueryPath;
    /// let path = EntityTypeQueryPath::deserialize(json!(["title"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::Title);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityType::title()`]: type_system::schema::EntityType::title
    Title,
    /// Corresponds to [`EntityType::description()`]
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use hash_graph_store::entity_type::EntityTypeQueryPath;
    /// let path = EntityTypeQueryPath::deserialize(json!(["description"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::Description);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityType::description()`]: type_system::schema::EntityType::description
    Description,
    /// Corresponds to [`EntityConstraints::required`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use hash_graph_store::entity_type::EntityTypeQueryPath;
    /// let path = EntityTypeQueryPath::deserialize(json!(["required"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::Required);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityConstraints::required`]: type_system::schema::EntityConstraints::required
    Required,
    /// The label property metadata of the entity type.
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use hash_graph_store::entity_type::EntityTypeQueryPath;
    /// let path = EntityTypeQueryPath::deserialize(json!(["labelProperty"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::LabelProperty);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    LabelProperty,
    /// The icon of the entity type.
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use hash_graph_store::entity_type::EntityTypeQueryPath;
    /// let path = EntityTypeQueryPath::deserialize(json!(["icon"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::Icon);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    Icon,
    /// An edge to a [`PropertyType`] using an [`OntologyEdgeKind`].
    ///
    /// The corresponding reversed edge is [`PropertyTypeQueryPath::EntityTypeEdge`].
    ///
    /// Allowed edge kinds are:
    /// - [`ConstrainsPropertiesOn`]
    ///
    /// [`PropertyType`]: type_system::schema::PropertyType
    /// [`EntityType`]: type_system::schema::EntityType
    /// [`ConstrainsPropertiesOn`]: OntologyEdgeKind::ConstrainsPropertiesOn
    ///
    ///
    /// ## Constraining property types
    ///
    /// As an [`EntityType`] can have multiple [`PropertyType`]s, the deserialized path requires an
    /// additional selector to identify the [`PropertyType`] to query. Currently, only the `*`
    /// selector is available, so the path will be deserialized as `["properties", "*", ...]`
    /// where `...` is the path to the desired field of the [`PropertyType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use hash_graph_store::{entity_type::EntityTypeQueryPath, property_type::PropertyTypeQueryPath};
    /// # use hash_graph_store::subgraph::edges::OntologyEdgeKind;
    /// let path = EntityTypeQueryPath::deserialize(json!(["properties", "*", "baseUrl"]))?;
    /// assert_eq!(
    ///     path,
    ///     EntityTypeQueryPath::PropertyTypeEdge {
    ///         edge_kind: OntologyEdgeKind::ConstrainsPropertiesOn,
    ///         path: PropertyTypeQueryPath::BaseUrl,
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
    /// # use hash_graph_store::{entity_type::EntityTypeQueryPath, property_type::PropertyTypeQueryPath};
    /// # use hash_graph_store::subgraph::edges::OntologyEdgeKind;
    /// let path = EntityTypeQueryPath::deserialize(json!([
    ///     "properties(inheritanceDepth=10)",
    ///     "*",
    ///     "baseUrl"
    /// ]))?;
    /// assert_eq!(
    ///     path,
    ///     EntityTypeQueryPath::PropertyTypeEdge {
    ///         edge_kind: OntologyEdgeKind::ConstrainsPropertiesOn,
    ///         path: PropertyTypeQueryPath::BaseUrl,
    ///         inheritance_depth: Some(10),
    ///     }
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
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
    /// [`EntityType`]: type_system::schema::EntityType
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
    /// # use hash_graph_store::entity_type::EntityTypeQueryPath;
    /// # use hash_graph_store::subgraph::edges::{EdgeDirection, OntologyEdgeKind};
    /// let path = EntityTypeQueryPath::deserialize(json!(["inheritsFrom", "*", "baseUrl"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::EntityTypeEdge {
    ///     edge_kind: OntologyEdgeKind::InheritsFrom,
    ///     path: Box::new(EntityTypeQueryPath::BaseUrl),
    ///     direction: EdgeDirection::Outgoing,
    ///     inheritance_depth: None,
    /// });
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// It's also possible to create a query path for the reversed direction:
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use hash_graph_store::entity_type::EntityTypeQueryPath;
    /// # use hash_graph_store::subgraph::edges::{EdgeDirection, OntologyEdgeKind};
    /// let path = EntityTypeQueryPath::deserialize(json!(["children", "*", "baseUrl"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::EntityTypeEdge {
    ///     edge_kind: OntologyEdgeKind::InheritsFrom,
    ///     path: Box::new(EntityTypeQueryPath::BaseUrl),
    ///     direction: EdgeDirection::Incoming,
    ///     inheritance_depth: None,
    /// });
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
    /// # use hash_graph_store::entity_type::EntityTypeQueryPath;
    /// # use hash_graph_store::subgraph::edges::{EdgeDirection, OntologyEdgeKind};
    /// let path = EntityTypeQueryPath::deserialize(json!([
    ///     "inheritsFrom(inheritanceDepth=10)",
    ///     "*",
    ///     "baseUrl"
    /// ]))?;
    /// assert_eq!(path, EntityTypeQueryPath::EntityTypeEdge {
    ///     edge_kind: OntologyEdgeKind::InheritsFrom,
    ///     path: Box::new(EntityTypeQueryPath::BaseUrl),
    ///     direction: EdgeDirection::Outgoing,
    ///     inheritance_depth: Some(10),
    /// });
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// and similary for the reversed direction:
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use hash_graph_store::entity_type::EntityTypeQueryPath;
    /// # use hash_graph_store::subgraph::edges::{EdgeDirection, OntologyEdgeKind};
    /// let path =
    ///     EntityTypeQueryPath::deserialize(json!(["children(inheritanceDepth=10)", "*", "baseUrl"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::EntityTypeEdge {
    ///     edge_kind: OntologyEdgeKind::InheritsFrom,
    ///     path: Box::new(EntityTypeQueryPath::BaseUrl),
    ///     direction: EdgeDirection::Incoming,
    ///     inheritance_depth: Some(10),
    /// });
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
    /// # use hash_graph_store::entity_type::EntityTypeQueryPath;
    /// # use hash_graph_store::subgraph::edges::{EdgeDirection, OntologyEdgeKind};
    /// let path = EntityTypeQueryPath::deserialize(json!(["links", "*", "baseUrl"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::EntityTypeEdge {
    ///     edge_kind: OntologyEdgeKind::ConstrainsLinksOn,
    ///     path: Box::new(EntityTypeQueryPath::BaseUrl),
    ///     direction: EdgeDirection::Outgoing,
    ///     inheritance_depth: None,
    /// });
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
    /// # use hash_graph_store::entity_type::EntityTypeQueryPath;
    /// # use hash_graph_store::subgraph::edges::{EdgeDirection, OntologyEdgeKind};
    /// let path =
    ///     EntityTypeQueryPath::deserialize(json!(["links(inheritanceDepth=10)", "*", "baseUrl"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::EntityTypeEdge {
    ///     edge_kind: OntologyEdgeKind::ConstrainsLinksOn,
    ///     path: Box::new(EntityTypeQueryPath::BaseUrl),
    ///     direction: EdgeDirection::Outgoing,
    ///     inheritance_depth: Some(10),
    /// });
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityType::link_mappings()`]: type_system::schema::EntityType::link_mappings
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
    /// [`EntityType`]: type_system::schema::PropertyType
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
    /// Corresponds to the provenance data of the [`EntityType`].
    ///
    /// Deserializes from `["editionProvenance", ...]` where `...` is a path to a provenance entry
    /// of an [`EntityType`].
    ///
    /// [`EntityType`]: type_system::schema::EntityType
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use hash_graph_store::entity_type::EntityTypeQueryPath;
    /// let path = EntityTypeQueryPath::deserialize(json!(["editionProvenance", "createdById"]))?;
    /// assert_eq!(path.to_string(), r#"editionProvenance.$."createdById""#);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    EditionProvenance(Option<JsonPath<'p>>),
    /// The embedding for the whole entity blob.
    ///
    /// Deserializes from `["embedding"]`:
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use hash_graph_store::entity_type::EntityTypeQueryPath;
    /// let path = EntityTypeQueryPath::deserialize(json!(["embedding"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::Embedding);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    Embedding,
}

impl OntologyQueryPath for EntityTypeQueryPath<'_> {
    fn base_url() -> Self {
        Self::BaseUrl
    }

    fn version() -> Self {
        Self::Version
    }
}

impl QueryPath for EntityTypeQueryPath<'_> {
    fn expected_type(&self) -> ParameterType {
        match self {
            Self::OntologyId | Self::OwnedById => ParameterType::Uuid,
            Self::Schema(_) | Self::ClosedSchema(_) | Self::AdditionalMetadata => {
                ParameterType::Object
            }
            Self::Required | Self::EditionProvenance(_) => ParameterType::Any,
            Self::BaseUrl | Self::LabelProperty => ParameterType::BaseUrl,
            Self::VersionedUrl => ParameterType::VersionedUrl,
            Self::Version => ParameterType::OntologyTypeVersion,
            Self::TransactionTime => ParameterType::TimeInterval,
            Self::Title | Self::Description | Self::Icon => ParameterType::Text,
            Self::Embedding => ParameterType::Vector(Box::new(ParameterType::F64)),
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
            Self::Schema(Some(path)) => write!(fmt, "schema.{path}"),
            Self::Schema(None) => fmt.write_str("schema"),
            Self::ClosedSchema(Some(path)) => write!(fmt, "closedSchema.{path}"),
            Self::ClosedSchema(None) => fmt.write_str("closedSchema"),
            Self::Title => fmt.write_str("title"),
            Self::Description => fmt.write_str("description"),
            Self::Required => fmt.write_str("required"),
            Self::LabelProperty => fmt.write_str("labelProperty"),
            Self::Icon => fmt.write_str("icon"),
            Self::Embedding => fmt.write_str("embedding"),
            Self::EditionProvenance(Some(path)) => write!(fmt, "editionProvenance.{path}"),
            Self::EditionProvenance(None) => fmt.write_str("editionProvenance"),
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
            } => {
                fmt.write_char('<')?;
                edge_kind.serialize(&mut *fmt)?;
                write!(fmt, ">.{path}")
            }
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
            } => {
                fmt.write_char('<')?;
                edge_kind.serialize(&mut *fmt)?;
                write!(fmt, ">.{path}")
            }
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
#[derive(Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[serde(rename_all = "camelCase")]
pub enum EntityTypeQueryToken {
    BaseUrl,
    Version,
    VersionedUrl,
    OwnedById,
    Title,
    Description,
    Properties,
    Required,
    LabelProperty,
    Icon,
    EditionProvenance,
    Links,
    InheritsFrom,
    Children,
    Embedding,
    #[serde(skip)]
    Schema,
    #[serde(skip)]
    ClosedSchema,
}

/// Deserializes an [`EntityTypeQueryPath`] from a string sequence.
pub(crate) struct EntityTypeQueryPathVisitor {
    /// The current position in the sequence when deserializing.
    position: usize,
}

impl EntityTypeQueryPathVisitor {
    pub(crate) const EXPECTING: &'static str =
        "one of `baseUrl`, `version`, `versionedUrl`, `ownedById`, `title`, `description`, \
         `properties`, `required`, `labelProperty`, `icon`, `editionProvenance`, `links`, \
         `inheritsFrom`, `children`, `embedding`";

    #[must_use]
    pub(crate) const fn new(position: usize) -> Self {
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
            EntityTypeQueryToken::BaseUrl => EntityTypeQueryPath::BaseUrl,
            EntityTypeQueryToken::VersionedUrl => EntityTypeQueryPath::VersionedUrl,
            EntityTypeQueryToken::Version => EntityTypeQueryPath::Version,
            EntityTypeQueryToken::Title => EntityTypeQueryPath::Title,
            EntityTypeQueryToken::Description => EntityTypeQueryPath::Description,
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
            EntityTypeQueryToken::Embedding => EntityTypeQueryPath::Embedding,
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
            EntityTypeQueryToken::EditionProvenance => {
                let mut path_tokens = Vec::new();
                while let Some(field) = seq.next_element::<PathToken<'de>>()? {
                    path_tokens.push(field);
                    self.position += 1;
                }

                if path_tokens.is_empty() {
                    EntityTypeQueryPath::EditionProvenance(None)
                } else {
                    EntityTypeQueryPath::EditionProvenance(Some(JsonPath::from_path_tokens(
                        path_tokens,
                    )))
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

impl EntityTypeQueryPath<'_> {
    #[must_use]
    pub fn into_owned(self) -> EntityTypeQueryPath<'static> {
        match self {
            Self::BaseUrl => EntityTypeQueryPath::BaseUrl,
            Self::Version => EntityTypeQueryPath::Version,
            Self::VersionedUrl => EntityTypeQueryPath::VersionedUrl,
            Self::TransactionTime => EntityTypeQueryPath::TransactionTime,
            Self::OwnedById => EntityTypeQueryPath::OwnedById,
            Self::Title => EntityTypeQueryPath::Title,
            Self::Description => EntityTypeQueryPath::Description,
            Self::Required => EntityTypeQueryPath::Required,
            Self::LabelProperty => EntityTypeQueryPath::LabelProperty,
            Self::Icon => EntityTypeQueryPath::Icon,
            Self::EditionProvenance(path) => {
                EntityTypeQueryPath::EditionProvenance(path.map(JsonPath::into_owned))
            }
            Self::PropertyTypeEdge {
                path,
                edge_kind,
                inheritance_depth,
            } => EntityTypeQueryPath::PropertyTypeEdge {
                path: path.into_owned(),
                edge_kind,
                inheritance_depth,
            },
            Self::EntityTypeEdge {
                path,
                edge_kind,
                inheritance_depth,
                direction,
            } => EntityTypeQueryPath::EntityTypeEdge {
                path: Box::new(path.into_owned()),
                edge_kind,
                inheritance_depth,
                direction,
            },
            Self::EntityEdge {
                path,
                edge_kind,
                inheritance_depth,
            } => EntityTypeQueryPath::EntityEdge {
                path: Box::new(path.into_owned()),
                edge_kind,
                inheritance_depth,
            },
            Self::OntologyId => EntityTypeQueryPath::OntologyId,
            Self::Schema(path) => EntityTypeQueryPath::Schema(path.map(JsonPath::into_owned)),
            Self::Embedding => EntityTypeQueryPath::Embedding,
            Self::ClosedSchema(path) => {
                EntityTypeQueryPath::ClosedSchema(path.map(JsonPath::into_owned))
            }
            Self::AdditionalMetadata => EntityTypeQueryPath::AdditionalMetadata,
        }
    }
}

#[cfg(test)]
mod tests {
    use core::iter::once;

    use super::*;

    fn deserialize<'p>(segments: impl IntoIterator<Item = &'p str>) -> EntityTypeQueryPath<'p> {
        EntityTypeQueryPath::deserialize(de::value::SeqDeserializer::<_, de::value::Error>::new(
            segments.into_iter(),
        ))
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
