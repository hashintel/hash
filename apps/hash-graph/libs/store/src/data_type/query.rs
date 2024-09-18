use core::{
    fmt::{self, Write},
    str::FromStr,
};

use serde::{
    de::{self, Deserializer, SeqAccess, Visitor},
    Deserialize, Serialize,
};
#[cfg(feature = "utoipa")]
use utoipa::ToSchema;

use crate::{
    filter::{
        parse_query_token, JsonPath, OntologyQueryPath, ParameterType, PathToken, QueryPath,
        Selector,
    },
    property_type::PropertyTypeQueryPath,
    subgraph::edges::{EdgeDirection, OntologyEdgeKind},
};

/// A path to a [`DataType`] field.
///
/// Note: [`DataType`]s currently don't reference other [`DataType`]s, so the path can only be a
/// single field. This means, that the path currently will always be a sequence with only one
/// element.
///
/// [`DataType`]: type_system::schema::DataType
// TODO: Adjust enum and docs when adding non-primitive data types
//   see https://linear.app/hash/issue/BP-104
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum DataTypeQueryPath<'p> {
    /// The [`BaseUrl`] of the [`DataType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use hash_graph_store::data_type::DataTypeQueryPath;
    /// let path = DataTypeQueryPath::deserialize(json!(["baseUrl"]))?;
    /// assert_eq!(path, DataTypeQueryPath::BaseUrl);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`DataType`]: type_system::schema::DataType
    /// [`BaseUrl`]: type_system::url::BaseUrl
    BaseUrl,
    /// The version of the [`DataType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use hash_graph_store::data_type::DataTypeQueryPath;
    /// let path = DataTypeQueryPath::deserialize(json!(["version"]))?;
    /// assert_eq!(path, DataTypeQueryPath::Version);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// In addition to specifying the version directly, it's also possible to compare the version
    /// with a `"latest"` parameter, which will only match the latest version of the
    /// [`DataType`].
    ///
    /// ```rust
    /// # use std::borrow::Cow;
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use hash_graph_store::{filter::{Filter, FilterExpression, Parameter}};
    /// # use hash_graph_store::data_type::DataTypeQueryPath;
    /// # use graph_types::ontology::DataTypeWithMetadata;
    /// let filter_value = json!({ "equal": [{ "path": ["version"] }, { "parameter": "latest" }] });
    /// let path = Filter::<DataTypeWithMetadata>::deserialize(filter_value)?;
    /// assert_eq!(path, Filter::Equal(
    ///     Some(FilterExpression::Path(DataTypeQueryPath::Version)),
    ///     Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed("latest")))))
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`DataType`]: type_system::schema::DataType
    Version,
    /// The [`VersionedUrl`] of the [`DataType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use hash_graph_store::data_type::DataTypeQueryPath;
    /// let path = DataTypeQueryPath::deserialize(json!(["versionedUrl"]))?;
    /// assert_eq!(path, DataTypeQueryPath::VersionedUrl);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`VersionedUrl`]: type_system::url::VersionedUrl
    /// [`DataType`]: type_system::schema::DataType
    VersionedUrl,
    /// The transaction time of the [`DataType`].
    ///
    /// It's not possible to query for the temporal axis directly, this has to be done via the
    /// `temporalAxes` parameter on the request.
    ///
    /// [`DataType`]: type_system::schema::DataType
    TransactionTime,
    /// The [`OwnedById`] of the [`DataTypeMetadata`] belonging to the [`DataType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use hash_graph_store::data_type::DataTypeQueryPath;
    /// let path = DataTypeQueryPath::deserialize(json!(["ownedById"]))?;
    /// assert_eq!(path, DataTypeQueryPath::OwnedById);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`DataType`]: type_system::schema::DataType
    /// [`OwnedById`]: graph_types::owned_by_id::OwnedById
    /// [`DataTypeMetadata`]: graph_types::ontology::DataTypeMetadata
    OwnedById,
    /// Corresponds to [`DataType::title()`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use hash_graph_store::data_type::DataTypeQueryPath;
    /// let path = DataTypeQueryPath::deserialize(json!(["title"]))?;
    /// assert_eq!(path, DataTypeQueryPath::Title);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`DataType::title()`]: type_system::schema::DataType::title
    Title,
    /// Corresponds to [`DataType::description()`]
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use hash_graph_store::data_type::DataTypeQueryPath;
    /// let path = DataTypeQueryPath::deserialize(json!(["description"]))?;
    /// assert_eq!(path, DataTypeQueryPath::Description);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`DataType::description()`]: type_system::schema::DataType::description
    Description,
    /// Corresponds to [`DataType::json_type()`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use hash_graph_store::data_type::DataTypeQueryPath;
    /// let path = DataTypeQueryPath::deserialize(json!(["type"]))?;
    /// assert_eq!(path, DataTypeQueryPath::Type);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`DataType::json_type()`]: type_system::schema::DataType::json_type
    Type,
    /// Only used internally and not available for deserialization.
    OntologyId,
    /// Only used internally and not available for deserialization.
    Schema(Option<JsonPath<'p>>),
    /// An edge between two [`DataType`]s using an [`OntologyEdgeKind`].
    ///
    /// Allowed edge kinds are:
    /// - [`InheritsFrom`]
    ///
    /// [`DataType`]: type_system::schema::DataType
    /// [`InheritsFrom`]: OntologyEdgeKind::InheritsFrom
    ///
    ///
    /// ## Inheritance
    ///
    /// Currently, does not correspond to any field of [`DataType`].
    ///
    /// In the future, this will most likely correspond to something like
    /// `DataType::inherits_from()`.
    ///
    /// As an [`DataType`] can inherit from multiple [`DataType`]s, the deserialized path
    /// requires an additional selector to identify the [`DataType`] to query. Currently,
    /// only the `*` selector is available, so the path will be deserialized as
    /// `["inheritsFrom", "*", ...]` where `...` is the path to the desired field of the
    /// [`DataType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use hash_graph_store::data_type::DataTypeQueryPath;
    /// # use hash_graph_store::subgraph::edges::{EdgeDirection, OntologyEdgeKind};
    /// let path = DataTypeQueryPath::deserialize(json!(["inheritsFrom", "*", "baseUrl"]))?;
    /// assert_eq!(
    ///     path,
    ///     DataTypeQueryPath::DataTypeEdge {
    ///         edge_kind: OntologyEdgeKind::InheritsFrom,
    ///         path: Box::new(DataTypeQueryPath::BaseUrl),
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
    /// # use hash_graph_store::data_type::DataTypeQueryPath;
    /// # use hash_graph_store::subgraph::edges::{EdgeDirection, OntologyEdgeKind};
    /// let path = DataTypeQueryPath::deserialize(json!(["children", "*", "baseUrl"]))?;
    /// assert_eq!(
    ///     path,
    ///     DataTypeQueryPath::DataTypeEdge {
    ///         edge_kind: OntologyEdgeKind::InheritsFrom,
    ///         path: Box::new(DataTypeQueryPath::BaseUrl),
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
    /// # use hash_graph_store::data_type::DataTypeQueryPath;
    /// # use hash_graph_store::subgraph::edges::{EdgeDirection, OntologyEdgeKind};
    /// let path = DataTypeQueryPath::deserialize(json!([
    ///     "inheritsFrom(inheritanceDepth=10)",
    ///     "*",
    ///     "baseUrl"
    /// ]))?;
    /// assert_eq!(
    ///     path,
    ///     DataTypeQueryPath::DataTypeEdge {
    ///         edge_kind: OntologyEdgeKind::InheritsFrom,
    ///         path: Box::new(DataTypeQueryPath::BaseUrl),
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
    /// # use hash_graph_store::data_type::DataTypeQueryPath;
    /// # use hash_graph_store::subgraph::edges::{EdgeDirection, OntologyEdgeKind};
    /// let path =
    ///     DataTypeQueryPath::deserialize(json!(["children(inheritanceDepth=10)", "*", "baseUrl"]))?;
    /// assert_eq!(
    ///     path,
    ///     DataTypeQueryPath::DataTypeEdge {
    ///         edge_kind: OntologyEdgeKind::InheritsFrom,
    ///         path: Box::new(DataTypeQueryPath::BaseUrl),
    ///         direction: EdgeDirection::Incoming,
    ///         inheritance_depth: Some(10),
    ///     }
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    DataTypeEdge {
        edge_kind: OntologyEdgeKind,
        path: Box<Self>,
        direction: EdgeDirection,
        inheritance_depth: Option<u32>,
    },
    /// A reversed edge from a [`PropertyType`] to this [`DataType`] using an [`OntologyEdgeKind`].
    ///
    /// The corresponding edge is [`PropertyTypeQueryPath::DataTypeEdge`].
    ///
    /// Allowed edge kinds are:
    /// - [`ConstrainsValuesOn`]
    ///
    /// Only used internally and not available for deserialization.
    ///
    /// [`ConstrainsValuesOn`]: OntologyEdgeKind::ConstrainsValuesOn
    /// [`DataType`]: type_system::schema::DataType
    /// [`PropertyType`]: type_system::schema::PropertyType
    PropertyTypeEdge {
        edge_kind: OntologyEdgeKind,
        path: Box<PropertyTypeQueryPath<'p>>,
    },
    /// Only used internally and not available for deserialization.
    AdditionalMetadata,
    /// The embedding for the whole entity blob.
    ///
    /// Deserializes from `["embedding"]`:
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use hash_graph_store::data_type::DataTypeQueryPath;
    /// let path = DataTypeQueryPath::deserialize(json!(["embedding"]))?;
    /// assert_eq!(path, DataTypeQueryPath::Embedding);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    Embedding,
    /// Corresponds to the provenance data of the [`DataType`].
    ///
    /// Deserializes from `["editionProvenance", ...]` where `...` is a path to a provenance entry
    /// of an [`DataType`].
    ///
    /// [`DataType`]: type_system::schema::DataType
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use hash_graph_store::data_type::DataTypeQueryPath;
    /// let path = DataTypeQueryPath::deserialize(json!(["editionProvenance", "createdById"]))?;
    /// assert_eq!(path.to_string(), r#"editionProvenance.$."createdById""#);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    EditionProvenance(Option<JsonPath<'p>>),
    /// Only used internally and not available for deserialization.
    TargetConversionBaseUrls,
    /// Only used internally and not available for deserialization.
    FromConversions,
    /// Only used internally and not available for deserialization.
    IntoConversions,
}

