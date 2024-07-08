#[cfg(target_arch = "wasm32")]
pub use wasm::*;

#[cfg(target_arch = "wasm32")]
mod wasm {
    use serde::{Deserialize, Serialize};
    use tsify::Tsify;

    #[cfg(debug_assertions)]
    pub fn set_panic_hook() {
        // When the `console_error_panic_hook` feature is enabled, we can call the
        // `set_panic_hook` function at least once during initialization, and then
        // we will get better error messages if our code ever panics.
        //
        // For more details see
        // https://github.com/rustwasm/console_error_panic_hook#readme
        console_error_panic_hook::set_once();
    }

    /// Represents either success (Ok) or failure (Err).
    #[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Tsify)]
    #[serde(tag = "type", content = "inner")]
    pub enum Result<T, E> {
        Ok(T),
        Err(E),
    }

    impl<T, E> From<std::result::Result<T, E>> for Result<T, E> {
        fn from(result: std::result::Result<T, E>) -> Self {
            match result {
                Ok(val) => Self::Ok(val),
                Err(err) => Self::Err(err),
            }
        }
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use core::fmt::Debug;

    use serde::{Deserialize, Serialize};

    use crate::{Valid, Validator};

    #[derive(Debug, Copy, Clone, PartialEq, Eq)]
    pub(crate) enum JsonEqualityCheck {
        No,
        Yes,
    }

    /// Will serialize as a constant value `"string"`
    #[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub(crate) enum StringTypeTag {
        #[default]
        String,
    }

    // Helpful for testing minimum cases of some of the serialization primitives
    #[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    pub(crate) struct StringTypeStruct {
        r#type: StringTypeTag,
    }

    /// Ensures a type can be deserialized from a given string, as well as being able to be
    /// serialized back.
    ///
    /// Optionally checks the deserialized object against an expected value.
    pub(crate) fn ensure_serialization_from_str<T>(input: &str, equality: JsonEqualityCheck) -> T
    where
        for<'de> T: Serialize + Deserialize<'de>,
    {
        ensure_serialization(
            serde_json::from_str(input).expect("failed to serialize"),
            equality,
        )
    }

    pub(crate) fn ensure_serialization<T>(
        value: serde_json::Value,
        equality: JsonEqualityCheck,
    ) -> T
    where
        for<'de> T: Serialize + Deserialize<'de>,
    {
        let deserialized: T = serde_json::from_value(value.clone()).expect("failed to deserialize");
        let re_serialized = serde_json::to_value(deserialized).expect("failed to serialize");

        if equality == JsonEqualityCheck::Yes {
            assert_eq!(value, re_serialized);
        }

        serde_json::from_value(value).expect("failed to deserialize")
    }

    /// Ensures a type can be deserialized from a given string to its equivalent [`repr`], but then
    /// checks that it fails with a given error when trying to convert it to its native
    /// representation.
    ///
    /// [`repr`]: crate::raw
    pub(crate) fn ensure_failed_deserialization<T>(
        value: serde_json::Value,
        expected_err: &impl ToString,
    ) where
        for<'de> T: Deserialize<'de> + Debug,
    {
        let error = serde_json::from_value::<T>(value).expect_err("failed to deserialize");
        assert!(error.is_data(), "expected a data error");

        assert_eq!(error.to_string(), expected_err.to_string());
    }

    /// Ensures a type can be deserialized from a given string to its equivalent [`repr`], but then
    /// checks that it fails with a given error when trying to convert it to its native
    /// representation.
    ///
    /// [`repr`]: crate::raw
    pub(crate) async fn ensure_failed_validation<T, V>(
        input: serde_json::Value,
        validator: V,
        equality: JsonEqualityCheck,
    ) -> V::Error
    where
        for<'de> T: Serialize + Deserialize<'de> + Send + Sync,
        V: Validator<T, Validated: Debug, Error: Sized> + Send + Sync,
    {
        let value = ensure_serialization::<T>(input.clone(), equality);
        validator
            .validate(value)
            .await
            .expect_err("failed to validate")
    }

    pub(crate) async fn ensure_validation_from_str<T, V>(
        input: &str,
        validator: V,
        equality: JsonEqualityCheck,
    ) -> Valid<V::Validated>
    where
        for<'de> T: Serialize + Deserialize<'de> + Send + Sync,
        V: Validator<T, Validated: Debug + Sized, Error: Debug> + Send + Sync,
    {
        let value = ensure_serialization_from_str::<T>(input, equality);
        validator.validate(value).await.expect("failed to validate")
    }

    pub(crate) async fn ensure_validation<T, V>(
        input: serde_json::Value,
        validator: V,
        equality: JsonEqualityCheck,
    ) -> Valid<V::Validated>
    where
        for<'de> T: Serialize + Deserialize<'de> + Send + Sync,
        V: Validator<T, Validated: Debug + Sized, Error: Debug> + Send + Sync,
    {
        let value = ensure_serialization::<T>(input.clone(), equality);
        validator.validate(value).await.expect("failed to validate")
    }

    /// Ensures a type can be deserialized from a given [`serde_json::Value`] to its equivalent
    /// [`repr`], as well as serializing back to a [`serde_json::Value`].
    ///
    /// Optionally checks the deserialized object against an expected value.
    ///
    /// [`repr`]: crate::raw
    #[expect(
        clippy::needless_pass_by_value,
        reason = "The value is used in the `assert_eq`, and passing by ref here is less convenient"
    )]
    pub(crate) fn check_repr_serialization_from_value<T>(
        input: serde_json::Value,
        expected_native_repr: Option<T>,
    ) -> T
    where
        T: for<'de> Deserialize<'de> + Serialize + Debug + PartialEq,
    {
        let deserialized: T = serde_json::from_value(input.clone()).expect("failed to deserialize");
        let reserialized = serde_json::to_value(&deserialized).expect("failed to serialize");

        if let Some(repr) = expected_native_repr {
            assert_eq!(deserialized, repr);
        }

        assert_eq!(input, reserialized);

        deserialized
    }
}
