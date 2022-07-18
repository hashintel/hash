use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::types::{
    schema::{
        array::MaybeOrderedItemizedArray, entity_type::EntityTypeReference, object::ValidateUri,
        ValidationError,
    },
    BaseUri, VersionedUri,
};

// TODO: Temporary solution, we can't use the `ValueOrArray` combinator
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged, deny_unknown_fields)]
pub enum ValueOrMaybeOrderedArray<T> {
    Value(T),
    Array(MaybeOrderedItemizedArray<T>),
}

impl<T: ValidateUri> ValidateUri for ValueOrMaybeOrderedArray<T> {
    fn validate_uri(&self, base_uri: &BaseUri) -> error_stack::Result<(), ValidationError> {
        match self {
            Self::Value(value) => value.validate_uri(base_uri),
            Self::Array(array) => array.array().items().validate_uri(base_uri),
        }
    }
}

/// Intermediate representation used during deserialization.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LinksRepr {
    // TODO - Update the value definition once we fix Forking Hell and decide on something beyond
    //  EntityTypeReferences
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    links: HashMap<VersionedUri, ValueOrMaybeOrderedArray<EntityTypeReference>>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    required_links: Vec<VersionedUri>,
}

/// Schema definition for links to entities.
///
/// Optionally contains a list of required links.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "LinksRepr")]
pub struct Links {
    #[serde(flatten)]
    repr: LinksRepr,
}

impl TryFrom<LinksRepr> for Links {
    type Error = ValidationError;

    fn try_from(links: LinksRepr) -> Result<Self, ValidationError> {
        let links = Self { repr: links };
        links.validate()?;
        Ok(links)
    }
}

impl Links {
    /// Creates a new `Links` without validating.
    #[must_use]
    pub const fn new_unchecked(
        links: HashMap<VersionedUri, ValueOrMaybeOrderedArray<EntityTypeReference>>,
        required: Vec<VersionedUri>,
    ) -> Self {
        Self {
            repr: LinksRepr {
                links,
                required_links: required,
            },
        }
    }

    /// Creates a new `Links`.
    ///
    /// # Errors
    ///
    /// - [`ValidationError::MissingRequiredLink`] if a required link is not a key in `links`.
    pub fn new(
        links: HashMap<VersionedUri, ValueOrMaybeOrderedArray<EntityTypeReference>>,
        required: Vec<VersionedUri>,
    ) -> Result<Self, ValidationError> {
        let entity_type = Self::new_unchecked(links, required);
        entity_type.validate()?;
        Ok(entity_type)
    }

    fn validate(&self) -> Result<(), ValidationError> {
        for link in self.required() {
            if !self.links().contains_key(link) {
                return Err(ValidationError::MissingRequiredLink(link.clone()));
            }
        }
        Ok(())
    }

    #[must_use]
    pub const fn links(
        &self,
    ) -> &HashMap<VersionedUri, ValueOrMaybeOrderedArray<EntityTypeReference>> {
        &self.repr.links
    }

    #[must_use]
    pub fn required(&self) -> &[VersionedUri] {
        &self.repr.required_links
    }
}
