use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::ontology::types::{
    entity_type::EntityTypeReference,
    error::ValidationError,
    serde_shared::{array::Array, object::ValidateUri},
    uri::{BaseUri, VersionedUri},
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MaybeOrderedArray<T> {
    #[serde(flatten)]
    array: Array<T>,
    // By default, this will not be ordered.
    #[serde(default)]
    ordered: bool,
}

impl<T> MaybeOrderedArray<T> {
    #[must_use]
    pub const fn new(
        ordered: bool,
        items: T,
        min_items: Option<usize>,
        max_items: Option<usize>,
    ) -> Self {
        Self {
            array: Array::new(items, min_items, max_items),
            ordered,
        }
    }

    #[must_use]
    pub const fn array(&self) -> &Array<T> {
        &self.array
    }

    #[must_use]
    pub const fn ordered(&self) -> bool {
        self.ordered
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged, deny_unknown_fields)]
pub enum ValueOrMaybeOrderedArray<T> {
    Value(T),
    Array(MaybeOrderedArray<T>),
}

impl<T> ValueOrMaybeOrderedArray<T> {
    #[must_use]
    pub const fn inner(&self) -> &T {
        match self {
            Self::Value(value) => value,
            Self::Array(array) => array.array().items(),
        }
    }
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

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::ontology::types::serde_shared::tests::{
        check, check_deserialization, check_invalid_json,
    };

    // TODO - write some tests for validation of Link schemas, although most testing happens on
    //  entity types

    mod maybe_ordered_array {
        use super::*;
        use crate::ontology::types::serde_shared::tests::StringTypeStruct;

        #[test]
        fn unordered() -> Result<(), serde_json::Error> {
            check(
                &MaybeOrderedArray::new(false, StringTypeStruct::default(), None, None),
                json!({
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "ordered": false,
                }),
            )?;

            check_deserialization(
                &MaybeOrderedArray::new(false, StringTypeStruct::default(), None, None),
                json!({
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                }),
            )?;

            Ok(())
        }

        #[test]
        fn ordered() -> Result<(), serde_json::Error> {
            check(
                &MaybeOrderedArray::new(true, StringTypeStruct::default(), None, None),
                json!({
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "ordered": true
                }),
            )
        }

        #[test]
        fn constrained() -> Result<(), serde_json::Error> {
            check(
                &MaybeOrderedArray::new(false, StringTypeStruct::default(), Some(10), Some(20)),
                json!({
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "ordered": false,
                    "minItems": 10,
                    "maxItems": 20,
                }),
            )
        }

        #[test]
        fn additional_properties() {
            check_invalid_json::<MaybeOrderedArray<StringTypeStruct>>(json!({
                "type": "array",
                "items": {
                    "type": "string"
                },
                "ordered": false,
                "minItems": 10,
                "maxItems": 20,
                "additional": 30,
            }));
        }
    }

    mod value_or_maybe_ordered_array {
        use serde_json::json;

        use super::*;
        use crate::ontology::types::serde_shared::tests::{check, StringTypeStruct};

        #[test]
        fn value() -> Result<(), serde_json::Error> {
            check(
                &ValueOrMaybeOrderedArray::Value("value".to_owned()),
                json!("value"),
            )
        }

        #[test]
        fn array() -> Result<(), serde_json::Error> {
            check(
                &MaybeOrderedArray::new(false, StringTypeStruct::default(), None, None),
                json!({
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "ordered": false
                }),
            )
        }
    }
}
