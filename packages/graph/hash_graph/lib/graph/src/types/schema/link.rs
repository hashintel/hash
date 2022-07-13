use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::types::{
    schema::{
        array::{Array, MaybeOrdered},
        combinator::Optional,
        ValidationError,
    },
    VersionedUri,
};

/// Intermediate representation used during deserialization.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LinksRepr {
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    links: HashMap<VersionedUri, Optional<MaybeOrdered<Array>>>,
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
        links: HashMap<VersionedUri, Optional<MaybeOrdered<Array>>>,
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
        links: HashMap<VersionedUri, Optional<MaybeOrdered<Array>>>,
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
    pub const fn links(&self) -> &HashMap<VersionedUri, Optional<MaybeOrdered<Array>>> {
        &self.repr.links
    }

    #[must_use]
    pub fn required(&self) -> &[VersionedUri] {
        &self.repr.required_links
    }
}
