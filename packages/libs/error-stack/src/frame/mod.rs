mod attachment;
mod kind;
mod repr;
mod tagged_box;
mod vtable;

use alloc::boxed::Box;
use core::{any::Any, fmt, mem::ManuallyDrop, panic::Location};

pub use self::kind::FrameKind;
use self::{attachment::AttachedObject, repr::FrameRepr, tagged_box::TaggedBox, vtable::VTable};
#[cfg(nightly)]
use crate::provider::{self, Demand, Provider};
use crate::Context;

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
    inner: ManuallyDrop<TaggedBox<FrameRepr>>,
    location: &'static Location<'static>,
    source: Option<Box<Frame>>,
}

impl Frame {
    /// Crates a frame from an unerased object.
    fn from_unerased<C>(
        object: C,
        location: &'static Location<'static>,
        source: Option<Box<Self>>,
        vtable: &'static VTable,
        kind: FrameKind,
    ) -> Self
    where
        C: Context,
    {
        Self {
            // SAFETY: `FrameRepr` must not be dropped without using the vtable, so it's wrapped in
            //   `ManuallyDrop`. A custom drop implementation is provided that takes care of this.
            inner: unsafe { ManuallyDrop::new(FrameRepr::new(object, vtable, kind)) },
            location,
            source,
        }
    }

    /// Crates a frame from a [`Context`].
    pub(crate) fn from_context<C>(
        context: C,
        location: &'static Location<'static>,
        source: Option<Box<Self>>,
    ) -> Self
    where
        C: Context,
    {
        Self::from_unerased(
            context,
            location,
            source,
            VTable::new_context::<C>(),
            FrameKind::Context,
        )
    }

    /// Crates a frame from an attachment.
    pub(crate) fn from_attachment<A>(
        object: A,
        location: &'static Location<'static>,
        source: Option<Box<Self>>,
    ) -> Self
    where
        A: fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        Self::from_unerased(
            AttachedObject::new(object),
            location,
            source,
            VTable::new_attachment::<A>(),
            FrameKind::Attachment,
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

    /// Returns a mutable reference to the source of this `Frame`.
    ///
    /// This corresponds to the `Frame` below this one in a [`Report`].
    ///
    /// [`Report`]: crate::Report
    #[must_use]
    pub fn source_mut(&mut self) -> Option<&mut Self> {
        self.source.as_mut().map(Box::as_mut)
    }

    /// Returns how the `Frame` was created.
    #[must_use]
    pub fn kind(&self) -> FrameKind {
        self.inner.kind()
    }

    /// Requests the reference to `T` from the `Frame` if provided.
    #[must_use]
    #[cfg(nightly)]
    pub fn request_ref<T>(&self) -> Option<&T>
    where
        T: ?Sized + 'static,
    {
        provider::request_ref(self)
    }

    /// Requests the value of `T` from the `Frame` if provided.
    #[must_use]
    #[cfg(nightly)]
    pub fn request_value<T>(&self) -> Option<T>
    where
        T: 'static,
    {
        provider::request_value(self)
    }

    /// Returns if `T` is the held context or attachment by this frame.
    #[must_use]
    pub fn is<T: Any>(&self) -> bool {
        self.downcast_ref::<T>().is_some()
    }

    /// Downcasts this frame if the held context or attachment is the same as `T`.
    #[must_use]
    pub fn downcast_ref<T: Any>(&self) -> Option<&T> {
        self.inner.vtable().downcast_ref(&self.inner)
    }

    /// Downcasts this frame if the held context or attachment is the same as `T`.
    #[must_use]
    pub fn downcast_mut<T: Any>(&mut self) -> Option<&mut T> {
        self.inner.vtable().downcast_mut(&mut self.inner)
    }
}

#[cfg(nightly)]
impl Provider for Frame {
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        self.inner.vtable().unerase(&self.inner).provide(demand);
        demand.provide_value(|| self.location);
        if let Some(source) = &self.source {
            demand.provide_ref::<Self>(source);
        }
    }
}

impl fmt::Debug for Frame {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let field_name = match self.kind() {
            FrameKind::Context => "context",
            FrameKind::Attachment => "attachment",
        };

        fmt.debug_struct("Frame")
            .field(field_name, &self.inner.vtable().unerase(&self.inner))
            .field("location", &self.location)
            .finish()
    }
}

impl fmt::Display for Frame {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(self.inner.vtable().unerase(&self.inner), fmt)
    }
}

impl Drop for Frame {
    fn drop(&mut self) {
        // SAFETY: `inner` is not used after moving out.
        let erased = unsafe { ManuallyDrop::take(&mut self.inner) };

        // Invoke the vtable's drop behavior.
        self.inner.vtable().drop(erased.into_box());
    }
}

#[cfg(test)]
mod tests {
    use core::mem;

    use super::*;
    #[allow(clippy::wildcard_imports)]
    use crate::test_helper::*;
    use crate::Report;

    #[test]
    fn downcast_mut() {
        let mut report = Report::new(ContextA).attach(String::from("Hello"));
        let attachment = report.downcast_mut::<String>().unwrap();
        attachment.push_str(" World!");
        let messages: Vec<_> = report.frames_mut().map(|frame| frame.to_string()).collect();
        assert_eq!(messages, ["Hello World!", "Context A"]);
    }

    #[test]
    fn tagged_box_size() {
        assert_eq!(
            mem::size_of::<TaggedBox<FrameRepr>>(),
            mem::size_of::<Box<FrameRepr>>()
        );
    }

    #[test]
    fn kinds() {
        use FrameKind::{Attachment, Context};

        let report = Report::new(ContextA);
        let report = report.attach("A1");
        let report = report.attach("A2");
        let report = report.change_context(ContextB);
        let report = report.attach("B1");
        let report = report.attach("B2");

        assert_eq!(frame_kinds(&report), [
            Attachment, Attachment, Context, Attachment, Attachment, Context
        ]);
        assert_eq!(messages(&report), [
            "B2",
            "B1",
            "Context B",
            "A2",
            "A1",
            "Context A"
        ]);

        let report = Report::new(ContextA);
        let report = report.change_context(ContextB);

        assert_eq!(frame_kinds(&report), [Context, Context]);
        assert_eq!(messages(&report), ["Context B", "Context A"]);
    }
}
