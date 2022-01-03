use alloc::{boxed::Box, string::ToString};
use core::{fmt, fmt::Formatter, panic::Location};

use provider::{self, tags, Provider, Requisition, TypeTag};

use super::tags::{FrameLocation, FrameMessage, FrameSource};
use crate::Frame;

pub(super) trait DisplayError: fmt::Display + fmt::Debug {}
impl<T: fmt::Display + fmt::Debug> DisplayError for T {}

pub(super) trait ProviderError: Provider + DisplayError {}
impl<T: Provider + DisplayError> ProviderError for T {}

// TODO: Use thin pointer + vtable to reduce overhead
pub(super) enum ErrorType {
    Message(Box<dyn DisplayError + Send + Sync + 'static>),
    #[cfg(feature = "std")]
    Error(Box<dyn std::error::Error + Send + Sync + 'static>),
    Provider(Box<dyn ProviderError + Send + Sync + 'static>),
}

impl fmt::Debug for ErrorType {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        match self {
            Self::Message(msg) => fmt::Debug::fmt(&msg, fmt),
            #[cfg(feature = "std")]
            Self::Error(err) => fmt::Debug::fmt(&err, fmt),
            Self::Provider(prov) => fmt::Debug::fmt(&prov, fmt),
        }
    }
}

impl Frame {
    #[must_use]
    pub const fn location(&self) -> &'static Location<'static> {
        self.location
    }

    #[must_use]
    pub fn source(&self) -> Option<&Self> {
        self.source.as_ref().map(Box::as_ref)
    }

    #[must_use]
    pub fn request<'p, I>(&'p self) -> Option<I::Type>
    where
        I: TypeTag<'p>,
    {
        provider::request_by_type_tag::<'p, I, _>(self)
    }

    #[must_use]
    pub fn request_ref<T>(&self) -> Option<&T>
    where
        T: ?Sized + 'static,
    {
        self.request::<'_, tags::Ref<T>>()
    }

    #[must_use]
    pub fn request_value<T>(&self) -> Option<T>
    where
        T: 'static,
    {
        self.request::<'_, tags::Value<T>>()
    }
}

impl Provider for Frame {
    fn provide<'p>(&'p self, mut req: Requisition<'p, '_>) {
        req.provide_with::<FrameLocation, _>(|| self.location);
        req.provide_with::<FrameMessage, _>(|| self.to_string().into_boxed_str());
        if let Some(ref cause) = self.source {
            req.provide_with::<FrameSource, _>(|| cause);
        }
        match &self.error {
            #[cfg(feature = "backtrace")]
            ErrorType::Error(err) => {
                if let Some(backtrace) = err.backtrace() {
                    req.provide_with::<crate::tags::ReportBackTrace, _>(|| backtrace);
                }
            }
            ErrorType::Provider(prov) => {
                prov.provide(req);
            }
            _ => {}
        }
    }
}

impl fmt::Debug for Frame {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("Frame")
            .field("error", &self.error)
            .field("location", &self.location)
            .finish()
    }
}

impl fmt::Display for Frame {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.error {
            ErrorType::Message(msg) => fmt::Display::fmt(&msg, fmt),
            #[cfg(feature = "std")]
            ErrorType::Error(err) => fmt::Display::fmt(&err, fmt),
            ErrorType::Provider(prov) => {
                if let Some(msg) =
                    provider::request_by_type_tag::<'_, FrameMessage, _>(prov.as_ref())
                {
                    fmt::Display::fmt(&msg, fmt)
                } else {
                    write!(fmt, "{prov}")
                }
            }
        }
    }
}
