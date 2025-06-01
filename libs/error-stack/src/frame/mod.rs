mod frame_impl;
mod kind;

use alloc::boxed::Box;
#[cfg(nightly)]
use core::error;
use core::{any::TypeId, error::Error, fmt};

use frame_impl::{AttachmentFrame, ContextFrame, PrintableAttachmentFrame};

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
    sources: Box<[Frame]>,
}

impl Frame {
    /// Returns a shared reference to the source of this `Frame`.
    ///
    /// This corresponds to the `Frame` below this one in a [`Report`].
    ///
    /// [`Report`]: crate::Report
    #[must_use]
    pub const fn sources(&self) -> &[Self] {
        &self.sources
    }

    /// Returns a mutable reference to the sources of this `Frame`.
    ///
    /// This corresponds to the `Frame` below this one in a [`Report`].
    ///
    /// [`Report`]: crate::Report
    #[must_use]
    pub fn sources_mut(&mut self) -> &mut [Self] {
        &mut self.sources
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
        self.frame.as_any().is::<T>()
    }

    /// Downcasts this frame if the held context or attachment is the same as `T`.
    #[must_use]
    pub fn downcast_ref<T: Send + Sync + 'static>(&self) -> Option<&T> {
        self.frame.as_any().downcast_ref()
    }

    /// Downcasts this frame if the held context or attachment is the same as `T`.
    #[must_use]
    pub fn downcast_mut<T: Send + Sync + 'static>(&mut self) -> Option<&mut T> {
        self.frame.as_any_mut().downcast_mut()
    }

    /// TODO docs
    ///
    /// `replace_with_printable`: if true, `Debug` and `Display` implementations will be eagerly
    ///     evaluated can be set to false when the `Report` will no longer be used,
    ///     to avoid the cost of formatting
    #[must_use]
    pub(crate) fn downcast_take<T: Send + Sync + 'static>(
        &mut self,
        replace_with_printable: bool,
    ) -> Option<Box<T>> {
        self.is::<T>().then(|| {
            struct PrintableReplacementFrame {
                display: String,
                debug: String,
            }

            impl core::fmt::Display for PrintableReplacementFrame {
                fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
                    self.display.fmt(fmt)
                }
            }

            impl core::fmt::Debug for PrintableReplacementFrame {
                fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
                    self.debug.fmt(fmt)
                }
            }

            impl Error for PrintableReplacementFrame {}

            // Take the frame,
            // but replace it with something that will format like the original type would:
            let replacement_frame = if replace_with_printable {
                match self.frame.kind() {
                    FrameKind::Context(context) => {
                        Box::new(ContextFrame::new(PrintableReplacementFrame {
                            display: format!("{context}"),
                            debug: format!("{context:?}"),
                        })) as Box<dyn FrameImpl>
                    }
                    FrameKind::Attachment(attachment_kind) => match attachment_kind {
                        AttachmentKind::Opaque(_attachment) => {
                            Box::new(AttachmentFrame::new(())) as Box<dyn FrameImpl>
                        }
                        AttachmentKind::Printable(attachment) => {
                            Box::new(PrintableAttachmentFrame::new(PrintableReplacementFrame {
                                display: format!("{attachment}"),
                                debug: format!("{attachment:?}"),
                            })) as Box<dyn FrameImpl>
                        }
                    },
                }
            } else {
                Box::new(AttachmentFrame::new(())) as Box<dyn FrameImpl>
            };

            core::mem::replace(&mut self.frame, replacement_frame)
                .into_any()
                .downcast::<T>()
                .expect(
                    "Any::downcast::<T> failed despite self.is::<T>() returning true. \
                    This is considered a bug and should be \
                    reported to https://github.com/hashintel/hash/issues/new/choose"
                )
        })
    }

    /// Returns the [`TypeId`] of the held context or attachment by this frame.
    #[must_use]
    pub fn type_id(&self) -> TypeId {
        self.frame.as_any().type_id()
    }

    pub(crate) fn as_error(&self) -> &impl Error {
        &self.frame
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
