use std::fmt;

use error_stack::{IntoReport, Report};
use serde::{
    de::{self, Deserializer, SeqAccess, Visitor},
    Deserialize,
};
use type_system::EntityType;

use crate::{
    ontology::{
        link_type::LinkTypeQueryPathVisitor, property_type::PropertyTypeQueryPathVisitor,
        LinkTypeQueryPath, PropertyTypeQueryPath, Selector,
    },
    store::query::{OntologyPath, Path, QueryRecord},
};

#[derive(Debug, PartialEq, Eq)]
pub enum EntityTypeQueryPath {
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
    Properties(PropertyTypeQueryPath),
    Required,
    Links(LinkTypeQueryPath),
    RequiredLinks,
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

impl TryFrom<Path> for EntityTypeQueryPath {
    type Error = Report<de::value::Error>;

    fn try_from(path: Path) -> Result<Self, Self::Error> {
        Self::deserialize(de::value::SeqDeserializer::new(
            path.segments.into_iter().map(|segment| segment.identifier),
        ))
        .into_report()
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
}

/// Deserializes an [`EntityTypeQueryPath`] from a string sequence.
pub struct EntityTypeQueryPathVisitor {
    /// The current position in the sequence when deserializing.
    position: usize,
}

impl EntityTypeQueryPathVisitor {
    pub const EXPECTING: &'static str = "one of `ownedById`, `createdById`, `updatedById`, \
                                         `removedById`, `baseUri`, `versionedUri`, `version`, \
                                         `title, `description`, `default`, `examples`, \
                                         `properties`, `required`, `links`, or `requiredLinks`";

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

                let link_type_query_path =
                    LinkTypeQueryPathVisitor::new(self.position).visit_seq(seq)?;

                EntityTypeQueryPath::Links(link_type_query_path)
            }
            EntityTypeQueryToken::RequiredLinks => EntityTypeQueryPath::RequiredLinks,
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
    use super::*;
    use crate::ontology::test_utils::create_path;

    fn convert_path(segments: impl IntoIterator<Item = &'static str>) -> EntityTypeQueryPath {
        EntityTypeQueryPath::try_from(create_path(segments)).expect("could not convert path")
    }

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
                de::value::SeqDeserializer::<_, de::value::Error>::new(
                    ["baseUri", "test"].into_iter()
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

    #[test]
    fn path_conversion() {
        assert_eq!(convert_path(["baseUri"]), EntityTypeQueryPath::BaseUri);
        assert_eq!(convert_path(["version"]), EntityTypeQueryPath::Version);
        assert_eq!(
            convert_path(["versionedUri"]),
            EntityTypeQueryPath::VersionedUri
        );
        assert_eq!(convert_path(["ownedById"]), EntityTypeQueryPath::OwnedById);
        assert_eq!(convert_path(["title"]), EntityTypeQueryPath::Title);
        assert_eq!(
            convert_path(["description"]),
            EntityTypeQueryPath::Description
        );
        assert_eq!(convert_path(["default"]), EntityTypeQueryPath::Default);
        assert_eq!(convert_path(["examples"]), EntityTypeQueryPath::Examples);
        assert_eq!(
            convert_path(["properties", "*", "version"]),
            EntityTypeQueryPath::Properties(PropertyTypeQueryPath::Version)
        );
        assert_eq!(convert_path(["required"]), EntityTypeQueryPath::Required);
        assert_eq!(
            convert_path(["links", "*", "version"]),
            EntityTypeQueryPath::Links(LinkTypeQueryPath::Version)
        );
        assert_eq!(
            convert_path(["requiredLinks"]),
            EntityTypeQueryPath::RequiredLinks
        );
    }
}
