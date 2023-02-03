use std::fmt;

use serde::{
    de::{self, Deserializer, SeqAccess, Visitor},
    Deserialize,
};
use utoipa::ToSchema;

use crate::{
    ontology::{property_type::PropertyTypeQueryPathVisitor, PropertyTypeQueryPath, Selector},
    store::query::{JsonPath, OntologyQueryPath, ParameterType, PathToken, QueryPath},
};

/// A path to a [`EntityType`] field.
///
/// [`EntityType`]: type_system::EntityType
#[derive(Debug, PartialEq, Eq)]
pub enum EntityTypeQueryPath<'p> {
    /// The [`BaseUri`] of the [`EntityType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::EntityTypeQueryPath;
    /// let path = EntityTypeQueryPath::deserialize(json!(["baseUri"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::BaseUri);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityType`]: type_system::EntityType
    /// [`BaseUri`]: type_system::uri::BaseUri
    BaseUri,
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
    /// # use graph::{ontology::{EntityTypeQueryPath, EntityTypeWithMetadata}};
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
    /// The [`VersionedUri`] of the [`EntityType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::EntityTypeQueryPath;
    /// let path = EntityTypeQueryPath::deserialize(json!(["versionedUri"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::VersionedUri);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityType`]: type_system::EntityType
    /// [`VersionedUri`]: type_system::uri::VersionedUri
    VersionedUri,
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
    /// [`OwnedById`]: crate::provenance::OwnedById
    /// [`OntologyElementMetadata`]: crate::ontology::OntologyElementMetadata
    OwnedById,
    /// The [`UpdatedById`] of the [`ProvenanceMetadata`] belonging to the [`EntityType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::EntityTypeQueryPath;
    /// let path = EntityTypeQueryPath::deserialize(json!(["updatedById"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::UpdatedById);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityType`]: type_system::EntityType
    /// [`UpdatedById`]: crate::provenance::UpdatedById
    /// [`ProvenanceMetadata`]: crate::provenance::ProvenanceMetadata
    UpdatedById,
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
    /// Corresponds to [`EntityType::default()`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::EntityTypeQueryPath;
    /// let path = EntityTypeQueryPath::deserialize(json!(["default"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::Default);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityType::default()`]: type_system::EntityType::default
    Default,
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
    /// Corresponds to [`EntityType::property_type_references()`].
    ///
    /// As an [`EntityType`] can have multiple [`PropertyType`]s, the deserialized path requires an
    /// additional selector to identify the [`PropertyType`] to query. Currently, only the `*`
    /// selector is available, so the path will be deserialized as `["properties", "*", ...]`
    /// where `...` is the path to the desired field of the [`PropertyType`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::{EntityTypeQueryPath, PropertyTypeQueryPath};
    /// let path = EntityTypeQueryPath::deserialize(json!(["properties", "*", "baseUri"]))?;
    /// assert_eq!(
    ///     path,
    ///     EntityTypeQueryPath::Properties(PropertyTypeQueryPath::BaseUri)
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityType`]: type_system::EntityType
    /// [`EntityType::property_type_references()`]: type_system::EntityType::property_type_references
    /// [`PropertyType`]: type_system::PropertyType
    Properties(PropertyTypeQueryPath<'p>),
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
    /// let path = EntityTypeQueryPath::deserialize(json!(["links", "*", "baseUri"]))?;
    /// assert_eq!(
    ///     path,
    ///     EntityTypeQueryPath::Links(Box::new(EntityTypeQueryPath::BaseUri))
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityType`]: type_system::EntityType
    /// [`EntityType::link_mappings()`]: type_system::EntityType::link_mappings
    Links(Box<Self>),
    /// Corresponds to [`EntityType::required_links()`].
    ///
    /// ```rust
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// # use graph::ontology::EntityTypeQueryPath;
    /// let path = EntityTypeQueryPath::deserialize(json!(["requiredLinks"]))?;
    /// assert_eq!(path, EntityTypeQueryPath::RequiredLinks);
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityType::required_links()`]: type_system::EntityType::required_links
    RequiredLinks,
    /// Currently, does not correspond to any field of [`EntityType`].
    ///
    /// In the future, this will most likely correspond to something like
    /// [`EntityType::inherits_from()`].
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
    /// let path = EntityTypeQueryPath::deserialize(json!(["inheritsFrom", "*", "baseUri"]))?;
    /// assert_eq!(
    ///     path,
    ///     EntityTypeQueryPath::InheritsFrom(Box::new(EntityTypeQueryPath::BaseUri))
    /// );
    /// # Ok::<(), serde_json::Error>(())
    /// ```
    ///
    /// [`EntityType`]: type_system::EntityType
    /// [`EntityType::inherits_from()`]: type_system::EntityType::inherits_from
    InheritsFrom(Box<Self>),
    /// Only used internally and not available for deserialization.
    OntologyId,
    /// Only used internally and not available for deserialization.
    Schema(Option<JsonPath<'p>>),
}

