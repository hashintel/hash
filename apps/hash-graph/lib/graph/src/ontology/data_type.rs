use std::fmt;

use serde::{
    de::{self, Deserializer, SeqAccess, Visitor},
    Deserialize,
};
use utoipa::ToSchema;

use crate::store::query::{JsonPath, OntologyQueryPath, ParameterType, PathToken, QueryPath};

/// A path to a [`DataType`] field.
///
/// Note: [`DataType`]s currently don't reference other [`DataType`]s, so the path can only be a
/// single field. This means, that the path currently will always be a sequence with only one
/// element.
///
/// [`DataType`]: type_system::DataType
// TODO: Adjust enum and docs when adding non-primitive data types
//   see https://app.asana.com/0/1200211978612931/1202464168422955/f
#[derive(Debug, PartialEq, Eq)]
pub enum DataTypeQueryPath<'p> {
    /// The [`BaseUrl`] of the [`DataType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::DataTypeQueryPath;
    /// let path = DataTypeQueryPath::deserialize(json!(["baseUrl"]))?;
    /// assert_eq!(path, DataTypeQueryPath::BaseUrl);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`DataType`]: type_system::DataType
    /// [`BaseUrl`]: type_system::url::BaseUrl
    BaseUrl,
    /// The version of the [`DataType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::DataTypeQueryPath;
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
    /// # use graph::{store::query::{Filter, FilterExpression, Parameter}};
    /// # use graph::{ontology::{DataTypeQueryPath, DataTypeWithMetadata}};
    /// let filter_value = json!({ "equal": [{ "path": ["version"] }, { "parameter": "latest" }] });
    /// let path = Filter::<DataTypeWithMetadata>::deserialize(filter_value)?;
    /// assert_eq!(path, Filter::Equal(
    ///     Some(FilterExpression::Path(DataTypeQueryPath::Version)),
    ///     Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed("latest")))))
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`DataType`]: type_system::DataType
    Version,
    /// The [`VersionedUrl`] of the [`DataType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::DataTypeQueryPath;
    /// let path = DataTypeQueryPath::deserialize(json!(["versionedUrl"]))?;
    /// assert_eq!(path, DataTypeQueryPath::VersionedUrl);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`VersionedUrl`]: type_system::url::VersionedUrl
    /// [`DataType`]: type_system::DataType
    VersionedUrl,
    /// The [`OwnedById`] of the [`OntologyElementMetadata`] belonging to the [`DataType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::DataTypeQueryPath;
    /// let path = DataTypeQueryPath::deserialize(json!(["ownedById"]))?;
    /// assert_eq!(path, DataTypeQueryPath::OwnedById);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`DataType`]: type_system::DataType
    /// [`OwnedById`]: crate::provenance::OwnedById
    /// [`OntologyElementMetadata`]: crate::ontology::OntologyElementMetadata
    OwnedById,
    /// The [`RecordCreatedById`] of the [`ProvenanceMetadata`] belonging to the [`DataType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::DataTypeQueryPath;
    /// let path = DataTypeQueryPath::deserialize(json!(["recordCreatedById"]))?;
    /// assert_eq!(path, DataTypeQueryPath::RecordCreatedById);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`DataType`]: type_system::DataType
    /// [`RecordCreatedById`]: crate::provenance::RecordCreatedById
    /// [`ProvenanceMetadata`]: crate::provenance::ProvenanceMetadata
    RecordCreatedById,
    /// Corresponds to [`DataType::title()`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::DataTypeQueryPath;
    /// let path = DataTypeQueryPath::deserialize(json!(["title"]))?;
    /// assert_eq!(path, DataTypeQueryPath::Title);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`DataType::title()`]: type_system::DataType::title
    Title,
    /// Corresponds to [`DataType::description()`]
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::DataTypeQueryPath;
    /// let path = DataTypeQueryPath::deserialize(json!(["description"]))?;
    /// assert_eq!(path, DataTypeQueryPath::Description);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`DataType::description()`]: type_system::DataType::description
    Description,
    /// Corresponds to [`DataType::json_type()`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::DataTypeQueryPath;
    /// let path = DataTypeQueryPath::deserialize(json!(["type"]))?;
    /// assert_eq!(path, DataTypeQueryPath::Type);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`DataType::json_type()`]: type_system::DataType::json_type
    Type,
    /// Only used internally and not available for deserialization.
    OntologyId,
    /// Only used internally and not available for deserialization.
    Schema(Option<JsonPath<'p>>),
    /// Only used internally and not available for deserialization.
    AdditionalMetadata(Option<JsonPath<'p>>),
}

impl OntologyQueryPath for DataTypeQueryPath<'_> {
    fn base_url() -> Self {
        Self::BaseUrl
    }

    fn versioned_url() -> Self {
        Self::VersionedUrl
    }

    fn version() -> Self {
        Self::Version
    }

    fn record_created_by_id() -> Self {
        Self::RecordCreatedById
    }

    fn schema() -> Self {
        Self::Schema(None)
    }

    fn additional_metadata() -> Self {
        Self::AdditionalMetadata(None)
    }
}

