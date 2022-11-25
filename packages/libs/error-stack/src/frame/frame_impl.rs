use alloc::boxed::Box;
#[cfg(nightly)]
use core::any::Demand;
use core::{any::Any, fmt};

use crate::{AttachmentKind, Context, Frame, FrameKind};

/// Internal representation of a [`Frame`].
pub(super) trait FrameImpl: Send + Sync + 'static {
    fn kind(&self) -> FrameKind<'_>;

    fn as_any(&self) -> &dyn Any;

    fn as_any_mut(&mut self) -> &mut dyn Any;

    /// Provide values which can then be requested.
    #[cfg(nightly)]
    fn provide<'a>(&'a self, demand: &mut Demand<'a>);
}

#[repr(C)]
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
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        Context::provide(&self.context, demand);
    }
}

#[repr(C)]
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
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        demand.provide_ref(&self.attachment);
    }
}

#[repr(C)]
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
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        demand.provide_ref(&self.attachment);
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
    // `Provider` is only implemented for `anyhow::Error` on `std`
    #[cfg(all(nightly, feature = "std"))]
    #[inline]
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        core::any::Provider::provide(&self.0, demand);
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
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        Context::provide(self, demand);
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
    fn provide<'a>(&'a self, _demand: &mut Demand<'a>) {
        // `eyre::Report` does not implement `Provider`
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
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        Context::provide(self, demand);
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
}
