use std::fmt;

use serde::{
    de::{self, Deserializer, SeqAccess, Visitor},
    Deserialize,
};
use utoipa::ToSchema;

use crate::{
    ontology::{data_type::DataTypeQueryPathVisitor, DataTypeQueryPath, Selector},
    store::query::{JsonPath, OntologyQueryPath, ParameterType, PathToken, QueryPath},
};

/// A path to a [`PropertyType`] field.
///
/// [`PropertyType`]: type_system::PropertyType
#[derive(Debug, PartialEq, Eq)]
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
    /// The [`OwnedById`] of the [`OntologyElementMetadata`] belonging to the [`PropertyType`].
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
    /// [`OwnedById`]: crate::provenance::OwnedById
    /// [`OntologyElementMetadata`]: crate::ontology::OntologyElementMetadata
    OwnedById,
    /// The [`UpdatedById`] of the [`ProvenanceMetadata`] belonging to the [`PropertyType`].
    ///
    /// [`PropertyType`]: type_system::PropertyType
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::PropertyTypeQueryPath;
    /// let path = PropertyTypeQueryPath::deserialize(json!(["updatedById"]))?;
    /// assert_eq!(path, PropertyTypeQueryPath::UpdatedById);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`UpdatedById`]: crate::provenance::UpdatedById
    /// [`ProvenanceMetadata`]: crate::provenance::ProvenanceMetadata
    UpdatedById,
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
    /// Corresponds to [`PropertyType::data_type_references()`].
    ///
    /// As a [`PropertyType`] can have multiple [`DataType`]s, the deserialized path requires an
    /// additional selector to identify the [`DataType`] to query. Currently, only the `*` selector
    /// is available, so the path will be deserialized as `["dataTypes", "*", ...]` where `...` is
    /// the path to the desired field of the [`DataType`].
    ///
    /// [`PropertyType::data_type_references()`]: type_system::PropertyType::data_type_references
    /// [`PropertyType`]: type_system::PropertyType
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::{DataTypeQueryPath, PropertyTypeQueryPath};
    /// let path = PropertyTypeQueryPath::deserialize(json!(["dataTypes", "*", "title"]))?;
    /// assert_eq!(
    ///     path,
    ///     PropertyTypeQueryPath::DataTypes(DataTypeQueryPath::Title)
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`DataType`]: type_system::DataType
    DataTypes(DataTypeQueryPath<'p>),
    /// Corresponds to [`PropertyType::property_type_references()`].
    ///
    /// As a [`PropertyType`] can have multiple nested [`PropertyType`]s, the deserialized path
    /// requires an additional selector to identify the [`PropertyType`] to query. Currently, only
    /// the `*` selector is available, so the path will be deserialized as `["propertyTypes", "*",
    /// ...]` where `...` is the path to the desired field of the [`PropertyType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// use serde_json::json;
    /// # use graph::ontology::PropertyTypeQueryPath;
    /// let path = PropertyTypeQueryPath::deserialize(json!(["propertyTypes", "*", "title"]))?;
    /// assert_eq!(
    ///     path,
    ///     PropertyTypeQueryPath::PropertyTypes(Box::new(PropertyTypeQueryPath::Title))
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`PropertyType`]: type_system::PropertyType
    /// [`PropertyType::property_type_references()`]: type_system::PropertyType::property_type_references
    PropertyTypes(Box<Self>),
    /// Only used internally and not available for deserialization.
    OntologyId,
    /// Only used internally and not available for deserialization.
    Schema(Option<JsonPath<'p>>),
    /// Only used internally and not available for deserialization.
    AdditionalMetadata(Option<JsonPath<'p>>),
}

impl OntologyQueryPath for PropertyTypeQueryPath<'_> {
    fn base_url() -> Self {
        Self::BaseUrl
    }

    fn versioned_url() -> Self {
        Self::VersionedUrl
    }

    fn version() -> Self {
        Self::Version
    }

    fn updated_by_id() -> Self {
        Self::UpdatedById
    }

    fn schema() -> Self {
        Self::Schema(None)
    }

    fn additional_metadata() -> Self {
        Self::AdditionalMetadata(None)
    }
}

