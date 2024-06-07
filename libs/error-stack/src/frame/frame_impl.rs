#[cfg_attr(feature = "std", allow(unused_imports))]
use alloc::boxed::Box;
#[cfg(nightly)]
use core::error::{Error, Request};
use core::{any::Any, fmt};

use crate::{AttachmentKind, Context, Frame, FrameKind};

/// Internal representation of a [`Frame`].
pub(super) trait FrameImpl: Send + Sync + 'static {
    fn kind(&self) -> FrameKind<'_>;

    fn as_any(&self) -> &dyn Any;

    fn as_any_mut(&mut self) -> &mut dyn Any;

    /// Provide values which can then be requested.
    #[cfg(nightly)]
    fn provide<'a>(&'a self, request: &mut Request<'a>);
}

#[cfg(nightly)]
impl fmt::Debug for Box<dyn FrameImpl> {
    fn fmt(&self, _: &mut fmt::Formatter<'_>) -> fmt::Result {
        unreachable!()
    }
}

#[cfg(nightly)]
impl fmt::Display for Box<dyn FrameImpl> {
    fn fmt(&self, _: &mut fmt::Formatter<'_>) -> fmt::Result {
        unreachable!()
    }
}

#[cfg(nightly)]
impl Error for Box<dyn FrameImpl> {
    fn provide<'a>(&'a self, request: &mut Request<'a>) {
        (**self).provide(request);
    }
}

struct ContextFrame<C> {
    context: C,
}

impl<C: Context> FrameImpl for ContextFrame<C> {
    fn kind(&self) -> FrameKind<'_> {
        FrameKind::Context(&self.context)
    }

    fn as_any(&self) -> &dyn Any {
        &self.context
    }

    fn as_any_mut(&mut self) -> &mut dyn Any {
        &mut self.context
    }

    #[cfg(nightly)]
    fn provide<'a>(&'a self, request: &mut Request<'a>) {
        Context::provide(&self.context, request);
    }
}

struct AttachmentFrame<A> {
    attachment: A,
}

impl<A: 'static + Send + Sync> FrameImpl for AttachmentFrame<A> {
    fn kind(&self) -> FrameKind<'_> {
        FrameKind::Attachment(AttachmentKind::Opaque(&self.attachment))
    }

    fn as_any(&self) -> &dyn Any {
        &self.attachment
    }

    fn as_any_mut(&mut self) -> &mut dyn Any {
        &mut self.attachment
    }

    #[cfg(nightly)]
    fn provide<'a>(&'a self, request: &mut Request<'a>) {
        request.provide_ref(&self.attachment);
    }
}

struct PrintableAttachmentFrame<A> {
    attachment: A,
}

impl<A: 'static + fmt::Debug + fmt::Display + Send + Sync> FrameImpl
    for PrintableAttachmentFrame<A>
{
    fn kind(&self) -> FrameKind<'_> {
        FrameKind::Attachment(AttachmentKind::Printable(&self.attachment))
    }

    fn as_any(&self) -> &dyn Any {
        &self.attachment
    }

    fn as_any_mut(&mut self) -> &mut dyn Any {
        &mut self.attachment
    }

    #[cfg(nightly)]
    fn provide<'a>(&'a self, request: &mut Request<'a>) {
        request.provide_ref(&self.attachment);
    }
}

#[cfg(feature = "anyhow")]
struct AnyhowContext(anyhow::Error);

#[cfg(feature = "anyhow")]
impl fmt::Debug for AnyhowContext {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

#[cfg(feature = "anyhow")]
impl fmt::Display for AnyhowContext {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

#[cfg(feature = "anyhow")]
impl Context for AnyhowContext {
    #[cfg(all(nightly, feature = "std"))]
    #[inline]
    fn provide<'a>(&'a self, request: &mut Request<'a>) {
        request.provide_ref(self.0.backtrace());
    }
}

#[cfg(feature = "anyhow")]
impl FrameImpl for AnyhowContext {
    fn kind(&self) -> FrameKind<'_> {
        FrameKind::Context(self)
    }

    fn as_any(&self) -> &dyn Any {
        &self.0
    }

    fn as_any_mut(&mut self) -> &mut dyn Any {
        &mut self.0
    }

    #[cfg(nightly)]
    #[inline]
    fn provide<'a>(&'a self, request: &mut Request<'a>) {
        Context::provide(self, request);
    }
}

#[cfg(feature = "eyre")]
struct EyreContext(eyre::Report);

#[cfg(feature = "eyre")]
impl fmt::Debug for EyreContext {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

#[cfg(feature = "eyre")]
impl fmt::Display for EyreContext {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

#[cfg(feature = "eyre")]
impl Context for EyreContext {
    #[cfg(nightly)]
    #[inline]
    fn provide<'a>(&'a self, request: &mut Request<'a>) {
        Error::provide(self.0.as_ref() as &dyn Error, request);
    }
}

#[cfg(feature = "eyre")]
impl FrameImpl for EyreContext {
    fn kind(&self) -> FrameKind<'_> {
        FrameKind::Context(self)
    }

    fn as_any(&self) -> &dyn Any {
        &self.0
    }

    fn as_any_mut(&mut self) -> &mut dyn Any {
        &mut self.0
    }

    #[cfg(nightly)]
    #[inline]
    fn provide<'a>(&'a self, request: &mut Request<'a>) {
        Context::provide(self, request);
    }
}

impl Frame {
    /// Creates a frame from a [`Context`].
    pub(crate) fn from_context<C>(context: C, sources: Box<[Self]>) -> Self
    where
        C: Context,
    {
        Self {
            frame: Box::new(ContextFrame { context }),
            sources,
        }
    }

    /// Creates a frame from an attachment.
    pub(crate) fn from_attachment<A>(attachment: A, sources: Box<[Self]>) -> Self
    where
        A: Send + Sync + 'static,
    {
        Self {
            frame: Box::new(AttachmentFrame { attachment }),
            sources,
        }
    }

    /// Creates a frame from an attachment which implements [`Debug`] and [`Display`].
    ///
    /// [`Debug`]: core::fmt::Debug
    /// [`Display`]: core::fmt::Display
    pub(crate) fn from_printable_attachment<A>(attachment: A, sources: Box<[Self]>) -> Self
    where
        A: fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        Self {
            frame: Box::new(PrintableAttachmentFrame { attachment }),
            sources,
        }
    }

    /// Creates a frame from an [`anyhow::Error`].
    #[cfg(feature = "anyhow")]
    pub(crate) fn from_anyhow(error: anyhow::Error, sources: Box<[Self]>) -> Self {
        Self {
            frame: Box::new(AnyhowContext(error)),
            sources,
        }
    }

    /// Creates a frame from an [`eyre::Report`].
    #[cfg(feature = "eyre")]
    pub(crate) fn from_eyre(report: eyre::Report, sources: Box<[Self]>) -> Self {
        Self {
            frame: Box::new(EyreContext(report)),
            sources,
        }
    }
}
