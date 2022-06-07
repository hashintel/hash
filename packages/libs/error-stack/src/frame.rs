// Ensure `_unerased` is only accessed through vtable
#![deny(clippy::used_underscore_binding)]

use alloc::boxed::Box;
use core::{
    any::{Any, TypeId},
    fmt,
    mem::ManuallyDrop,
    panic::Location,
    ptr::{addr_of, NonNull},
};

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
    inner: ManuallyDrop<Box<FrameRepr>>,
    location: &'static Location<'static>,
    source: Option<Box<Frame>>,
}

impl Frame {
    fn from_unerased<T>(
        object: T,
        location: &'static Location<'static>,
        source: Option<Box<Self>>,
        vtable: &'static VTable,
    ) -> Self
    where
        T: Context,
    {
        Self {
            // SAFETY: `FrameRepr` must not be dropped without using the vtable, so it's wrapped in
            //   `ManuallyDrop`. A custom drop implementation is provided that takes care of this.
            inner: unsafe { ManuallyDrop::new(FrameRepr::new(object, vtable)) },
            location,
            source,
        }
    }

    pub(crate) fn from_context<C>(
        context: C,
        location: &'static Location<'static>,
        source: Option<Box<Self>>,
    ) -> Self
    where
        C: Context,
    {
        Self::from_unerased(context, location, source, &VTable {
            object_drop: VTable::object_drop::<C>,
            object_ref: VTable::object_ref::<C>,
            object_downcast: VTable::context_downcast::<C>,
        })
    }

    pub(crate) fn from_attachment<A>(
        object: A,
        location: &'static Location<'static>,
        source: Option<Box<Self>>,
    ) -> Self
    where
        A: fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        Self::from_unerased(AttachedObject(object), location, source, &VTable {
            object_drop: VTable::object_drop::<AttachedObject<A>>,
            object_ref: VTable::object_ref::<AttachedObject<A>>,
            object_downcast: VTable::attachment_downcast::<A>,
        })
    }

    /// Returns the location where this `Frame` was created.
    #[must_use]
    pub const fn location(&self) -> &'static Location<'static> {
        self.location
    }

    /// Returns a shared reference to the source of this `Frame`.
    ///
    /// This corresponds to the `Frame` below this one in a [`Report`].
    #[must_use]
    pub const fn source(&self) -> Option<&Self> {
        match &self.source {
            Some(source) => Some(source),
            None => None,
        }
    }

    /// Returns a mutable reference to the source of this `Frame`.
    ///
    /// This corresponds to the `Frame` below this one in a [`Report`].
    #[must_use]
    pub fn source_mut(&mut self) -> Option<&mut Self> {
        match &mut self.source {
            Some(source) => Some(source),
            None => None,
        }
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
        self.inner.downcast_ref()
    }

    /// Downcasts this frame if the held context or attachment is the same as `T`.
    #[must_use]
    pub fn downcast_mut<T: Any>(&mut self) -> Option<&mut T> {
        self.inner.downcast_mut()
    }
}

#[cfg(nightly)]
impl Provider for Frame {
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        self.inner.unerase().provide(demand);
        demand.provide_value(|| self.location);
        if let Some(source) = &self.source {
            demand.provide_ref::<Self>(source);
        }
    }
}

impl fmt::Debug for Frame {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        // TODO: Change output depending on FrameKind
        fmt.debug_struct("Frame")
            .field("object", &self.inner.unerase())
            .field("location", &self.location)
            .finish()
    }
}

impl fmt::Display for Frame {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(self.inner.unerase(), fmt)
    }
}

impl Drop for Frame {
    fn drop(&mut self) {
        // SAFETY: `inner` is not used after moving out.
        let erased = unsafe { ManuallyDrop::take(&mut self.inner) };

        // SAFETY: Use vtable to attach T's native vtable for the right original type T.
        unsafe {
            // Invoke the vtable's drop behavior.
            (erased.vtable.object_drop)(erased);
        }
    }
}

/// Stores functions to act on the underlying [`Frame`] type without knowing the unerased type.
///
/// This works around the limitation of not being able to coerce from `Box<dyn Context>` to
/// `Box<dyn Any>` to add downcasting. Also this works around dynamic dispatching, as the functions
/// are stored and called directly. In addition this reduces the memory usage by one pointer, as the
/// `VTable` is stored next to the object.
struct VTable {
    object_drop: unsafe fn(Box<FrameRepr>),
    object_ref: unsafe fn(&FrameRepr) -> &dyn Context,
    object_downcast: unsafe fn(&FrameRepr, target: TypeId) -> Option<NonNull<()>>,
}

/// Wrapper around an attachment to unify the interface for a [`Frame`].
///
/// A piece of information can be requested by calling [`Report::request_ref()`]. It's used for the
/// [`Display`] and [`Debug`] implementation for a [`Frame`].
///
/// [`Report::request_ref()`]: crate::Report::request_ref
/// [`Display`]: core::fmt::Display
/// [`Debug`]: core::fmt::Debug
struct AttachedObject<T>(T);

impl<T: fmt::Display> fmt::Display for AttachedObject<T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl<T: fmt::Debug> fmt::Debug for AttachedObject<T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