impl OntologyQueryPath for EntityTypeQueryPath<'_> {
    fn base_uri() -> Self {
        Self::BaseUri
    }

    fn versioned_uri() -> Self {
        Self::VersionedUri
    }

    fn version() -> Self {
        Self::Version
    }

    fn owned_by_id() -> Self {
        Self::OwnedById
    }

    fn updated_by_id() -> Self {
        Self::UpdatedById
    }

    fn schema() -> Self {
        Self::Schema(None)
    }
}

impl QueryPath for EntityTypeQueryPath<'_> {
    fn expected_type(&self) -> ParameterType {
        match self {
            Self::OntologyId | Self::OwnedById | Self::UpdatedById => ParameterType::Uuid,
            Self::Schema(_) => ParameterType::Any,
            Self::BaseUri => ParameterType::BaseUri,
            Self::VersionedUri => ParameterType::VersionedUri,
            Self::Version => ParameterType::UnsignedInteger,
            Self::Title | Self::Description => ParameterType::Text,
            Self::Default | Self::Examples | Self::Required | Self::RequiredLinks => {
                ParameterType::Any
            }
            Self::Properties(path) => path.expected_type(),
            Self::Links(path) | Self::InheritsFrom(path) => path.expected_type(),
        }
    }
}

impl fmt::Display for EntityTypeQueryPath<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::OntologyId => fmt.write_str("ontologyId"),
            Self::BaseUri => fmt.write_str("baseUri"),
            Self::Version => fmt.write_str("version"),
            Self::VersionedUri => fmt.write_str("versionedUri"),
            Self::OwnedById => fmt.write_str("ownedById"),
            Self::UpdatedById => fmt.write_str("updatedById"),
            Self::Schema(Some(path)) => write!(fmt, "schema.{path}"),
            Self::Schema(None) => fmt.write_str("schema"),
            Self::Title => fmt.write_str("title"),
            Self::Description => fmt.write_str("description"),
            Self::Default => fmt.write_str("default"),
            Self::Examples => fmt.write_str("examples"),
            Self::Properties(path) => write!(fmt, "properties.{path}"),
            Self::Required => fmt.write_str("required"),
            Self::Links(path) => write!(fmt, "links.{path}"),
            Self::RequiredLinks => fmt.write_str("requiredLinks"),
            Self::InheritsFrom(path) => write!(fmt, "inheritsFrom.{path}"),
        }
    }
}

/// A single token in a [`EntityTypeQueryPath`].
#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub enum EntityTypeQueryToken {
    BaseUri,
    Version,
    VersionedUri,
    OwnedById,
    UpdatedById,
    Title,
    Description,
    Default,
    Examples,
    Properties,
    Required,
    Links,
    RequiredLinks,
    InheritsFrom,
    #[serde(skip)]
    Schema,
}

/// Deserializes an [`EntityTypeQueryPath`] from a string sequence.
pub struct EntityTypeQueryPathVisitor {
    /// The current position in the sequence when deserializing.
    position: usize,
}

