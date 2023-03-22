use alloc::string::String;
use core::marker::PhantomData;

use error_stack::{Context, IntoReport, Report, Result, ResultExt};

use crate::{
    error::{ExpectedVariant, ReceivedVariant, UnknownVariantError, Variant, VisitorError},
    Deserialize, Document, Reflection, Visitor,
};

pub(super) trait FieldDiscriminatorKey: Reflection {
    const VARIANTS: &'static [&'static str];

    fn try_str(value: &str) -> Option<Self>;
    fn try_bytes(value: &[u8]) -> Option<Self>;
}

pub(super) struct FieldDiscriminatorKeyAccess<T>(PhantomData<fn() -> T>);

impl<T> FieldDiscriminatorKeyAccess<T> {
    #[must_use]
    pub(super) const fn new() -> Self {
        Self(PhantomData)
    }
}

impl<T> FieldDiscriminatorKeyAccess<T>
where
    T: FieldDiscriminatorKey,
{
    fn attach_expected_variants<C>(mut error: Report<C>) -> Report<C> {
        for variant in T::VARIANTS {
            error = error.attach(ExpectedVariant::new(*variant));
        }

        error
    }

    fn unknown_variant_error(name: impl Into<String>) -> Report<impl Context> {
        let error =
            Report::new(UnknownVariantError.into_error()).attach(ReceivedVariant::new(name));

        Self::attach_expected_variants(error).change_context(VisitorError)
    }
}

impl<'de, T> Visitor<'de> for FieldDiscriminatorKeyAccess<T>
where
    T: FieldDiscriminatorKey,
{
    type Value = T;

    fn expecting(&self) -> Document {
        T::document()
    }

    fn visit_str(self, v: &str) -> Result<Self::Value, VisitorError> {
        T::try_str(v).ok_or_else(|| Self::unknown_variant_error(v))
    }

    fn visit_bytes(self, v: &[u8]) -> Result<Self::Value, VisitorError> {
        T::try_bytes(v).ok_or_else(|| {
            let value = core::str::from_utf8(v)
                .into_report()
                .change_context(UnknownVariantError.into_error())
                .map_err(Self::attach_expected_variants);

            match value {
                Ok(name) => Self::unknown_variant_error(name),
                Err(error) => error.change_context(VisitorError),
            }
        })
    }
}
