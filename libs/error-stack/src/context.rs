use alloc::string::{String, ToString as _};
use core::{error::Error, fmt};

use crate::Report;

/// Captures an error message as the context of a [`Report`].
pub(crate) struct SourceContext(String);

impl SourceContext {
    pub(crate) fn from_error(value: &dyn Error) -> Self {
        Self(value.to_string())
    }
}

impl fmt::Debug for SourceContext {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

impl fmt::Display for SourceContext {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl Error for SourceContext {}

impl<C> From<C> for Report<C>
where
    C: Error + Send + Sync + 'static,
{
    #[track_caller]
    #[inline]
    fn from(context: C) -> Self {
        Self::new(context)
    }
}

/// A trait for types that can be attached to a [`Report`] without being displayed.
pub trait OpaqueAttachment: Send + Sync + 'static {}

impl<T: Send + Sync + 'static> OpaqueAttachment for T {}

/// A trait for types that can be attached to a [`Report`] and displayed.
#[diagnostic::on_unimplemented(
    message = "to attach this type to a `Report` it must implement `fmt::Display` and `fmt::Debug`",
    note = "if you want to attach a type that is not printable, use `attach_opaque` instead"
)]
pub trait Attachment: OpaqueAttachment + fmt::Display + fmt::Debug {}

impl<T: OpaqueAttachment + fmt::Display + fmt::Debug> Attachment for T {}
