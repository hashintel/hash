use std::{collections::HashMap, str::FromStr};

use serde::{Deserialize, Serialize};
#[cfg(target_arch = "wasm32")]
use {tsify::Tsify, wasm_bindgen::prelude::*};

use crate::{
    raw, url::VersionedUrl, EntityTypeReference, OneOf, ParseEntityTypeReferenceArrayError,
    ParseLinksError, ParseOneOfError,
};

#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Links {
    #[cfg_attr(
        target_arch = "wasm32",
        tsify(
            optional,
            type = "Record<VersionedUrl, MaybeOrderedArray<MaybeOneOfEntityTypeReference>>"
        )
    )]
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub links: HashMap<String, MaybeOrderedArray<MaybeOneOfEntityTypeReference>>,
}

impl TryFrom<Links> for super::Links {
    type Error = ParseLinksError;

    fn try_from(links_repr: Links) -> Result<Self, Self::Error> {
        let links = links_repr
            .links
            .into_iter()
            .map(|(url, val)| {
                Ok((
                    VersionedUrl::from_str(&url).map_err(ParseLinksError::InvalidLinkKey)?,
                    val.try_into().map_err(ParseLinksError::InvalidArray)?,
                ))
            })
            .collect::<Result<HashMap<_, _>, Self::Error>>()?;

        Ok(Self::new(links))
    }
}

impl From<super::Links> for Links {
    fn from(object: super::Links) -> Self {
        let links = object
            .0
            .into_iter()
            .map(|(url, val)| (url.to_string(), val.into()))
            .collect();

        Self { links }
    }
}

#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MaybeOrderedArray<T> {
    #[serde(flatten)]
    array: raw::Array<T>,
    #[cfg_attr(target_arch = "wasm32", tsify(optional))]
    #[serde(default)]
    ordered: bool,
}

impl TryFrom<MaybeOrderedArray<MaybeOneOfEntityTypeReference>>
    for super::MaybeOrderedArray<Option<OneOf<EntityTypeReference>>>
{
    type Error = ParseEntityTypeReferenceArrayError;

    fn try_from(
        maybe_ordered_array_repr: MaybeOrderedArray<MaybeOneOfEntityTypeReference>,
    ) -> Result<Self, Self::Error> {
        Ok(Self {
            array: maybe_ordered_array_repr.array.try_into()?,
            ordered: maybe_ordered_array_repr.ordered,
        })
    }
}

impl From<super::MaybeOrderedArray<Option<OneOf<EntityTypeReference>>>>
    for MaybeOrderedArray<MaybeOneOfEntityTypeReference>
{
    fn from(
        maybe_ordered_array: super::MaybeOrderedArray<Option<OneOf<EntityTypeReference>>>,
    ) -> Self {
        Self {
            array: maybe_ordered_array.array.into(),
            ordered: maybe_ordered_array.ordered,
        }
    }
}

// TODO: tsify can't handle a flattened optional on `MaybeOneOfEntityTypeReference`, so we have to
//  manually define the type, see wasm::MaybeOneOfEntityTypeReferencePatch
//  https://github.com/madonoharu/tsify/issues/10

// This struct is needed because its used inside generic parameters of other structs like `Array`.
// Those structs can't apply serde's `default` or `skip_serializing_if` which means the option
// doesn't de/serialize as required unless wrapped in an intermediary struct.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MaybeOneOfEntityTypeReference {
    #[serde(flatten, default, skip_serializing_if = "Option::is_none")]
    inner: Option<raw::OneOf<raw::EntityTypeReference>>,
}

impl MaybeOneOfEntityTypeReference {
    #[must_use]
    pub fn into_inner(self) -> Option<raw::OneOf<raw::EntityTypeReference>> {
        self.inner
    }
}

impl From<Option<OneOf<EntityTypeReference>>> for MaybeOneOfEntityTypeReference {
    fn from(option: Option<OneOf<EntityTypeReference>>) -> Self {
        Self {
            inner: option.map(std::convert::Into::into),
        }
    }
}

impl TryFrom<MaybeOneOfEntityTypeReference> for Option<OneOf<EntityTypeReference>> {
    type Error = ParseOneOfError;

