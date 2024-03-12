use std::{fmt, fmt::Write};

use serde::{
    de::{self, Deserializer, SeqAccess, Visitor},
    Deserialize, Serialize,
};
#[cfg(feature = "utoipa")]
use utoipa::ToSchema;

use crate::{
    ontology::{
        data_type::DataTypeQueryPathVisitor, DataTypeQueryPath, EntityTypeQueryPath, Selector,
    },
    store::query::{JsonPath, OntologyQueryPath, ParameterType, PathToken, QueryPath},
    subgraph::edges::{EdgeDirection, OntologyEdgeKind},
};

/// A path to a [`PropertyType`] field.
///
/// [`PropertyType`]: type_system::PropertyType
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum PropertyTypeQueryPath<'p> {
    /// The [`BaseUrl`] of the [`PropertyType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::PropertyTypeQueryPath;
    /// let path = PropertyTypeQueryPath::deserialize(json!(["baseUrl"]))?;
    /// assert_eq!(path, PropertyTypeQueryPath::BaseUrl);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`PropertyType`]: type_system::PropertyType
    /// [`BaseUrl`]: type_system::url::BaseUrl
    BaseUrl,
    /// The version of the [`PropertyType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::PropertyTypeQueryPath;
    /// let path = PropertyTypeQueryPath::deserialize(json!(["version"]))?;
    /// assert_eq!(path, PropertyTypeQueryPath::Version);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// In addition to specifying the version directly, it's also possible to compare the version
    /// with a `"latest"` parameter, which will only match the latest version of the
    /// [`PropertyType`].
    ///
    /// [`PropertyType`]: type_system::PropertyType
    Version,
    /// The [`VersionedUrl`] of the [`PropertyType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::PropertyTypeQueryPath;
    /// let path = PropertyTypeQueryPath::deserialize(json!(["versionedUrl"]))?;
    /// assert_eq!(path, PropertyTypeQueryPath::VersionedUrl);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`PropertyType`]: type_system::PropertyType
    /// [`VersionedUrl`]: type_system::url::VersionedUrl
    VersionedUrl,
    /// The transaction time of the [`PropertyType`].
    ///
    /// It's not possible to query for the temporal axis directly, this has to be done via the
    /// `temporalAxes` parameter on [`StructuralQuery`].
    ///
    /// [`PropertyType`]: type_system::PropertyType
    /// [`StructuralQuery`]: crate::subgraph::query::StructuralQuery
    TransactionTime,
    /// The [`OwnedById`] of the [`PropertyTypeMetadata`] belonging to the [`PropertyType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::PropertyTypeQueryPath;
    /// let path = PropertyTypeQueryPath::deserialize(json!(["ownedById"]))?;
    /// assert_eq!(path, PropertyTypeQueryPath::OwnedById);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`PropertyType`]: type_system::PropertyType
    /// [`OwnedById`]: graph_types::owned_by_id::OwnedById
    /// [`PropertyTypeMetadata`]: graph_types::ontology::PropertyTypeMetadata
    OwnedById,
    /// The [`CreatedById`] of the [`OntologyProvenanceMetadata`] belonging to the
    /// [`PropertyType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::PropertyTypeQueryPath;
    /// let path = PropertyTypeQueryPath::deserialize(json!(["editionCreatedById"]))?;
    /// assert_eq!(path, PropertyTypeQueryPath::EditionCreatedById);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`PropertyType`]: type_system::PropertyType
    /// [`CreatedById`]: graph_types::account::CreatedById
    /// [`OntologyProvenanceMetadata`]: graph_types::ontology::OntologyProvenanceMetadata
    EditionCreatedById,
    /// The [`ArchivedById`] of the [`OntologyProvenanceMetadata`] belonging to the
    /// [`PropertyType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::PropertyTypeQueryPath;
    /// let path = PropertyTypeQueryPath::deserialize(json!(["editionArchivedById"]))?;
    /// assert_eq!(path, PropertyTypeQueryPath::EditionArchivedById);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`PropertyType`]: type_system::PropertyType
    /// [`ArchivedById`]: graph_types::account::EditionArchivedById
    /// [`OntologyProvenanceMetadata`]: graph_types::ontology::OntologyProvenanceMetadata
    EditionArchivedById,
    /// Corresponds to [`PropertyType::title()`].
    ///
    /// [`PropertyType::title()`]: type_system::PropertyType::title
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::PropertyTypeQueryPath;
    /// let path = PropertyTypeQueryPath::deserialize(json!(["title"]))?;
    /// assert_eq!(path, PropertyTypeQueryPath::Title);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    Title,
    /// Corresponds to [`PropertyType::description()`]
    ///
    /// [`PropertyType::description()`]: type_system::PropertyType::description
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::PropertyTypeQueryPath;
    /// let path = PropertyTypeQueryPath::deserialize(json!(["description"]))?;
    /// assert_eq!(path, PropertyTypeQueryPath::Description);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    Description,
    /// An edge to a [`DataType`] using an [`OntologyEdgeKind`].
    ///
    /// The corresponding reversed edge is [`DataTypeQueryPath::PropertyTypeEdge`].
    ///
    /// Allowed edge kinds are:
    /// - [`ConstrainsValuesOn`]
    ///
    /// [`DataType`]: type_system::DataType
    /// [`ConstrainsValuesOn`]: OntologyEdgeKind::ConstrainsValuesOn
    /// [`PropertyType`]: type_system::PropertyType
    ///
    /// ## Constraining data types
    ///
    /// As a [`PropertyType`] can have multiple [`DataType`]s, the deserialized path requires an
    /// additional selector to identify the [`DataType`] to query. Currently, only the `*` selector
    /// is available, so the path will be deserialized as `["dataTypes", "*", ...]` where `...` is
    /// the path to the desired field of the [`DataType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::{DataTypeQueryPath, PropertyTypeQueryPath};
    /// # use graph::subgraph::edges::OntologyEdgeKind;
    /// let path = PropertyTypeQueryPath::deserialize(json!(["dataTypes", "*", "title"]))?;
    /// assert_eq!(
    ///     path,
    ///     PropertyTypeQueryPath::DataTypeEdge {
    ///         edge_kind: OntologyEdgeKind::ConstrainsValuesOn,
    ///         path: DataTypeQueryPath::Title,
    ///     }
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    DataTypeEdge {
        edge_kind: OntologyEdgeKind,
        path: DataTypeQueryPath<'p>,
    },
    /// An edge between two [`PropertyType`]s using an [`OntologyEdgeKind`].
    ///
    /// Allowed edge kinds are:
    /// - [`ConstrainsPropertiesOn`]
    ///
    /// [`ConstrainsPropertiesOn`]: OntologyEdgeKind::ConstrainsPropertiesOn
    /// [`PropertyType`]: type_system::PropertyType
    ///
    /// ## Constraining other property types
    ///
    /// As a [`PropertyType`] can have multiple nested [`PropertyType`]s, the deserialized path
    /// requires an additional selector to identify the [`PropertyType`] to query. Currently, only
    /// the `*` selector is available, so the path will be deserialized as `["propertyTypes", "*",
    /// ...]` where `...` is the path to the desired field of the [`PropertyType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::PropertyTypeQueryPath;
    /// # use graph::subgraph::edges::{EdgeDirection, OntologyEdgeKind};
    /// let path = PropertyTypeQueryPath::deserialize(json!(["propertyTypes", "*", "title"]))?;
    /// assert_eq!(
    ///     path,
    ///     PropertyTypeQueryPath::PropertyTypeEdge {
    ///         edge_kind: OntologyEdgeKind::ConstrainsPropertiesOn,
    ///         path: Box::new(PropertyTypeQueryPath::Title),
    ///         direction: EdgeDirection::Outgoing,
    ///     }
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    PropertyTypeEdge {
        edge_kind: OntologyEdgeKind,
        path: Box<Self>,
        direction: EdgeDirection,
    },
    /// A reversed edge from an [`EntityType`] to this [`PropertyType`] using an
    /// [`OntologyEdgeKind`].
    ///
    /// The corresponding edge is [`EntityTypeQueryPath::PropertyTypeEdge`].
    ///
    /// Allowed edge kinds are:
    /// - [`ConstrainsPropertiesOn`]
    ///
    /// [`ConstrainsPropertiesOn`]: OntologyEdgeKind::ConstrainsPropertiesOn
    /// [`PropertyType`]: type_system::PropertyType
    /// [`EntityType`]: type_system::PropertyType
    ///
    /// ## Constraining other property types
    ///
    /// Only used internally and not available for deserialization.
    EntityTypeEdge {
        edge_kind: OntologyEdgeKind,
        path: Box<EntityTypeQueryPath<'p>>,
        inheritance_depth: Option<u32>,
    },
    /// Only used internally and not available for deserialization.
    OntologyId,
    /// Only used internally and not available for deserialization.
    Schema(Option<JsonPath<'p>>),
    /// Only used internally and not available for deserialization.
    AdditionalMetadata,
    /// The embedding for the whole entity blob.
    ///
    /// Deserializes from `["embedding"]`:
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::PropertyTypeQueryPath;
    /// let path = PropertyTypeQueryPath::deserialize(json!(["embedding"]))?;
    /// assert_eq!(path, PropertyTypeQueryPath::Embedding);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    Embedding,
}