impl QueryPath for DataTypeQueryPath<'_> {
    fn expected_type(&self) -> ParameterType {
        match self {
            Self::OntologyId | Self::OwnedById | Self::RecordCreatedById => ParameterType::Uuid,
            Self::Schema(_) | Self::AdditionalMetadata(_) => ParameterType::Any,
            Self::BaseUrl => ParameterType::BaseUrl,
            Self::VersionedUrl => ParameterType::VersionedUrl,
            Self::Version => ParameterType::OntologyTypeVersion,
            Self::Description | Self::Title | Self::Type => ParameterType::Text,
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
            Self::OwnedById => fmt.write_str("ownedById"),
            Self::RecordCreatedById => fmt.write_str("recordCreatedById"),
            Self::Schema(Some(path)) => write!(fmt, "schema.{path}"),
            Self::Schema(None) => fmt.write_str("schema"),
            Self::Title => fmt.write_str("title"),
            Self::Description => fmt.write_str("description"),
            Self::Type => fmt.write_str("type"),
            Self::AdditionalMetadata(Some(path)) => write!(fmt, "additionalMetadata.{path}"),
            Self::AdditionalMetadata(None) => fmt.write_str("additionalMetadata"),
        }
    }
}

/// A single token in a [`DataTypeQueryPath`].
#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub enum DataTypeQueryToken {
    BaseUrl,
    Version,
    VersionedUrl,
    OwnedById,
    RecordCreatedById,
    Title,
    Description,
    Type,
    #[serde(skip)]
    Schema,
}

/// Deserializes a [`DataTypeQueryPath`] from a string sequence.
pub struct DataTypeQueryPathVisitor {
    /// The current position in the sequence when deserializing.
    position: usize,
}

impl DataTypeQueryPathVisitor {
    pub const EXPECTING: &'static str = "one of `baseUrl`, `version`, `versionedUrl`, \
                                         `ownedById`, `recordCreatedById`, `title`, \
                                         `description`, `type`";

    #[must_use]
    pub const fn new(position: usize) -> Self {
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
        let token = seq
            .next_element()?
            .ok_or_else(|| de::Error::invalid_length(self.position, &self))?;
        self.position += 1;

        Ok(match token {
            DataTypeQueryToken::OwnedById => DataTypeQueryPath::OwnedById,
            DataTypeQueryToken::RecordCreatedById => DataTypeQueryPath::RecordCreatedById,
            DataTypeQueryToken::BaseUrl => DataTypeQueryPath::BaseUrl,
            DataTypeQueryToken::VersionedUrl => DataTypeQueryPath::VersionedUrl,
            DataTypeQueryToken::Version => DataTypeQueryPath::Version,
            DataTypeQueryToken::Title => DataTypeQueryPath::Title,
            DataTypeQueryToken::Description => DataTypeQueryPath::Description,
            DataTypeQueryToken::Type => DataTypeQueryPath::Type,
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

#[cfg(test)]
mod tests {
    use std::iter::once;

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
