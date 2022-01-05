use alloc::{boxed::Box, string::ToString};
use core::{fmt, fmt::Formatter, panic::Location};

use provider::{self, tags, Provider, Requisition, TypeTag};

use super::tags::{FrameLocation, FrameSource};
use crate::{Context, ErrorKind, Frame};

pub(super) trait DisplayError: fmt::Display + fmt::Debug {}
impl<T: fmt::Display + fmt::Debug> DisplayError for T {}

pub(super) trait ProviderError: Provider + DisplayError {}
impl<T: Provider + DisplayError> ProviderError for T {}

// TODO: Use thin pointer + vtable to enable downcasting
pub(super) enum Error {
    Kind(Box<dyn ErrorKind>),
    Context(Box<dyn Context>),
    #[cfg(feature = "std")]
    Std(Box<dyn std::error::Error + Send + Sync + 'static>),
}

impl fmt::Display for Error {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Kind(kind) => fmt::Display::fmt(kind, fmt),
            Self::Context(context) => fmt::Display::fmt(context, fmt),
            #[cfg(feature = "std")]
            Self::Std(error) => fmt::Display::fmt(error, fmt),
        }
    }
}

impl Provider for Error {
    fn provide<'p>(&'p self, req: &mut Requisition<'p, '_>) {
        match self {
            Self::Kind(kind) => ErrorKind::provide(kind.as_ref(), req),
            Self::Context(context) => Context::provide(context.as_ref(), req),
            #[cfg(feature = "std")]
            Self::Std(error) =>
            {
                #[cfg(feature = "backtrace")]
                if let Some(backtrace) = error.backtrace() {
                    req.provide_with::<crate::tags::ReportBackTrace, _>(|| backtrace);
                }
            }
        }
    }
}

impl Frame {
    /// Returns the location where this `Frame` was created.
    #[must_use]
    pub const fn location(&self) -> &'static Location<'static> {
        self.location
    }

    /// Requests the value specified by the [`TypeTag`] from the `Frame` if provided.
    #[must_use]
    pub fn request<'p, I>(&'p self) -> Option<I::Type>
    where
        I: TypeTag<'p>,
    {
        provider::request_by_type_tag::<'p, I, _>(self)
    }

    /// Requests the reference to `T` from the `Frame` if provided.
    #[must_use]
    pub fn request_ref<T>(&self) -> Option<&T>
    where
        T: ?Sized + 'static,
    {
        self.request::<'_, tags::Ref<T>>()
    }

    /// Requests the value of `T` from the `Frame` if provided.
    #[must_use]
    pub fn request_value<T>(&self) -> Option<T>
    where
        T: 'static,
    {
        self.request::<'_, tags::Value<T>>()
    }
}

impl Provider for Frame {
    fn provide<'p>(&'p self, req: &mut Requisition<'p, '_>) {
        Provider::provide(&self.error, req);
        req.provide_with::<FrameLocation, _>(|| self.location);
        if let Some(source) = &self.source {
            req.provide_with::<FrameSource, _>(|| source);
        }
    }
}

impl fmt::Debug for Frame {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("Frame")
            .field("error", &self.to_string())
            .field("location", &self.location)
            .finish()
    }
}

impl fmt::Display for Frame {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.error, fmt)
    }
}