impl OntologyQueryPath for DataTypeQueryPath<'_> {
    fn base_url() -> Self {
        Self::BaseUrl
    }

    fn version() -> Self {
        Self::Version
    }
}

impl QueryPath for DataTypeQueryPath<'_> {
    fn expected_type(&self) -> ParameterType {
        match self {
            Self::OntologyId | Self::OwnedById => ParameterType::Uuid,
            Self::Schema(_) | Self::AdditionalMetadata => ParameterType::Object,
            Self::BaseUrl => ParameterType::BaseUrl,
            Self::VersionedUrl => ParameterType::VersionedUrl,
            Self::TransactionTime => ParameterType::TimeInterval,
            Self::Version => ParameterType::OntologyTypeVersion,
            Self::Description | Self::Title | Self::Type => ParameterType::Text,
            Self::Embedding => ParameterType::Vector(Box::new(ParameterType::F64)),
            Self::TargetConversionBaseUrls => {
                ParameterType::Vector(Box::new(ParameterType::BaseUrl))
            }
            Self::FromConversions | Self::IntoConversions => {
                ParameterType::Vector(Box::new(ParameterType::Object))
            }
            Self::EditionProvenance(_) => ParameterType::Any,
            Self::DataTypeEdge { path, .. } => path.expected_type(),
            Self::PropertyTypeEdge { path, .. } => path.expected_type(),
        }
    }
}

