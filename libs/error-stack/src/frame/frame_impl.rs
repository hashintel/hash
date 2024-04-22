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

struct ErrorFrame<T>(T);

impl<T: AsRef<dyn Error>> fmt::Debug for ErrorFrame<T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(self.0.as_ref(), fmt)
    }
}

impl<T: AsRef<dyn Error>> fmt::Display for ErrorFrame<T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(self.0.as_ref(), fmt)
    }
}

impl<T: AsRef<dyn Error> + Send + Sync + 'static> Context for ErrorFrame<T> {
    #[cfg(all(nightly, feature = "std"))]
    #[inline]
    default fn provide<'a>(&'a self, request: &mut Request<'a>) {
        self.0.as_ref().provide(request);
    }
}

#[cfg(feature = "anyhow")]
impl Context for ErrorFrame<anyhow::Error> {
    #[cfg(all(nightly, feature = "std"))]
    #[inline]
    fn provide<'a>(&'a self, request: &mut Request<'a>) {
        request.provide_ref(self.0.backtrace());
    }
}

impl<T: AsRef<dyn Error> + Send + Sync + 'static> FrameImpl for ErrorFrame<T> {
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

    pub(crate) fn from_error<E>(error: E) -> Self
    where
        E: AsRef<dyn Error> + Send + Sync + 'static,
    {
        let error_ref = error.as_ref();
        let mut source = error_ref.source();
        let mut sources = alloc::vec::Vec::new();

        while let Some(err) = source {
            sources.push(alloc::string::ToString::to_string(err));
            source = err.source();
        }

        println!("{sources:?}");
        let mut source_frames: Box<[Self]> = Box::new([]);
        while let Some(source) = sources.pop() {
            source_frames = Box::new([Self::from_printable_attachment(source, source_frames)]);
        }
        Self {
            frame: Box::new(ErrorFrame(error)),
            sources: source_frames,
        }
    }
}