impl EntityTypeQueryPathVisitor {
    pub const EXPECTING: &'static str = "one of `baseUri`, `version`, `versionedUri`, \
                                         `ownedById`, `updatedById`, `title`, `description`, \
                                         `default`, `examples`, `properties`, `required`, \
                                         `links`, `requiredLinks`, `inheritsFrom`";

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

    fn visit_seq<A>(mut self, mut seq: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let token = seq
            .next_element()?
            .ok_or_else(|| de::Error::invalid_length(self.position, &self))?;
        self.position += 1;

        Ok(match token {
            EntityTypeQueryToken::OwnedById => EntityTypeQueryPath::OwnedById,
            EntityTypeQueryToken::UpdatedById => EntityTypeQueryPath::UpdatedById,
            EntityTypeQueryToken::BaseUri => EntityTypeQueryPath::BaseUri,
            EntityTypeQueryToken::VersionedUri => EntityTypeQueryPath::VersionedUri,
            EntityTypeQueryToken::Version => EntityTypeQueryPath::Version,
            EntityTypeQueryToken::Title => EntityTypeQueryPath::Title,
            EntityTypeQueryToken::Description => EntityTypeQueryPath::Description,
            EntityTypeQueryToken::Default => EntityTypeQueryPath::Default,
            EntityTypeQueryToken::Examples => EntityTypeQueryPath::Examples,
            EntityTypeQueryToken::Properties => {
                seq.next_element::<Selector>()?
                    .ok_or_else(|| de::Error::invalid_length(self.position, &self))?;
                self.position += 1;

                EntityTypeQueryPath::Properties(
                    PropertyTypeQueryPathVisitor::new(self.position).visit_seq(seq)?,
                )
            }
            EntityTypeQueryToken::Required => EntityTypeQueryPath::Required,
            EntityTypeQueryToken::Links => {
                seq.next_element::<Selector>()?
                    .ok_or_else(|| de::Error::invalid_length(self.position, &self))?;
                self.position += 1;

                EntityTypeQueryPath::Links(Box::new(Self::new(self.position).visit_seq(seq)?))
            }
            EntityTypeQueryToken::RequiredLinks => EntityTypeQueryPath::RequiredLinks,
            EntityTypeQueryToken::InheritsFrom => {
                seq.next_element::<Selector>()?
                    .ok_or_else(|| de::Error::invalid_length(self.position, &self))?;
                self.position += 1;

                EntityTypeQueryPath::InheritsFrom(Box::new(
                    Self::new(self.position).visit_seq(seq)?,
                ))
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
        })
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
        EntityTypeQueryPath::deserialize(de::value::SeqDeserializer::<_, de::value::Error>::new(
            segments.into_iter(),
        ))
        .expect("could not deserialize path")
    }

    #[test]
    fn deserialization() {
        assert_eq!(deserialize(["baseUri"]), EntityTypeQueryPath::BaseUri);
        assert_eq!(deserialize(["version"]), EntityTypeQueryPath::Version);
        assert_eq!(
            deserialize(["versionedUri"]),
            EntityTypeQueryPath::VersionedUri
        );
        assert_eq!(deserialize(["ownedById"]), EntityTypeQueryPath::OwnedById);
        assert_eq!(deserialize(["title"]), EntityTypeQueryPath::Title);
        assert_eq!(
            deserialize(["description"]),
            EntityTypeQueryPath::Description
        );
        assert_eq!(deserialize(["default"]), EntityTypeQueryPath::Default);
        assert_eq!(deserialize(["examples"]), EntityTypeQueryPath::Examples);
        assert_eq!(
            deserialize(["properties", "*", "version"]),
            EntityTypeQueryPath::Properties(PropertyTypeQueryPath::Version)
        );
        assert_eq!(deserialize(["required"]), EntityTypeQueryPath::Required);
        assert_eq!(
            deserialize(["links", "*", "version"]),
            EntityTypeQueryPath::Links(Box::new(EntityTypeQueryPath::Version))
        );
        assert_eq!(
            deserialize(["requiredLinks"]),
            EntityTypeQueryPath::RequiredLinks
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
                    ["baseUri", "test"].into_iter()
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
                    ["links", "*", "versionedUri", "invalid"].into_iter()
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