impl fmt::Display for DataTypeQueryPath<'_> {
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
            Self::Title => fmt.write_str("title"),
            Self::Description => fmt.write_str("description"),
            Self::Type => fmt.write_str("type"),
            Self::AdditionalMetadata => fmt.write_str("additionalMetadata"),
            Self::EditionProvenance(Some(path)) => write!(fmt, "editionProvenance.{path}"),
            Self::EditionProvenance(None) => fmt.write_str("editionProvenance"),
            Self::Embedding => fmt.write_str("embedding"),
            Self::TargetConversionBaseUrls => fmt.write_str("targetConversionBaseUrls"),
            Self::FromConversions => fmt.write_str("fromConversions"),
            Self::IntoConversions => fmt.write_str("toConversions"),
            Self::DataTypeEdge {
                edge_kind, path, ..
            } => {
                fmt.write_char('<')?;
                edge_kind.serialize(&mut *fmt)?;
                write!(fmt, ">.{path}")
            }
            Self::PropertyTypeEdge {
                edge_kind, path, ..
            } => {
                fmt.write_char('<')?;
                edge_kind.serialize(&mut *fmt)?;
                write!(fmt, ">.{path}")
            }
        }
    }
}

/// A single token in a [`DataTypeQueryPath`].
#[derive(Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[serde(rename_all = "camelCase")]
pub enum DataTypeQueryToken {
    BaseUrl,
    Version,
    VersionedUrl,
    OwnedById,
    Title,
    Description,
    Type,
    InheritsFrom,
    Children,
    EditionProvenance,
    Embedding,
    #[serde(skip)]
    Schema,
}