impl OntologyQueryPath for PropertyTypeQueryPath<'_> {
    fn base_url() -> Self {
        Self::BaseUrl
    }

    fn version() -> Self {
        Self::Version
    }
}

impl QueryPath for PropertyTypeQueryPath<'_> {
    fn expected_type(&self) -> ParameterType {
        match self {
            Self::OntologyId
            | Self::OwnedById
            | Self::EditionCreatedById
            | Self::EditionArchivedById => ParameterType::Uuid,
            Self::Schema(_) | Self::AdditionalMetadata => ParameterType::Object,
            Self::BaseUrl => ParameterType::BaseUrl,
            Self::VersionedUrl => ParameterType::VersionedUrl,
            Self::Version => ParameterType::OntologyTypeVersion,
            Self::TransactionTime => ParameterType::TimeInterval,
            Self::Title | Self::Description => ParameterType::Text,
            Self::Embedding => ParameterType::Vector,
            Self::DataTypeEdge { path, .. } => path.expected_type(),
            Self::PropertyTypeEdge { path, .. } => path.expected_type(),
            Self::EntityTypeEdge { path, .. } => path.expected_type(),
        }
    }
}

impl fmt::Display for PropertyTypeQueryPath<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::OntologyId => fmt.write_str("ontologyId"),
            Self::BaseUrl => fmt.write_str("baseUrl"),
            Self::Version => fmt.write_str("version"),
            Self::VersionedUrl => fmt.write_str("versionedUrl"),
            Self::TransactionTime => fmt.write_str("transactionTime"),
            Self::OwnedById => fmt.write_str("ownedById"),
            Self::EditionCreatedById => fmt.write_str("editionCreatedById"),
            Self::EditionArchivedById => fmt.write_str("editionArchivedById"),
            Self::Schema(Some(path)) => write!(fmt, "schema.{path}"),
            Self::Schema(None) => fmt.write_str("schema"),
            Self::Title => fmt.write_str("title"),
            Self::Description => fmt.write_str("description"),
            Self::Embedding => fmt.write_str("embedding"),
            Self::DataTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsValuesOn,
                path,
            } => write!(fmt, "dataTypes.{path}"),
            Self::DataTypeEdge { edge_kind, path } => {
                fmt.write_char('<')?;
                edge_kind.serialize(&mut *fmt)?;
                write!(fmt, ">.{path}")
            }
            Self::PropertyTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsPropertiesOn,
                path,
                ..
            } => write!(fmt, "propertyTypes.{path}"),
            Self::PropertyTypeEdge {
                edge_kind, path, ..
            } => {
                fmt.write_char('<')?;
                edge_kind.serialize(&mut *fmt)?;
                write!(fmt, ">.{path}")
            }
            Self::EntityTypeEdge {
                edge_kind, path, ..
            } => {
                fmt.write_char('<')?;
                edge_kind.serialize(&mut *fmt)?;
                write!(fmt, ">.{path}")
            }
            Self::AdditionalMetadata => fmt.write_str("additionalMetadata"),
        }
    }
}

