//! # HASH Graph Authorization
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Language Features
    exhaustive_patterns,
    impl_trait_in_assoc_type,
    never_type,
    type_alias_impl_trait,
)]

extern crate alloc;

pub mod policies;

#[cfg(test)]
#[expect(clippy::panic_in_result_fn, reason = "Assertions in test are expected")]
mod test_utils {
    use core::{error::Error, fmt};

    use pretty_assertions::assert_eq;
    use serde::{Deserialize, Serialize};
    use serde_json::Value as JsonValue;

    #[track_caller]
    pub(crate) fn check_serialization<T>(constraint: &T, value: JsonValue)
    where
        T: fmt::Debug + PartialEq + Serialize + for<'de> Deserialize<'de>,
    {
        let serialized = serde_json::to_value(constraint).expect("should be JSON representable");
        assert_eq!(serialized, value);
        let deserialized: T =
            serde_json::from_value(value).expect("should be a valid resource constraint");
        assert_eq!(*constraint, deserialized);
    }

    #[track_caller]
    pub(crate) fn check_deserialization_error<T>(
        value: JsonValue,
        error: impl AsRef<str>,
    ) -> Result<(), Box<dyn Error>>
    where
        T: fmt::Debug + Serialize + for<'de> Deserialize<'de>,
    {
        match serde_json::from_value::<T>(value) {
            Ok(value) => panic!(
                "should not be a valid resource constraint: {:#}",
                serde_json::to_value(&value)?
            ),
            Err(actual_error) => assert_eq!(actual_error.to_string(), error.as_ref()),
        }
        Ok(())
    }
}