/// Deserializes a [`DataTypeQueryPath`] from a string sequence.
pub(crate) struct DataTypeQueryPathVisitor {
    /// The current position in the sequence when deserializing.
    position: usize,
}

impl DataTypeQueryPathVisitor {
    pub(crate) const EXPECTING: &'static str =
        "one of `baseUrl`, `version`, `versionedUrl`, `ownedById`, `title`, `description`, \
         `type`, `inheritsFrom`, `children`, `editionProvenance`, `embedding`";

    #[must_use]
    pub(crate) const fn new(position: usize) -> Self {
        Self { position }
    }
}

impl<'de> Visitor<'de> for DataTypeQueryPathVisitor {
    type Value = DataTypeQueryPath<'de>;

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

        Ok(match token {
            DataTypeQueryToken::OwnedById => DataTypeQueryPath::OwnedById,
            DataTypeQueryToken::BaseUrl => DataTypeQueryPath::BaseUrl,
            DataTypeQueryToken::VersionedUrl => DataTypeQueryPath::VersionedUrl,
            DataTypeQueryToken::Version => DataTypeQueryPath::Version,
            DataTypeQueryToken::Title => DataTypeQueryPath::Title,
            DataTypeQueryToken::Description => DataTypeQueryPath::Description,
            DataTypeQueryToken::Type => DataTypeQueryPath::Type,
            DataTypeQueryToken::InheritsFrom => {
                seq.next_element::<Selector>()?
                    .ok_or_else(|| de::Error::invalid_length(self.position, &self))?;
                self.position += 1;

                DataTypeQueryPath::DataTypeEdge {
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
            DataTypeQueryToken::Children => {
                seq.next_element::<Selector>()?
                    .ok_or_else(|| de::Error::invalid_length(self.position, &self))?;
                self.position += 1;

                DataTypeQueryPath::DataTypeEdge {
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
            DataTypeQueryToken::Embedding => DataTypeQueryPath::Embedding,
            DataTypeQueryToken::Schema => {
                let mut path_tokens = Vec::new();
                while let Some(field) = seq.next_element::<PathToken<'de>>()? {
                    path_tokens.push(field);
                    self.position += 1;
                }

                if path_tokens.is_empty() {
                    DataTypeQueryPath::Schema(None)
                } else {
                    DataTypeQueryPath::Schema(Some(JsonPath::from_path_tokens(path_tokens)))
                }
            }
            DataTypeQueryToken::EditionProvenance => {
                let mut path_tokens = Vec::new();
                while let Some(property) = seq.next_element::<PathToken<'de>>()? {
                    path_tokens.push(property);
                    self.position += 1;
                }

                if path_tokens.is_empty() {
                    DataTypeQueryPath::EditionProvenance(None)
                } else {
                    DataTypeQueryPath::EditionProvenance(Some(JsonPath::from_path_tokens(
                        path_tokens,
                    )))
                }
            }
        })
    }
}

impl<'de: 'p, 'p> Deserialize<'de> for DataTypeQueryPath<'p> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_seq(DataTypeQueryPathVisitor::new(0))
    }
}