/// A single token in a [`DataTypeQueryPath`].
#[derive(Deserialize)]
#[cfg_attr(feature = "utoipa", derive(ToSchema))]
#[serde(rename_all = "camelCase")]
pub enum PropertyTypeQueryToken {
    BaseUrl,
    Version,
    VersionedUrl,
    OwnedById,
    EditionCreatedById,
    EditionArchivedById,
    Title,
    Description,
    DataTypes,
    PropertyTypes,
    Embedding,
    #[serde(skip)]
    Schema,
}

/// Deserializes a [`PropertyTypeQueryPath`] from a string sequence.
pub struct PropertyTypeQueryPathVisitor {
    /// The current position in the sequence when deserializing.
    position: usize,
}

impl PropertyTypeQueryPathVisitor {
    pub const EXPECTING: &'static str =
        "one of `baseUrl`, `version`, `versionedUrl`, `ownedById`, `editionCreatedById`, \
         `editionArchivedById`, `title`, `description`, `dataTypes`, `propertyTypes`, `embedding`";

    #[must_use]
    pub const fn new(position: usize) -> Self {
        Self { position }
    }
}

impl<'de> Visitor<'de> for PropertyTypeQueryPathVisitor {
    type Value = PropertyTypeQueryPath<'de>;

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
            PropertyTypeQueryToken::OwnedById => PropertyTypeQueryPath::OwnedById,
            PropertyTypeQueryToken::EditionCreatedById => PropertyTypeQueryPath::EditionCreatedById,
            PropertyTypeQueryToken::EditionArchivedById => {
                PropertyTypeQueryPath::EditionArchivedById
            }
            PropertyTypeQueryToken::BaseUrl => PropertyTypeQueryPath::BaseUrl,
            PropertyTypeQueryToken::VersionedUrl => PropertyTypeQueryPath::VersionedUrl,
            PropertyTypeQueryToken::Version => PropertyTypeQueryPath::Version,
            PropertyTypeQueryToken::Title => PropertyTypeQueryPath::Title,
            PropertyTypeQueryToken::Description => PropertyTypeQueryPath::Description,
            PropertyTypeQueryToken::Embedding => PropertyTypeQueryPath::Embedding,
            PropertyTypeQueryToken::DataTypes => {
                seq.next_element::<Selector>()?
                    .ok_or_else(|| de::Error::invalid_length(self.position, &self))?;
                self.position += 1;

                PropertyTypeQueryPath::DataTypeEdge {
                    edge_kind: OntologyEdgeKind::ConstrainsValuesOn,
                    path: DataTypeQueryPathVisitor::new(self.position).visit_seq(seq)?,
                }
            }
            PropertyTypeQueryToken::PropertyTypes => {
                seq.next_element::<Selector>()?
                    .ok_or_else(|| de::Error::invalid_length(self.position, &self))?;
                self.position += 1;

                PropertyTypeQueryPath::PropertyTypeEdge {
                    edge_kind: OntologyEdgeKind::ConstrainsPropertiesOn,
                    path: Box::new(Self::new(self.position).visit_seq(seq)?),
                    direction: EdgeDirection::Outgoing,
                }
            }
            PropertyTypeQueryToken::Schema => {
                let mut path_tokens = Vec::new();
                while let Some(field) = seq.next_element::<PathToken<'de>>()? {
                    path_tokens.push(field);
                    self.position += 1;
                }

