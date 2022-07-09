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

    /// Returns a shared reference to the source of this `Frame`.
    ///
    /// This corresponds to the `Frame` below this one in a [`Report`].
    ///
    /// [`Report`]: crate::Report
    #[must_use]
    pub fn source(&self) -> Option<&Self> {
        self.frame.source()
    }

    /// Returns a mutable reference to the source of this `Frame`.
    ///
    /// This corresponds to the `Frame` below this one in a [`Report`].
    ///
    /// [`Report`]: crate::Report
    #[must_use]
    pub fn source_mut(&mut self) -> Option<&mut Self> {
        self.frame.source_mut()
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
        (TypeId::of::<T>() == FrameImpl::type_id(&*self.frame)).then(|| {
            // SAFETY: just checked whether we are pointing to the correct type, and we can rely on
            // that check for memory safety because we have implemented `FrameImpl` for all types;
            // no other impls can exist as they would conflict with our impl.
            unsafe { &*(self.frame.as_ref() as *const dyn FrameImpl).cast::<T>() }
        })
    }

    /// Downcasts this frame if the held context or attachment is the same as `T`.
    #[must_use]
    pub fn downcast_mut<T: Send + Sync + 'static>(&mut self) -> Option<&mut T> {
        (TypeId::of::<T>() == FrameImpl::type_id(&*self.frame)).then(|| {
            // SAFETY: just checked whether we are pointing to the correct type, and we can rely on
            // that check for memory safety because we have implemented `FrameImpl` for all types;
            // no other impls can exist as they would conflict with our impl.
            unsafe { &mut *(self.frame.as_mut() as *mut dyn FrameImpl).cast::<T>() }
        })
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

#[cfg(test)]
mod tests {
    use super::*;
    #[allow(clippy::wildcard_imports)]
    use crate::test_helper::*;
    use crate::Report;

    #[test]
    fn downcast_ref() {
        struct Attached;
        let report = Report::new(ContextA)
            .attach_printable(String::from("Hello"))
            .attach(Attached);

        let attachment = report.downcast_ref::<String>().unwrap();
        assert!(report.contains::<ContextA>());
        assert_eq!(attachment, "Hello");
        assert!(report.contains::<Attached>());
    }

    #[test]
    fn downcast_mut() {
        let mut report = Report::new(ContextA).attach_printable(String::from("Hello"));

        let attachment = report.downcast_mut::<String>().unwrap();
        attachment.push_str(" World!");
        let messages: Vec<_> = report
            .frames_mut()
            .filter_map(|frame| match frame.kind() {
                FrameKind::Context(context) => Some(context.to_string()),
                FrameKind::Attachment(AttachmentKind::Printable(attachment)) => {
                    Some(attachment.to_string())
                }
                FrameKind::Attachment(AttachmentKind::Opaque(_)) => None,
            })
            .collect();
        assert_eq!(messages, ["Hello World!", "Context A"]);
    }

    #[test]
    fn kinds() {
        let report = Report::new(ContextA);
        let report = report.attach_printable("A1");
        let report = report.attach_printable("A2");
        let report = report.change_context(ContextB);
        let report = report.attach("B1");
        let report = report.attach_printable("B2");

        let kinds_a = frame_kinds(&report);
        assert!(matches!(
            kinds_a[0],
            FrameKind::Attachment(AttachmentKind::Printable(_))
        ));
        assert!(matches!(
            kinds_a[1],
            FrameKind::Attachment(AttachmentKind::Opaque(_))
        ));
        assert!(matches!(kinds_a[2], FrameKind::Context(_)));
        assert!(matches!(
            kinds_a[3],
            FrameKind::Attachment(AttachmentKind::Printable(_))
        ));
        assert!(matches!(
            kinds_a[4],
            FrameKind::Attachment(AttachmentKind::Printable(_))
        ));
        assert!(matches!(kinds_a[5], FrameKind::Context(_)));

        assert_eq!(messages(&report), [
            "B2",
            "Opaque",
            "Context B",
            "A2",
            "A1",
            "Context A"
        ]);

        let report = Report::new(ContextA);
        let report = report.change_context(ContextB);

        let kinds_b = frame_kinds(&report);
        assert!(matches!(kinds_b[0], FrameKind::Context(_)));
        assert!(matches!(kinds_b[1], FrameKind::Context(_)));
        assert_eq!(messages(&report), ["Context B", "Context A"]);
    }
}