    fn try_from(value: MaybeOneOfEntityTypeReference) -> Result<Self, Self::Error> {
        value
            .into_inner()
            .map(std::convert::TryInto::try_into)
            .transpose()
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::utils::tests::{
        check_repr_serialization_from_value, ensure_repr_failed_deserialization, StringTypeStruct,
    };

    // TODO - write some tests for validation of Link schemas, although most testing happens on
    //  entity types

    mod maybe_ordered_array {
        use std::num::NonZero;

        use super::*;
        use crate::ontology::raw::Array;

        #[test]
        fn unordered() {
            let expected_inner = json!(
                {
                    "type": "array",
                    "items": {
                        "type": "string"
                    }
                }
            );

            let as_json = json!({
                "type": "array",
                "items": {
                    "type": "string"
                },
                "ordered": false,
            });

            let inner_array: raw::Array<StringTypeStruct> = serde_json::from_value(expected_inner)
                .expect("failed to deserialize array to repr");

            check_repr_serialization_from_value(
                as_json,
                Some(MaybeOrderedArray {
                    array: inner_array,
                    ordered: false,
                }),
            );
        }

        #[test]
        fn ordered() {
            let expected_inner = json!(
                {
                    "type": "array",
                    "items": {
                        "type": "string"
                    }
                }
            );

            let as_json = json!({
                "type": "array",
                "items": {
                    "type": "string"
                },
                "ordered": true
            });

            let inner_array: raw::Array<StringTypeStruct> = serde_json::from_value(expected_inner)
                .expect("failed to deserialize array to repr");

            check_repr_serialization_from_value(
                as_json,
                Some(MaybeOrderedArray {
                    array: inner_array,
                    ordered: true,
                }),
            );
        }

        #[test]
        fn constrained() {
            let expected_inner = json!(
                {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "minItems": 10,
                    "maxItems": 20,
                }
            );

            let as_json = json!({
                "type": "array",
                "items": {
                    "type": "string"
                },
                "minItems": 10,
                "maxItems": 20,
                "ordered": false,
            });

            let inner_array: raw::Array<StringTypeStruct> = serde_json::from_value(expected_inner)
                .expect("failed to deserialize array to repr");

            check_repr_serialization_from_value(
                as_json,
                Some(MaybeOrderedArray {
                    array: inner_array,
                    ordered: false,
                }),
            );
        }

        #[test]
        fn unconstrained() {
            check_repr_serialization_from_value(
                json!({}),
                Some(Links {
                    links: HashMap::new(),
                }),
            );

            let link_type = "https://example.com/@example-org/types/entity-type/friend-of/v/1";

            check_repr_serialization_from_value(
                json!({
                    "links": {
                        link_type: {
                            "type": "array",
                            "items": {},
                            "maxItems": 10,
                            "ordered": false,
                        }
                    }
                }),
                Some(Links {
                    links: HashMap::from([(
                        link_type.to_owned(),
                        MaybeOrderedArray {
                            array: Array::new(
                                MaybeOneOfEntityTypeReference { inner: None },
                                None,
                                NonZero::new(10),
                            ),
                            ordered: false,
                        },
                    )]),
                }),
            );
        }

        #[test]
        #[expect(
            clippy::too_many_lines,
            reason = "Test is long because it's merging multiple link constraints"
        )]
        fn merged() {
            let link_type_a = VersionedUrl::from_str(
                "https://example.com/@example-org/types/entity-type/friend-of/v/1",
            )
            .expect("failed to parse VersionedUrl");

            let link_type_b = VersionedUrl::from_str(
                "https://example.com/@example-org/types/entity-type/created-at/v/1",
            )
            .expect("failed to parse VersionedUrl");
            let link_type_b_1_dest = VersionedUrl::from_str(
                "https://example.com/@example-org/types/entity-type/location/v/1",
            )
            .expect("failed to parse VersionedUrl");
            let link_type_b_2_dest = VersionedUrl::from_str(
                "https://example.com/@example-org/types/entity-type/city/v/1",
            )
            .expect("failed to parse VersionedUrl");

            let link_type_c = VersionedUrl::from_str(
                "https://example.com/@example-org/types/entity-type/born-in/v/1",
            )
            .expect("failed to parse VersionedUrl");
            let link_type_c_dest = VersionedUrl::from_str(
                "https://example.com/@example-org/types/entity-type/country/v/1",
            )
            .expect("failed to parse VersionedUrl");

            check_repr_serialization_from_value(
                json!({
                    "links": {
                        link_type_a.to_string(): {
                            "type": "array",
                            "items": {},
                            "minItems": 2,
                            "maxItems": 10,
                            "ordered": false,
                        },
                        link_type_b.to_string(): {
                            "type": "array",
                            "items": {
                                "oneOf": [
                                    { "$ref": link_type_b_1_dest.to_string() },
                                ]
                            },
                            "minItems": 15,
                            "maxItems": 10,
                            "ordered": false,
                        },
                        link_type_c.to_string(): {
                            "type": "array",
                            "items": {
                                "oneOf": [
                                    { "$ref": link_type_c_dest.to_string() },
                                ]
                            },
                            "minItems": 1,
                            "maxItems": 2,
                            "ordered": false,
                        },
                    }
                }),
                Some(Links::from(
                    [
                        json!({
                            "links": {
                                link_type_a.to_string(): {
                                    "type": "array",
                                    "items": {},
                                    "maxItems": 10,
                                    "ordered": false,
                                },
                                link_type_b.to_string(): {
                                    "type": "array",
                                    "items": {
                                        "oneOf": [
                                            { "$ref": link_type_b_1_dest.to_string() },
                                            { "$ref": link_type_b_2_dest.to_string() },
                                        ]
                                    },
                                    "minItems": 2,
                                    "maxItems": 10,
                                    "ordered": false,
                                },
                                link_type_c.to_string(): {
                                    "type": "array",
                                    "items": {
                                        "oneOf": [
                                            { "$ref": link_type_c_dest.to_string() },
                                        ]
                                    },
                                },
                            }
                        }),
                        json!({
                            "links": {
                                link_type_a.to_string(): {
                                    "type": "array",
                                    "items": {},
                                    "minItems": 2,
                                    "ordered": false,
                                },
                                link_type_b.to_string(): {
                                    "type": "array",
                                    "items": {
                                        "oneOf": [
                                            { "$ref": link_type_b_1_dest.to_string() },
                                        ]
                                    },
                                    "minItems": 15,
                                    "ordered": false,
                                },
                                link_type_c.to_string(): {
                                    "type": "array",
                                    "items": {},
                                    "minItems": 1,
                                    "maxItems": 2,
                                    "ordered": false,
                                },
                            }
                        }),
                    ]
                    .into_iter()
                    .map(|json| {
                        crate::Links::try_from(
                            serde_json::from_value::<Links>(json)
                                .expect("failed to deserialize links"),
                        )
                        .expect("failed to convert links")
                    })
                    .collect::<crate::Links>(),
                )),
            );
        }

        #[test]
        fn additional_properties() {
            let as_json = json!({
                "type": "array",
                "items": {
                    "type": "string"
                },
                "ordered": false,
                "minItems": 10,
                "maxItems": 20,
                "additional": 30,
            });

            ensure_repr_failed_deserialization::<MaybeOrderedArray<StringTypeStruct>>(as_json);
        }
    }
}
