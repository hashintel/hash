use serde::{Deserialize, Serialize};
#[cfg(target_arch = "wasm32")]
use tsify::Tsify;

use crate::{raw, EntityTypeReference, ParseAllOfError};

#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AllOf<T> {
    #[cfg_attr(target_arch = "wasm32", tsify(optional, type = "T[]"))]
    #[serde(
        rename = "allOf",
        default = "Vec::new",
        skip_serializing_if = "Vec::is_empty"
    )]
    pub elements: Vec<T>,
}

impl TryFrom<AllOf<raw::EntityTypeReference>> for super::AllOf<EntityTypeReference> {
    type Error = ParseAllOfError;

    fn try_from(all_of_repr: AllOf<raw::EntityTypeReference>) -> Result<Self, Self::Error> {
        let inner = all_of_repr
            .elements
            .into_iter()
            .map(|ele| {
                ele.try_into()
                    .map_err(ParseAllOfError::EntityTypeReferenceError)
            })
            .collect::<Result<Vec<_>, Self::Error>>()?;

        Ok(Self::new(inner))
    }
}

impl<T, R> From<super::AllOf<T>> for AllOf<R>
where
    R: From<T>,
{
    fn from(all_of: super::AllOf<T>) -> Self {
        let elements = all_of
            .elements
            .into_iter()
            .map(std::convert::Into::into)
            .collect();
        Self { elements }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    mod all_of {
        use super::*;
        use crate::utils::tests::{
            check_repr_serialization_from_value, ensure_repr_failed_deserialization,
        };

        #[test]
        fn one() {
            check_repr_serialization_from_value(
                json!({
                    "allOf": ["A"]
                }),
                Some(AllOf {
                    elements: ["A".to_owned()].to_vec(),
                }),
            );
        }

        #[test]
        fn multiple() {
            check_repr_serialization_from_value(
                json!({
                    "allOf": ["A", "B"]
                }),
                Some(AllOf {
                    elements: ["A".to_owned(), "B".to_owned()].to_vec(),
                }),
            );
        }

        #[test]
        fn additional_properties() {
            ensure_repr_failed_deserialization::<AllOf<()>>(json!({
                "allOf": ["A", "B"],
                "additional": 10,
            }));
        }
    }
}
