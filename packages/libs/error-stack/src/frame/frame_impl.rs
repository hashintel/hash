use alloc::boxed::Box;
#[cfg(nightly)]
use core::any::Demand;
#[cfg(any(feature = "anyhow", feature = "eyre"))]
use core::fmt;
use core::{
    any::TypeId,
    fmt::{Debug, Display},
    panic::Location,
};

use crate::{AttachmentKind, Context, Frame, FrameKind};

/// Internal representation of a [`Frame`].
///
/// # Safety
///
/// - It must be allowed to cast from `*dyn FrameImpl` to `*T` if `type_id() == TypeId::of::<T>()`.
///   This is the case if [`type_id`] returns `TypeId::of::<T>()` and
///     - `T` is `Self`,
///     - `T` is the inner struct on `#[repr(transparent]`, or
///     - `T` is the first struct on `#[repr(C)]`.
///
/// [`type_id`]: Self::type_id
pub(super) unsafe trait FrameImpl: Send + Sync + 'static {
    fn kind(&self) -> FrameKind<'_>;

    /// Returns the [`TypeId`] of this `Frame`.
    ///
    /// It's guaranteed, that `*dyn FrameImpl` can be cast to a pointer to the type returned by
    /// `type_id`.
    fn type_id(&self) -> TypeId;

    /// Provide values which can then be requested.
    #[cfg(nightly)]
    fn provide<'a>(&'a self, demand: &mut Demand<'a>);
}

#[repr(C)]
struct ContextFrame<C> {
    context: C,
}

// SAFETY: `type_id` returns `C` and `C` is the first field in `#[repr(C)]`
unsafe impl<C: Context> FrameImpl for ContextFrame<C> {
    fn kind(&self) -> FrameKind<'_> {
        FrameKind::Context(&self.context)
    }

    fn type_id(&self) -> TypeId {
        TypeId::of::<C>()
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

// SAFETY: `type_id` returns `A` and `A` is the first field in `#[repr(C)]`
unsafe impl<A: 'static + Send + Sync> FrameImpl for AttachmentFrame<A> {
    fn kind(&self) -> FrameKind<'_> {
        FrameKind::Attachment(AttachmentKind::Opaque(&self.attachment))
    }

    fn type_id(&self) -> TypeId {
        TypeId::of::<A>()
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

// SAFETY: `type_id` returns `A` and `A` is the first field in `#[repr(C)]`
unsafe impl<A: 'static + Debug + Display + Send + Sync> FrameImpl for PrintableAttachmentFrame<A> {
    fn kind(&self) -> FrameKind<'_> {
        FrameKind::Attachment(AttachmentKind::Printable(&self.attachment))
    }

    fn type_id(&self) -> TypeId {
        TypeId::of::<A>()
    }

    #[cfg(nightly)]
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        demand.provide_ref(&self.attachment);
    }
}

#[repr(transparent)]
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
// SAFETY: `type_id` returns `anyhow::Error` and `AnyhowContext` is `#[repr(transparent)]`
unsafe impl FrameImpl for AnyhowContext {
    fn kind(&self) -> FrameKind<'_> {
        FrameKind::Context(self)
    }

    fn type_id(&self) -> TypeId {
        TypeId::of::<anyhow::Error>()
    }

    #[cfg(nightly)]
    #[inline]
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        Context::provide(self, demand);
    }
}

#[repr(transparent)]
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
// SAFETY: `type_id` returns `eyre::Report` and `EyreContext` is `#[repr(transparent)]`
unsafe impl FrameImpl for EyreContext {
    fn kind(&self) -> FrameKind<'_> {
        FrameKind::Context(self)
    }

    fn type_id(&self) -> TypeId {
        TypeId::of::<eyre::Report>()
    }

    #[cfg(nightly)]
    #[inline]
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        Context::provide(self, demand);
    }
}

impl Frame {
    /// Creates a frame from a [`Context`].
    pub(crate) fn from_context<C>(
        context: C,
        location: &'static Location<'static>,
        sources: Box<[Self]>,
    ) -> Self
    where
        C: Context,
    {
        Self {
            frame: Box::new(ContextFrame { context }),
            location,
            sources,
        }
    }

    /// Creates a frame from an attachment.
    pub(crate) fn from_attachment<A>(
        attachment: A,
        location: &'static Location<'static>,
        sources: Box<[Self]>,
    ) -> Self
    where
        A: Send + Sync + 'static,
    {
        Self {
            frame: Box::new(AttachmentFrame { attachment }),
            location,
            sources,
        }
    }

    /// Creates a frame from an [`anyhow::Error`].
    #[cfg(feature = "anyhow")]
    pub(crate) fn from_anyhow(
        error: anyhow::Error,
        location: &'static Location<'static>,
        sources: Box<[Self]>,
    ) -> Self {
        Self {
            frame: Box::new(AnyhowContext(error)),
            location,
            sources,
        }
    }

    /// Creates a frame from an [`eyre::Report`].
    #[cfg(feature = "eyre")]
    pub(crate) fn from_eyre(
        report: eyre::Report,
        location: &'static Location<'static>,
        sources: Box<[Self]>,
    ) -> Self {
        Self {
            frame: Box::new(EyreContext(report)),
            location,
            sources,
        }
    }

    /// Creates a frame from an attachment which implements [`Debug`] and [`Display`].
    ///
    /// [`Debug`]: core::fmt::Debug
    /// [`Display`]: core::fmt::Display
    pub(crate) fn from_printable_attachment<A>(
        attachment: A,
        location: &'static Location<'static>,
        sources: Box<[Self]>,
    ) -> Self
    where
        A: Display + Debug + Send + Sync + 'static,
    {
        Self {
            frame: Box::new(PrintableAttachmentFrame { attachment }),
            location,
            sources,
        }
    }
}