impl QueryPath for PropertyTypeQueryPath<'_> {
    fn expected_type(&self) -> ParameterType {
        match self {
            Self::OntologyId | Self::OwnedById | Self::UpdatedById => ParameterType::Uuid,
            Self::Schema(_) | Self::AdditionalMetadata(_) => ParameterType::Any,
            Self::BaseUrl => ParameterType::BaseUrl,
            Self::VersionedUrl => ParameterType::VersionedUrl,
            Self::Version => ParameterType::OntologyTypeVersion,
            Self::Title | Self::Description => ParameterType::Text,
            Self::DataTypes(path) => path.expected_type(),
            Self::PropertyTypes(path) => path.expected_type(),
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
            Self::OwnedById => fmt.write_str("ownedById"),
            Self::UpdatedById => fmt.write_str("updatedById"),
            Self::Schema(Some(path)) => write!(fmt, "schema.{path}"),
            Self::Schema(None) => fmt.write_str("schema"),
            Self::Title => fmt.write_str("title"),
            Self::Description => fmt.write_str("description"),
            Self::DataTypes(path) => write!(fmt, "dataTypes.{path}"),
            Self::PropertyTypes(path) => write!(fmt, "propertyTypes.{path}"),
            Self::AdditionalMetadata(Some(path)) => write!(fmt, "additionalMetadata.{path}"),
            Self::AdditionalMetadata(None) => fmt.write_str("additionalMetadata"),
        }
    }
}

/// A single token in a [`DataTypeQueryPath`].
#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub enum PropertyTypeQueryToken {
    BaseUrl,
    Version,
    VersionedUrl,
    OwnedById,
    UpdatedById,
    Title,
    Description,
    DataTypes,
    PropertyTypes,
    #[serde(skip)]
    Schema,
}

/// Deserializes a [`PropertyTypeQueryPath`] from a string sequence.
pub struct PropertyTypeQueryPathVisitor {
    /// The current position in the sequence when deserializing.
    position: usize,
}

impl PropertyTypeQueryPathVisitor {
    pub const EXPECTING: &'static str = "one of `baseUrl`, `version`, `versionedUrl`, \
                                         `ownedById`, `updatedById`, `title`, `description`, \
                                         `dataTypes`, `propertyTypes`";

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
            PropertyTypeQueryToken::UpdatedById => PropertyTypeQueryPath::UpdatedById,
            PropertyTypeQueryToken::BaseUrl => PropertyTypeQueryPath::BaseUrl,
            PropertyTypeQueryToken::VersionedUrl => PropertyTypeQueryPath::VersionedUrl,
            PropertyTypeQueryToken::Version => PropertyTypeQueryPath::Version,
            PropertyTypeQueryToken::Title => PropertyTypeQueryPath::Title,
            PropertyTypeQueryToken::Description => PropertyTypeQueryPath::Description,
            PropertyTypeQueryToken::DataTypes => {
                seq.next_element::<Selector>()?
                    .ok_or_else(|| de::Error::invalid_length(self.position, &self))?;
                self.position += 1;

                let data_type_query_path =
                    DataTypeQueryPathVisitor::new(self.position).visit_seq(seq)?;

                PropertyTypeQueryPath::DataTypes(data_type_query_path)
            }
            PropertyTypeQueryToken::PropertyTypes => {
                seq.next_element::<Selector>()?
                    .ok_or_else(|| de::Error::invalid_length(self.position, &self))?;
                self.position += 1;

                let property_type_query_path = Self::new(self.position).visit_seq(seq)?;

                PropertyTypeQueryPath::PropertyTypes(Box::new(property_type_query_path))
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
            PropertyTypeQueryPath::DataTypes(DataTypeQueryPath::Version)
        );
        assert_eq!(
            deserialize(["propertyTypes", "*", "baseUrl"]),
            PropertyTypeQueryPath::PropertyTypes(Box::new(PropertyTypeQueryPath::BaseUrl))
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
