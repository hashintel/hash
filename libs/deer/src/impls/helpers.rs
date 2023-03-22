use alloc::string::String;
use core::marker::PhantomData;

use error_stack::{Context, IntoReport, Report, Result, ResultExt};

use crate::{
    error::{ExpectedVariant, ReceivedVariant, UnknownVariantError, Variant, VisitorError},
    Deserialize, Document, Reflection, Visitor,
};

pub(super) trait FieldDiscriminatorKey: Reflection {
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

impl<T> FieldDiscriminatorKeyAccess<T> {
    fn unknown_variant_error(name: impl Into<String>) -> Report<impl Context> {
        Report::new(UnknownVariantError.into_error())
            .attach(ReceivedVariant::new(name))
            .attach(ExpectedVariant::new("Ok"))
            .attach(ExpectedVariant::new("Err"))
            .change_context(VisitorError)
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
                .attach(ExpectedVariant::new("Ok"))
                .attach(ExpectedVariant::new("Err"))
                .change_context(VisitorError);

            match value {
                Ok(name) => Self::unknown_variant_error(name),
                Err(err) => err,
            }
        })
    }
}
