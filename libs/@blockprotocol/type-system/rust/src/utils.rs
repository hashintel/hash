#[cfg(target_arch = "wasm32")]
mod wasm {
    use serde::{Deserialize, Serialize};
    use tsify::Tsify;
    use wasm_bindgen::prelude::wasm_bindgen;

    #[wasm_bindgen(typescript_custom_section)]
    const TS_APPEND_CONTENT: &'static str = r#"
import type { Real } from "@rust/hash-codec/types";
import type {
    ActorEntityUuid,
    ActorGroupEntityUuid,
    ActorType,
    BaseUrl,
    DraftId,
    EntityEditionId,
    OntologyTypeVersion,
    PropertyValue,
    UserId,
    WebId
} from "../types/index.snap.js";

type BrandedBase<Base, Kind extends Record<string, unknown>> = Base & {
  // The property prefixes are chosen such that they shouldn't appear in intellisense.

  /** The type of the value space that is branded */
  readonly "\#base": Base;
  /** The unique name for the branded type */
  readonly "\#kind": Kind;
};

/**
 * The type-branding type to support nominal (name based) types
 */
export type Brand<Base, Kind extends string> = Base extends BrandedBase<
  infer NestedBase,
  infer NestedKind
>
  ? BrandedBase<NestedBase, NestedKind & { [_ in Kind]: true }>
  : BrandedBase<Base, { [_ in Kind]: true }>;
    "#;

    // Common types

    #[derive(tsify::Tsify)]
    #[expect(dead_code, reason = "Used in the generated TypeScript types")]
    struct Url(#[tsify(type = "Brand<string, \"Url\">")] String);

    #[derive(tsify::Tsify)]
    #[expect(dead_code, reason = "Used in the generated TypeScript types")]
    struct Timestamp(#[tsify(type = "Brand<string, \"Timestamp\">")] String);

    #[derive(tsify::Tsify)]
    #[serde(rename_all = "camelCase", tag = "kind", content = "limit")]
    #[expect(dead_code, reason = "Used in the generated TypeScript types")]
    enum TemporalBound {
        Unbounded,
        Inclusive(Timestamp),
        Exclusive(Timestamp),
    }
    #[derive(tsify::Tsify)]
    #[serde(rename_all = "camelCase", tag = "kind", content = "limit")]
    #[expect(dead_code, reason = "Used in the generated TypeScript types")]
    enum LimitedTemporalBound {
        Inclusive(Timestamp),
        Exclusive(Timestamp),
    }
    #[derive(tsify::Tsify)]
    #[serde(rename_all = "camelCase", tag = "kind", content = "limit")]
    #[expect(dead_code, reason = "Used in the generated TypeScript types")]
    enum ClosedTemporalBound {
        Inclusive(Timestamp),
    }
    #[derive(tsify::Tsify)]
    #[serde(rename_all = "camelCase", tag = "kind", content = "limit")]
    #[expect(dead_code, reason = "Used in the generated TypeScript types")]
    enum OpenTemporalBound {
        Exclusive(Timestamp),
        Unbounded,
    }

    #[derive(tsify::Tsify)]
    #[expect(dead_code, reason = "Used in the generated TypeScript types")]
    struct TemporalInterval<Start, End> {
        start: Start,
        end: End,
    }
    #[derive(tsify::Tsify)]
    #[expect(dead_code, reason = "Used in the generated TypeScript types")]
    struct RightBoundedTemporalInterval {
        start: TemporalBound,
        end: LimitedTemporalBound,
    }
    #[derive(tsify::Tsify)]
    #[expect(dead_code, reason = "Used in the generated TypeScript types")]
    struct LeftClosedTemporalInterval {
        start: ClosedTemporalBound,
        end: OpenTemporalBound,
    }

    /// Sets up better error messages for WebAssembly panics.
    ///
    /// When compiled to WebAssembly, this function configures the panic hook
    /// to provide more detailed error messages in the browser console when
    /// Rust code panics. This should be called during initialization.
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
    #[expect(dead_code, reason = "Used in the generated TypeScript types")]
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

    use error_stack::ResultExt as _;
    use serde::{Deserialize, Serialize};

    use crate::{Valid, Validator};

    #[derive(Debug, Copy, Clone, PartialEq, Eq)]
    pub(crate) enum JsonEqualityCheck {
        No,
        Yes,
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
        let deserialized: T = serde_json::from_value(value.clone())
            .attach_with(|| value.clone())
            .expect("failed to deserialize");
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
        for<'de> T: Debug + Serialize + Deserialize<'de> + Send + Sync,
        V: Validator<T, Error: Sized> + Send + Sync,
    {
        let value = ensure_serialization::<T>(input, equality);
        validator.validate(value).expect_err("failed to validate")
    }

    pub(crate) async fn ensure_validation_from_str<T, V>(
        input: &str,
        validator: V,
        equality: JsonEqualityCheck,
    ) -> Valid<T>
    where
        for<'de> T: Serialize + Deserialize<'de> + Send + Sync,
        V: Validator<T, Error: Debug> + Send + Sync,
    {
        let value = ensure_serialization_from_str::<T>(input, equality);
        validator.validate(value).expect("failed to validate")
    }

    pub(crate) async fn ensure_validation<T, V>(
        input: serde_json::Value,
        validator: V,
        equality: JsonEqualityCheck,
    ) -> Valid<T>
    where
        for<'de> T: Serialize + Deserialize<'de> + Send + Sync,
        V: Validator<T, Error: Debug> + Send + Sync,
    {
        let value = ensure_serialization::<T>(input, equality);
        validator.validate(value).expect("failed to validate")
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
