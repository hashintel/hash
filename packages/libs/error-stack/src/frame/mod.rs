mod attachment;
mod erasable;
mod kind;
mod vtable;

use alloc::boxed::Box;
#[cfg(nightly)]
use core::any::{self, Demand, Provider};
use core::{fmt, mem, mem::ManuallyDrop, panic::Location, ptr::NonNull};

pub use self::kind::{AttachmentKind, FrameKind};
use self::{erasable::ErasableFrame, vtable::VTable};
use crate::{frame::attachment::AttachmentProvider, Context};

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
    erased_frame: ManuallyDrop<Box<ErasableFrame>>,
    location: &'static Location<'static>,
    source: Box<[Frame]>,
}

impl Frame {
    /// Crates a frame from an unerased object.
    fn from_unerased<T>(
        object: T,
        location: &'static Location<'static>,
        source: Box<[Frame]>,
        vtable: &'static VTable,
    ) -> Self {
        Self {
            // SAFETY: `ErasableFrame` must not be dropped without using the vtable, so it's wrapped
            //   in `ManuallyDrop`. A custom drop implementation is provided to takes care of this.
            erased_frame: unsafe { ManuallyDrop::new(ErasableFrame::new(object, vtable)) },
            location,
            source,
        }
    }

    /// Crates a frame from a [`Context`].
    pub(crate) fn from_context<C>(
        context: C,
        location: &'static Location<'static>,
        source: Box<[Frame]>,
    ) -> Self
    where
        C: Context,
    {
        Self::from_unerased(context, location, source, VTable::new_context::<C>())
    }

    /// Crates a frame from an attachment.
    pub(crate) fn from_attachment<A>(
        attachment: A,
        location: &'static Location<'static>,
        source: Box<[Frame]>,
    ) -> Self
    where
        A: Send + Sync + 'static,
    {
        Self::from_unerased(
            AttachmentProvider::new(attachment),
            location,
            source,
            VTable::new_attachment::<A>(),
        )
    }

    /// Crates a frame from an attachment which implements [`Debug`] and [`Display`].
    ///
    /// [`Debug`]: core::fmt::Debug
    /// [`Display`]: core::fmt::Display
    pub(crate) fn from_printable_attachment<A>(
        attachment: A,
        location: &'static Location<'static>,
        source: Box<[Frame]>,
    ) -> Self
    where
        A: fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        Self::from_unerased(
            AttachmentProvider::new(attachment),
            location,
            source,
            VTable::new_printable_attachment::<A>(),
        )
    }

    /// Returns the location where this `Frame` was created.
    #[must_use]
    pub const fn location(&self) -> &'static Location<'static> {
        self.location
    }

    /// Returns a shared reference to the source of this `Frame`.
    ///
    /// This corresponds to the `Frame` below this one in a [`Report`].
    ///
    /// [`Report`]: crate::Report
    #[must_use]
    pub const fn source(&self) -> Option<&Self> {
        // TODO: Change to `self.source.as_ref().map(Box::as_ref)` when this is possible in a const
        //   function. On stable toolchain, clippy is not smart enough yet.
        #[cfg_attr(not(nightly), allow(clippy::needless_match))]
        match &self.source {
            Some(source) => Some(source),
            None => None,
        }
    }

    /// Returns a mutable reference to the sources of this `Frame`.
    ///
    /// This corresponds to the `Frame` below this one in a [`Report`].
    ///
    /// [`Report`]: crate::Report
    #[must_use]
    pub fn sources_mut(&mut self) -> &mut [Frame] {
        self.source.as_mut()
    }

    /// Returns how the `Frame` was created.
    #[must_use]
    pub fn kind(&self) -> FrameKind<'_> {
        self.erased_frame.vtable().unerase(&self.erased_frame)
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
        self.erased_frame.vtable().downcast_ref(&self.erased_frame)
    }

    /// Downcasts this frame if the held context or attachment is the same as `T`.
    #[must_use]
    pub fn downcast_mut<T: Send + Sync + 'static>(&mut self) -> Option<&mut T> {
        self.erased_frame
            .vtable()
            .downcast_mut(&mut self.erased_frame)
    }
}

#[cfg(nightly)]
impl Provider for Frame {
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        self.erased_frame
            .vtable()
            .provide(&self.erased_frame, demand);
        demand.provide_value(|| self.location);
        if let Some(source) = &self.source {
            demand.provide_ref::<Self>(source);
        }
    }
}

impl fmt::Debug for Frame {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut debug = fmt.debug_struct("Frame");
        debug.field("location", &self.location);
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

impl Drop for Frame {
    fn drop(&mut self) {
        // SAFETY: `inner` is not used after moving out.
        let erased = unsafe { ManuallyDrop::take(&mut self.erased_frame) };

        // Avoid aliasing by forgetting the `Box`
        let ptr = NonNull::from(&*erased);
        mem::forget(erased);
        self.erased_frame.vtable().drop(ptr);
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
