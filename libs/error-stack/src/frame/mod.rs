mod frame_impl;
mod kind;

#[cfg_attr(feature = "std", allow(unused_imports))]
use alloc::boxed::Box;
#[cfg(nightly)]
use core::error::{self, Error};
use core::{any::TypeId, fmt};

pub(crate) use self::frame_impl::{
    AttachmentFrame, ContextFrame, FrameImpl, FrameImplError, PrintableAttachmentFrame,
};
pub use self::kind::{AttachmentKind, FrameKind};
use crate::report::RawSlice;

/// A single context or attachment inside of a [`Report`].
///
/// `Frame`s are organized as a singly linked list, which can be iterated by calling
/// [`Report::frames()`]. The head contains the current context or attachment, and the tail contains
/// the root context created by [`Report::new()`]. The next `Frame` can be accessed by requesting it
/// by calling [`Report::request_ref()`].
///
/// The `Frame` is deliberately unsized to ensure that it is only ever allocated as part of a
/// `Report`.
///
/// [`Report`]: crate::Report
/// [`Report::frames()`]: crate::Report::frames
/// [`Report::new()`]: crate::Report::new
/// [`Report::request_ref()`]: crate::Report::request_ref
// We use `#[repr(C)]` to ensure a predictable memory layout, as the `Rust` repr is not guaranteed.
#[repr(C)]
pub struct Frame {
    sources: Option<RawSlice>,
    // We force `Frame` to be unsized, as we only allocate it in `Report` this gives us additional
    // guarantees.
    r#impl: dyn FrameImpl,
}

impl Frame {
    /// Returns a shared reference to the source of this `Frame`.
    ///
    /// This corresponds to the `Frame` below this one in a [`Report`].
    ///
    /// [`Report`]: crate::Report
    #[must_use]
    pub fn sources(&self) -> &[Box<Self>] {
        let Some(sources) = &self.sources else {
            return &[];
        };

        sources.as_slice()
    }

    /// Returns a mutable reference to the sources of this `Frame`.
    ///
    /// This corresponds to the `Frame` below this one in a [`Report`].
    ///
    /// [`Report`]: crate::Report
    #[must_use]
    pub fn sources_mut(&mut self) -> &mut [Box<Self>] {
        let Some(sources) = &mut self.sources else {
            return &mut [];
        };

        sources.as_slice_mut()
    }

    /// Returns how the `Frame` was created.
    #[must_use]
    pub fn kind(&self) -> FrameKind<'_> {
        self.r#impl.kind()
    }

    /// Requests the reference to `T` from the `Frame` if provided.
    #[must_use]
    #[cfg(nightly)]
    pub fn request_ref<T>(&self) -> Option<&T>
    where
        T: ?Sized + 'static,
    {
        error::request_ref(self.as_error())
    }

    /// Requests the value of `T` from the `Frame` if provided.
    #[must_use]
    #[cfg(nightly)]
    pub fn request_value<T>(&self) -> Option<T>
    where
        T: 'static,
    {
        error::request_value(self.as_error())
    }

    /// Returns if `T` is the held context or attachment by this frame.
    #[must_use]
    pub fn is<T: Send + Sync + 'static>(&self) -> bool {
        self.r#impl.as_any().is::<T>()
    }

    /// Downcasts this frame if the held context or attachment is the same as `T`.
    #[must_use]
    pub fn downcast_ref<T: Send + Sync + 'static>(&self) -> Option<&T> {
        self.r#impl.as_any().downcast_ref()
    }

    /// Downcasts this frame if the held context or attachment is the same as `T`.
    #[must_use]
    pub fn downcast_mut<T: Send + Sync + 'static>(&mut self) -> Option<&mut T> {
        self.r#impl.as_any_mut().downcast_mut()
    }

    /// Returns the [`TypeId`] of the held context or attachment by this frame.
    #[must_use]
    pub fn type_id(&self) -> TypeId {
        self.r#impl.as_any().type_id()
    }

    #[cfg(nightly)]
    pub(crate) fn as_error(&self) -> &(impl Error + ?Sized) {
        FrameImplError::new(&self.r#impl)
    }
}

impl fmt::Debug for Frame {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut debug = fmt.debug_struct("Frame");

        match self.kind() {
            FrameKind::Context(context) => {
                debug.field("context", &context);
                debug.finish()
            }
            FrameKind::Attachment(AttachmentKind::Printable(attachment)) => {
                debug.field("attachment", &attachment);
                debug.finish()
            }
            FrameKind::Attachment(AttachmentKind::Opaque(_)) => debug.finish_non_exhaustive(),
        }
    }
}