                if path_tokens.is_empty() {
                    PropertyTypeQueryPath::Schema(None)
                } else {
                    PropertyTypeQueryPath::Schema(Some(JsonPath::from_path_tokens(path_tokens)))
                }
            }
        })
    }
}

impl<'de: 'p, 'p> Deserialize<'de> for PropertyTypeQueryPath<'p> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_seq(PropertyTypeQueryPathVisitor::new(0))
    }
}

impl PropertyTypeQueryPath<'_> {
    #[must_use]
    pub fn into_owned(self) -> PropertyTypeQueryPath<'static> {
        match self {
            Self::BaseUrl => PropertyTypeQueryPath::BaseUrl,
            Self::Version => PropertyTypeQueryPath::Version,
            Self::VersionedUrl => PropertyTypeQueryPath::VersionedUrl,
            Self::TransactionTime => PropertyTypeQueryPath::TransactionTime,
            Self::OwnedById => PropertyTypeQueryPath::OwnedById,
            Self::EditionCreatedById => PropertyTypeQueryPath::EditionCreatedById,
            Self::EditionArchivedById => PropertyTypeQueryPath::EditionArchivedById,
            Self::Title => PropertyTypeQueryPath::Title,
            Self::Description => PropertyTypeQueryPath::Description,
            Self::Embedding => PropertyTypeQueryPath::Embedding,
            Self::DataTypeEdge { path, edge_kind } => PropertyTypeQueryPath::DataTypeEdge {
                path: path.into_owned(),
                edge_kind,
            },
            Self::PropertyTypeEdge {
                path,
                edge_kind,
                direction,
            } => PropertyTypeQueryPath::PropertyTypeEdge {
                path: Box::new(path.into_owned()),
                edge_kind,
                direction,
            },
            Self::EntityTypeEdge {
                path,
                edge_kind,
                inheritance_depth,
            } => PropertyTypeQueryPath::EntityTypeEdge {
                path: Box::new(path.into_owned()),
                edge_kind,
                inheritance_depth,
            },
            Self::OntologyId => PropertyTypeQueryPath::OntologyId,
            Self::Schema(path) => PropertyTypeQueryPath::Schema(path.map(JsonPath::into_owned)),
            Self::AdditionalMetadata => PropertyTypeQueryPath::AdditionalMetadata,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::iter::once;

    use super::*;

    fn deserialize<'p>(segments: impl IntoIterator<Item = &'p str>) -> PropertyTypeQueryPath<'p> {
        PropertyTypeQueryPath::deserialize(de::value::SeqDeserializer::<_, de::value::Error>::new(
            segments.into_iter(),
        ))
        .expect("could not deserialize path")
    }

    #[test]
    fn deserialization() {
        assert_eq!(deserialize(["baseUrl"]), PropertyTypeQueryPath::BaseUrl);
        assert_eq!(deserialize(["version"]), PropertyTypeQueryPath::Version);
        assert_eq!(
            deserialize(["versionedUrl"]),
            PropertyTypeQueryPath::VersionedUrl
        );
        assert_eq!(deserialize(["ownedById"]), PropertyTypeQueryPath::OwnedById);
        assert_eq!(deserialize(["title"]), PropertyTypeQueryPath::Title);
        assert_eq!(
            deserialize(["description"]),
            PropertyTypeQueryPath::Description
        );
        assert_eq!(
            deserialize(["dataTypes", "*", "version"]),
            PropertyTypeQueryPath::DataTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsValuesOn,
                path: DataTypeQueryPath::Version
            }
        );
        assert_eq!(
            deserialize(["propertyTypes", "*", "baseUrl"]),
            PropertyTypeQueryPath::PropertyTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsPropertiesOn,
                path: Box::new(PropertyTypeQueryPath::BaseUrl),
                direction: EdgeDirection::Outgoing,
            }
        );

        assert_eq!(
            PropertyTypeQueryPath::deserialize(
                de::value::SeqDeserializer::<_, de::value::Error>::new(once("ontology_id"))
            )
            .expect_err(
                "managed to convert property type query path with hidden token when it should \
                 have errored"
            )
            .to_string(),
            format!(
                "unknown variant `ontology_id`, expected {}",
                PropertyTypeQueryPathVisitor::EXPECTING
            )
        );

        assert_eq!(
            PropertyTypeQueryPath::deserialize(
                de::value::SeqDeserializer::<_, de::value::Error>::new(once("schema"))
            )
            .expect_err(
                "managed to convert property type query path with hidden token when it should \
                 have errored"
            )
            .to_string(),
            format!(
                "unknown variant `schema`, expected {}",
                PropertyTypeQueryPathVisitor::EXPECTING
            )
        );

        assert_eq!(
            PropertyTypeQueryPath::deserialize(
                de::value::SeqDeserializer::<_, de::value::Error>::new(
                    ["baseUrl", "test"].into_iter()
                )
            )
            .expect_err(
                "managed to convert property type query path with multiple tokens when it should \
                 have errored"
            )
            .to_string(),
            "invalid length 2, expected 1 element in sequence"
        );

        assert_eq!(
            PropertyTypeQueryPath::deserialize(
                de::value::SeqDeserializer::<_, de::value::Error>::new(
                    ["dataTypes", "*"].into_iter()
                )
            )
            .expect_err(
                "managed to convert property type query path with multiple tokens when it should \
                 have errored"
            )
            .to_string(),
            format!(
                "invalid length 2, expected {}",
                DataTypeQueryPathVisitor::EXPECTING
            )
        );

        assert_eq!(
            PropertyTypeQueryPath::deserialize(
                de::value::SeqDeserializer::<_, de::value::Error>::new(
                    ["dataTypes", "*", "versionedUrl", "invalid"].into_iter()
                )
            )
            .expect_err(
                "managed to convert property type query path with multiple tokens when it should \
                 have errored"
            )
            .to_string(),
            "invalid length 4, expected 3 elements in sequence"
        );
    }
}
