#[cfg(nightly)]
use core::error::{Error, Request};
use core::{any::Any, fmt};

use crate::{AttachmentKind, Context, FrameKind};

/// Internal representation of a [`Frame`].
pub(crate) trait FrameImpl: Send + Sync + 'static {
    fn kind(&self) -> FrameKind<'_>;

    fn as_any(&self) -> &dyn Any;

    fn as_any_mut(&mut self) -> &mut dyn Any;

    /// Provide values which can then be requested.
    #[cfg(nightly)]
    fn provide<'a>(&'a self, request: &mut Request<'a>);
}

#[cfg(nightly)]
#[repr(transparent)]
pub(crate) struct FrameImplError(dyn FrameImpl);

#[cfg(nightly)]
impl FrameImplError {
    pub(crate) fn new(frame: &dyn FrameImpl) -> &Self {
        // SAFETY: `FrameImplError` is a transparent wrapper around `dyn FrameImpl`, so the layout
        // is the same.
        unsafe { &*(frame as *const dyn FrameImpl as *const Self) }
    }
}

#[cfg(nightly)]
impl fmt::Debug for FrameImplError {
    fn fmt(&self, _: &mut fmt::Formatter<'_>) -> fmt::Result {
        unreachable!()
    }
}

#[cfg(nightly)]
impl fmt::Display for FrameImplError {
    fn fmt(&self, _: &mut fmt::Formatter<'_>) -> fmt::Result {
        unreachable!()
    }
}

#[cfg(nightly)]
impl Error for FrameImplError {
    fn provide<'a>(&'a self, request: &mut Request<'a>) {
        self.0.provide(request);
    }
}

pub(crate) struct ContextFrame<C> {
    context: C,
}

impl<C> ContextFrame<C> {
    pub(crate) const fn new(context: C) -> Self {
        Self { context }
    }
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

pub(crate) struct AttachmentFrame<A> {
    attachment: A,
}

impl<A> AttachmentFrame<A> {
    pub(crate) const fn new(attachment: A) -> Self {
        Self { attachment }
    }
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

pub(crate) struct PrintableAttachmentFrame<A> {
    attachment: A,
}

impl<A> PrintableAttachmentFrame<A> {
    pub(crate) const fn new(attachment: A) -> Self {
        Self { attachment }
    }
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
