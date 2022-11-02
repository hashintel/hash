use std::fmt;

use serde::{
    de::{self, Deserializer, SeqAccess, Visitor},
    Deserialize,
};
use type_system::EntityType;

use crate::{
    ontology::{property_type::PropertyTypeQueryPathVisitor, PropertyTypeQueryPath, Selector},
    store::query::{OntologyPath, ParameterType, QueryRecord, RecordPath},
};

#[derive(Debug, PartialEq, Eq)]
pub enum EntityTypeQueryPath {
    VersionId,
    OwnedById,
    CreatedById,
    UpdatedById,
    RemovedById,
    Schema,
    BaseUri,
    VersionedUri,
    Version,
    Title,
    Description,
    Default,
    Examples,
    Properties(PropertyTypeQueryPath),
    Required,
    // TODO: https://app.asana.com/0/1200211978612931/1203250001255262/f
    // Links(LinkTypeQueryPath),
    RequiredLinks,
    InheritsFrom(Box<Self>),
}

impl QueryRecord for EntityType {
    type Path<'q> = EntityTypeQueryPath;
}

impl OntologyPath for EntityTypeQueryPath {
    fn base_uri() -> Self {
        Self::BaseUri
    }

    fn versioned_uri() -> Self {
        Self::VersionedUri
    }

    fn version() -> Self {
        Self::Version
    }

    fn title() -> Self {
        Self::Title
    }

    fn description() -> Self {
        Self::Description
    }
}

impl RecordPath for EntityTypeQueryPath {
    fn expected_type(&self) -> ParameterType {
        match self {
            Self::VersionId | Self::OwnedById | Self::CreatedById | Self::UpdatedById => {
                ParameterType::Uuid
            }
            Self::RemovedById => ParameterType::Uuid,
            Self::Schema => ParameterType::Any,
            Self::BaseUri => ParameterType::BaseUri,
            Self::VersionedUri => ParameterType::VersionedUri,
            Self::Version => ParameterType::UnsignedInteger,
            Self::Title | Self::Description => ParameterType::Text,
            Self::Default | Self::Examples | Self::Required | Self::RequiredLinks => {
                ParameterType::Any
            }
            Self::Properties(path) => path.expected_type(),
            // TODO: https://app.asana.com/0/1200211978612931/1203250001255262/f
            // Self::Links(path) => path.expected_type(),
            Self::InheritsFrom(path) => path.expected_type(),
        }
    }
}

impl fmt::Display for EntityTypeQueryPath {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::VersionId => fmt.write_str("versionId"),
            Self::OwnedById => fmt.write_str("ownedById"),
            Self::CreatedById => fmt.write_str("createdById"),
            Self::UpdatedById => fmt.write_str("updatedById"),
            Self::RemovedById => fmt.write_str("removedById"),
            Self::Schema => fmt.write_str("schema"),
            Self::BaseUri => fmt.write_str("baseUri"),
            Self::VersionedUri => fmt.write_str("versionedUri"),
            Self::Version => fmt.write_str("version"),
            Self::Title => fmt.write_str("title"),
            Self::Description => fmt.write_str("description"),
            Self::Default => fmt.write_str("default"),
            Self::Examples => fmt.write_str("examples"),
            Self::Properties(path) => write!(fmt, "properties.{path}"),
            Self::Required => fmt.write_str("required"),
            // TODO: https://app.asana.com/0/1200211978612931/1203250001255262/f
            // Self::Links(path) => write!(fmt, "links.{path}"),
            Self::RequiredLinks => fmt.write_str("requiredLinks"),
            Self::InheritsFrom(path) => write!(fmt, "inheritsFrom.{path}"),
        }
    }
}

/// A single token in a [`EntityTypeQueryPath`].
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EntityTypeQueryToken {
    OwnedById,
    CreatedById,
    UpdatedById,
    RemovedById,
    BaseUri,
    VersionedUri,
    Version,
    Title,
    Description,
    Default,
    Examples,
    Properties,
    Required,
    Links,
    RequiredLinks,
    InheritsFrom,
}

/// Deserializes an [`EntityTypeQueryPath`] from a string sequence.
pub struct EntityTypeQueryPathVisitor {
    /// The current position in the sequence when deserializing.
    position: usize,
}

impl EntityTypeQueryPathVisitor {
    pub const EXPECTING: &'static str =
        "one of `ownedById`, `createdById`, `updatedById`, `removedById`, `baseUri`, \
         `versionedUri`, `version`, `title`, `description`, `default`, `examples`, `properties`, \
         `required`, `links`, `requiredLinks`, `inheritsFrom`";

    #[must_use]
    pub const fn new(position: usize) -> Self {
        Self { position }
    }
}

impl<'de> Visitor<'de> for EntityTypeQueryPathVisitor {
    type Value = EntityTypeQueryPath;

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
            EntityTypeQueryToken::CreatedById => EntityTypeQueryPath::CreatedById,
            EntityTypeQueryToken::UpdatedById => EntityTypeQueryPath::UpdatedById,
            EntityTypeQueryToken::RemovedById => EntityTypeQueryPath::RemovedById,
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

                let property_type_query_path =
                    PropertyTypeQueryPathVisitor::new(self.position).visit_seq(seq)?;

                EntityTypeQueryPath::Properties(property_type_query_path)
            }
            EntityTypeQueryToken::Required => EntityTypeQueryPath::Required,
            EntityTypeQueryToken::Links => {
                seq.next_element::<Selector>()?
                    .ok_or_else(|| de::Error::invalid_length(self.position, &self))?;
                self.position += 1;

                todo!("https://app.asana.com/0/1200211978612931/1203250001255262/f");

                // let link_type_query_path =
                //     LinkTypeQueryPathVisitor::new(self.position).visit_seq(seq)?;
                //
                // EntityTypeQueryPath::Links(link_type_query_path)
            }
            EntityTypeQueryToken::RequiredLinks => EntityTypeQueryPath::RequiredLinks,
            EntityTypeQueryToken::InheritsFrom => {
                seq.next_element::<Selector>()?
                    .ok_or_else(|| de::Error::invalid_length(self.position, &self))?;
                self.position += 1;

                let entity_type_query_path =
                    EntityTypeQueryPathVisitor::new(self.position).visit_seq(seq)?;

                EntityTypeQueryPath::InheritsFrom(Box::new(entity_type_query_path))
            }
        })
    }
}

impl<'de> Deserialize<'de> for EntityTypeQueryPath {
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

    fn deserialize<'q>(segments: impl IntoIterator<Item = &'q str>) -> EntityTypeQueryPath {
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
            EntityTypeQueryPath::Links(LinkTypeQueryPath::Version)
        );
        assert_eq!(
            deserialize(["requiredLinks"]),
            EntityTypeQueryPath::RequiredLinks
        );

        assert_eq!(
            EntityTypeQueryPath::deserialize(
                de::value::SeqDeserializer::<_, de::value::Error>::new(once("version_id"))
            )
            .expect_err(
                "managed to convert entity type query path with hidden token when it should have \
                 errored"
            )
            .to_string(),
            format!(
                "unknown variant `version_id`, expected {}",
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