impl DataTypeQueryPath<'_> {
    #[must_use]
    pub fn into_owned(self) -> DataTypeQueryPath<'static> {
        match self {
            Self::BaseUrl => DataTypeQueryPath::BaseUrl,
            Self::Version => DataTypeQueryPath::Version,
            Self::VersionedUrl => DataTypeQueryPath::VersionedUrl,
            Self::TransactionTime => DataTypeQueryPath::TransactionTime,
            Self::OwnedById => DataTypeQueryPath::OwnedById,
            Self::Title => DataTypeQueryPath::Title,
            Self::Description => DataTypeQueryPath::Description,
            Self::OntologyId => DataTypeQueryPath::OntologyId,
            Self::Schema(path) => DataTypeQueryPath::Schema(path.map(JsonPath::into_owned)),
            Self::AdditionalMetadata => DataTypeQueryPath::AdditionalMetadata,
            Self::Type => DataTypeQueryPath::Type,
            Self::Embedding => DataTypeQueryPath::Embedding,
            Self::TargetConversionBaseUrls => DataTypeQueryPath::TargetConversionBaseUrls,
            Self::FromConversions => DataTypeQueryPath::FromConversions,
            Self::IntoConversions => DataTypeQueryPath::IntoConversions,
            Self::EditionProvenance(path) => {
                DataTypeQueryPath::EditionProvenance(path.map(JsonPath::into_owned))
            }
            Self::DataTypeEdge {
                path,
                edge_kind,
                direction,
                inheritance_depth,
            } => DataTypeQueryPath::DataTypeEdge {
                path: Box::new(path.into_owned()),
                edge_kind,
                direction,
                inheritance_depth,
            },
            Self::PropertyTypeEdge { path, edge_kind } => DataTypeQueryPath::PropertyTypeEdge {
                path: Box::new(path.into_owned()),
                edge_kind,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use core::iter::once;

    use super::*;

    fn deserialize<'p>(segments: impl IntoIterator<Item = &'p str>) -> DataTypeQueryPath<'p> {
        DataTypeQueryPath::deserialize(de::value::SeqDeserializer::<_, de::value::Error>::new(
            segments.into_iter(),
        ))
        .expect("could not deserialize path")
    }

    #[test]
    fn deserialization() {
        assert_eq!(deserialize(["baseUrl"]), DataTypeQueryPath::BaseUrl);
        assert_eq!(deserialize(["version"]), DataTypeQueryPath::Version);
        assert_eq!(
            deserialize(["versionedUrl"]),
            DataTypeQueryPath::VersionedUrl
        );
        assert_eq!(deserialize(["ownedById"]), DataTypeQueryPath::OwnedById);
        assert_eq!(deserialize(["type"]), DataTypeQueryPath::Type);
        assert_eq!(deserialize(["title"]), DataTypeQueryPath::Title);
        assert_eq!(deserialize(["description"]), DataTypeQueryPath::Description);

        assert_eq!(
            DataTypeQueryPath::deserialize(de::value::SeqDeserializer::<_, de::value::Error>::new(
                once("ontology_id")
            ))
            .expect_err(
                "managed to convert data type query path with hidden token when it should have \
                 errored"
            )
            .to_string(),
            format!(
                "unknown variant `ontology_id`, expected {}",
                DataTypeQueryPathVisitor::EXPECTING
            )
        );

        assert_eq!(
            DataTypeQueryPath::deserialize(de::value::SeqDeserializer::<_, de::value::Error>::new(
                once("schema")
            ))
            .expect_err(
                "managed to convert data type query path with hidden token when it should have \
                 errored"
            )
            .to_string(),
            format!(
                "unknown variant `schema`, expected {}",
                DataTypeQueryPathVisitor::EXPECTING
            )
        );

        assert_eq!(
            DataTypeQueryPath::deserialize(de::value::SeqDeserializer::<_, de::value::Error>::new(
                ["baseUrl", "test"].into_iter()
            ))
            .expect_err(
                "managed to convert data type query path with multiple tokens when it should have \
                 errored"
            )
            .to_string(),
            "invalid length 2, expected 1 element in sequence"
        );
    }
}
