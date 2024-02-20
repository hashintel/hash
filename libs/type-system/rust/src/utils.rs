#[cfg(target_arch = "wasm32")]
pub use wasm::*;

#[cfg(target_arch = "wasm32")]
mod wasm {
    use serde::{Deserialize, Serialize};
    use tsify::Tsify;

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
    use std::fmt::Debug;

    use serde::{de::DeserializeOwned, Deserialize, Serialize};

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
    pub(crate) fn check_serialization_from_str<T, R>(
        input: &str,
        expected_native_repr: Option<R>,
    ) -> T
    where
        T: Debug + Clone + TryFrom<R>,
        T::Error: Debug,
        R: Debug + PartialEq + Clone + From<T> + Serialize + DeserializeOwned,
    {
        let deserialized_repr: R = serde_json::from_str(input).expect("failed to deserialize");
        let value: T = deserialized_repr
            .clone()
            .try_into()
            .expect("failed to convert");
        let re_serialized_repr: R = value.clone().into();

        assert_eq!(deserialized_repr, re_serialized_repr);
        if let Some(repr) = expected_native_repr {
            assert_eq!(re_serialized_repr, repr);
        }

        let _re_serialized_value =
            serde_json::to_value(re_serialized_repr).expect("failed to serialize");

        value
    }

    /// Ensures a type can be deserialized from a given string to its equivalent [`repr`], but then
    /// checks that it fails with a given error when trying to convert it to its native
    /// representation.
    ///
    /// [`repr`]: crate::raw
    pub(crate) fn ensure_failed_validation<R, T>(input: &serde_json::Value, expected_err: T::Error)
    where
        R: for<'de> Deserialize<'de> + Serialize + Debug + PartialEq,
        T: TryFrom<R> + Debug + PartialEq,
        <T as TryFrom<R>>::Error: Debug + PartialEq,
    {
        let repr: R = serde_json::from_value(input.clone()).expect("failed to deserialize");
        let result = T::try_from(repr);

        assert_eq!(result, Err(expected_err));
    }

    /// Ensures a type can be deserialized from a given [`serde_json::Value`] to its equivalent
    /// [`repr`], as well as serializing back to a [`serde_json::Value`].
    ///
    /// Optionally checks the deserialized object against an expected value.
    ///
    /// [`repr`]: crate::raw
    #[expect(clippy::similar_names)]
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

    /// Ensures a given [`serde_json::Value`] fails when trying to be deserialized into a given
    /// [`repr`] for a type.
    ///
    /// [`repr`]: crate::raw
    pub(crate) fn ensure_repr_failed_deserialization<T>(json: serde_json::Value)
    where
        for<'de> T: Debug + Deserialize<'de>,
    {
        serde_json::from_value::<T>(json)
            .expect_err("JSON was expected to be invalid but it was accepted");
    }
}