impl<T: fmt::Display + fmt::Debug + Send + Sync + 'static> Context for AttachedObject<T> {
    #[cfg(nightly)]
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        demand.provide_ref(&self.0);
    }
}

impl VTable {
    /// Drops the `frame`.
    ///
    /// # Safety
    ///
    /// - Layout of `*frame` must match `FrameRepr<T>`.
    unsafe fn object_drop<C: Context>(frame: Box<FrameRepr>) {
        // Attach T's native vtable onto the pointer to `self._unerased`
        // Note: This must not use `mem::transmute` because it tries to reborrow the `Unique`
        //   contained in `Box`, which must not be done. In practice this probably won't make any
        //   difference by now, but technically it's unsound.
        //   see: https://github.com/rust-lang/unsafe-code-guidelines/blob/master/wip/stacked-borrows.md
        let unerased = Box::from_raw(Box::into_raw(frame).cast::<FrameRepr<C>>());
        drop(unerased);
    }

    /// Unerase the object as `&dyn Context`.
    ///
    /// # Safety
    ///
    /// - Layout of `frame` must match `FrameRepr<T>`.
    unsafe fn object_ref<C: Context>(frame: &FrameRepr) -> &dyn Context {
        // Attach T's native vtable onto the pointer to `self._unerased`
        let unerased = (frame as *const FrameRepr).cast::<FrameRepr<C>>();
        // inside of vtable it's allowed to access `_unerased`
        #[allow(clippy::used_underscore_binding)]
        &(*(unerased))._unerased
    }

    /// Downcasts the context to `C`.
    ///
    /// # Safety
    ///
    /// - Layout of `frame` must match `FrameRepr<C>`.
    const unsafe fn object_downcast_unchecked<C: Context>(frame: &FrameRepr) -> NonNull<()> {
        // Attach T's native vtable onto the pointer to `self._unerased`
        let unerased: *const FrameRepr<C> = (frame as *const FrameRepr).cast();
        // inside of vtable it's allowed to access `_unerased`
        #[allow(clippy::used_underscore_binding)]
        let addr = addr_of!((*(unerased))._unerased) as *mut ();
        NonNull::new_unchecked(addr)
    }

    /// Downcasts the context to `target`.
    ///
    /// # Safety
    ///
    /// - Layout of `frame` must match `FrameRepr<C>`.
    unsafe fn context_downcast<C: Context>(
        frame: &FrameRepr,
        target: TypeId,
    ) -> Option<NonNull<()>> {
        if TypeId::of::<C>() == target {
            Some(Self::object_downcast_unchecked::<C>(frame))
        } else {
            None
        }
    }

    /// Downcasts the attachment to `target`.
    ///
    /// # Safety
    ///
    /// - Layout of `frame` must match `FrameRepr<AttachedObject<A>>`.
    unsafe fn attachment_downcast<A: fmt::Display + fmt::Debug + Send + Sync + 'static>(
        frame: &FrameRepr,
        target: TypeId,
    ) -> Option<NonNull<()>> {
        if TypeId::of::<A>() == target {
            Some(Self::object_downcast_unchecked::<AttachedObject<A>>(frame))
        } else {
            None
        }
    }
}

// repr(C): It must be ensured, that vtable is always stored at the same memory position when
// casting between `FrameRepr<T>` and `FrameRepr<()>`.
#[repr(C)]
struct FrameRepr<T = ()> {
    vtable: &'static VTable,
    // As we cast between `FrameRepr<T>` and `FrameRepr<()>`, `_unerased` must not be used
    // directly, only through `vtable`
    _unerased: T,
}

impl<C> FrameRepr<C>
where
    C: Context,
{
    /// Creates a new [`Frame`] from an unerased [`Context`] object.
    ///
    /// # Safety
    ///
    /// Must not be dropped without calling `vtable.object_drop`
    unsafe fn new(context: C, vtable: &'static VTable) -> Box<FrameRepr> {
        let unerased_frame = Self {
            vtable,
            _unerased: context,
        };
        let unerased_box = Box::new(unerased_frame);
        // erase the frame by casting the pointer to `FrameBox<()>`
        Box::from_raw(Box::into_raw(unerased_box).cast())
    }
}

#[allow(clippy::used_underscore_binding)]
impl FrameRepr {
    fn unerase(&self) -> &dyn Context {
        // SAFETY: Use vtable to attach T's native vtable for the right original type T.
        unsafe { (self.vtable.object_ref)(self) }
    }

    fn downcast_ref<T: Any>(&self) -> Option<&T> {
        // SAFETY: Use vtable to attach T's native vtable for the right original type T.
        unsafe {
            (self.vtable.object_downcast)(self, TypeId::of::<T>()).map(|ptr| ptr.cast().as_ref())
        }
    }

    fn downcast_mut<T: Any>(&mut self) -> Option<&mut T> {
        // SAFETY: Use vtable to attach T's native vtable for the right original type T.
        unsafe {
            (self.vtable.object_downcast)(self, TypeId::of::<T>()).map(|ptr| ptr.cast().as_mut())
        }
    }
}

#[cfg(test)]
mod tests {
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
}
