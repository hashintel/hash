mod frame_impl;
mod kind;

use alloc::boxed::Box;
#[cfg(nightly)]
use core::any::{self, Demand, Provider};
use core::{any::TypeId, fmt, panic::Location};

use self::frame_impl::FrameImpl;
pub use self::kind::{AttachmentKind, FrameKind};

/// A single context or attachment inside of a [`Report`].
///
/// `Frame`s are organized as a singly linked list, which can be iterated by calling
/// [`Report::frames()`]. The head contains the current context or attachment, and the tail contains
/// the root context created by [`Report::new()`]. The next `Frame` can be accessed by requesting it
/// by calling [`Report::request_ref()`].
///
/// [`Report`]: crate::Report
/// [`Report::frames()`]: crate::Report::frames
/// [`Report::new()`]: crate::Report::new
/// [`Report::request_ref()`]: crate::Report::request_ref
pub struct Frame {
    frame: Box<dyn FrameImpl>,
}

impl Frame {
    /// Returns the location where this `Frame` was created.
    #[must_use]
    pub fn location(&self) -> &'static Location<'static> {
        self.frame.location()
    }

    #[allow(missing_docs)]
    #[must_use]
    #[deprecated = "use `sources()` instead"]
    pub fn source(&self) -> Option<&Self> {
        self.frame.sources().first()
    }

    /// Returns a shared reference to the source of this `Frame`.
    ///
    /// This corresponds to the `Frame` below this one in a [`Report`].
    ///
    /// [`Report`]: crate::Report
    #[must_use]
    pub fn sources(&self) -> &[Self] {
        self.frame.sources()
    }

    #[allow(missing_docs)]
    #[must_use]
    #[deprecated = "use `sources_mut()` instead"]
    pub fn source_mut(&mut self) -> Option<&mut Self> {
        self.frame.sources_mut().first_mut()
    }

    /// Returns a mutable reference to the sources of this `Frame`.
    ///
    /// This corresponds to the `Frame` below this one in a [`Report`].
    ///
    /// [`Report`]: crate::Report
    #[must_use]
    pub fn sources_mut(&mut self) -> &mut [Self] {
        self.frame.sources_mut()
    }

    /// Returns how the `Frame` was created.
    #[must_use]
    pub fn kind(&self) -> FrameKind<'_> {
        self.frame.kind()
    }

    /// Requests the reference to `T` from the `Frame` if provided.
    #[must_use]
    #[cfg(nightly)]
    pub fn request_ref<T>(&self) -> Option<&T>
    where
        T: ?Sized + 'static,
    {
        any::request_ref(self)
    }

    /// Requests the value of `T` from the `Frame` if provided.
    #[must_use]
    #[cfg(nightly)]
    pub fn request_value<T>(&self) -> Option<T>
    where
        T: 'static,
    {
        any::request_value(self)
    }

    /// Returns if `T` is the held context or attachment by this frame.
    #[must_use]
    pub fn is<T: Send + Sync + 'static>(&self) -> bool {
        self.downcast_ref::<T>().is_some()
    }

    /// Downcasts this frame if the held context or attachment is the same as `T`.
    #[must_use]
    pub fn downcast_ref<T: Send + Sync + 'static>(&self) -> Option<&T> {
        (TypeId::of::<T>() == Self::type_id(self)).then(|| {
            // SAFETY: just checked whether we are pointing to the correct type, and we can rely on
            // that check for memory safety because we have implemented `FrameImpl` for all types;
            // no other impls can exist as they would conflict with our impl.
            unsafe { &*(self.frame.as_ref() as *const dyn FrameImpl).cast::<T>() }
        })
    }

    /// Downcasts this frame if the held context or attachment is the same as `T`.
    #[must_use]
    pub fn downcast_mut<T: Send + Sync + 'static>(&mut self) -> Option<&mut T> {
        (TypeId::of::<T>() == Self::type_id(self)).then(|| {
            // SAFETY: just checked whether we are pointing to the correct type, and we can rely on
            // that check for memory safety because we have implemented `FrameImpl` for all types;
            // no other impls can exist as they would conflict with our impl.
            unsafe { &mut *(self.frame.as_mut() as *mut dyn FrameImpl).cast::<T>() }
        })
    }

    /// Return the `TypeId` of the held context or attachment.
    pub(crate) fn type_id(&self) -> TypeId {
        FrameImpl::type_id(&*self.frame)
    }
}

#[cfg(nightly)]
impl Provider for Frame {
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        self.frame.provide(demand);
    }
}

impl fmt::Debug for Frame {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut debug = fmt.debug_struct("Frame");
        debug.field("location", self.location());
        match self.kind() {
            FrameKind::Context(context) => {
                debug.field("context", &context);
            }
            FrameKind::Attachment(AttachmentKind::Printable(attachment)) => {
                debug.field("attachment", &attachment);
            }
            FrameKind::Attachment(AttachmentKind::Opaque(_)) => {
                debug.field("attachment", &"Opaque");
            }
        }
        debug.finish()
    }
}
