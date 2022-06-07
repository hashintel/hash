// Ensure `_unerased` is only accessed through vtable
#![deny(clippy::used_underscore_binding)]

use alloc::boxed::Box;
use core::{
    any::{Any, TypeId},
    fmt,
    marker::PhantomData,
    mem,
    mem::ManuallyDrop,
    ops::{Deref, DerefMut},
    panic::Location,
    ptr::{addr_of, NonNull},
};

#[cfg(nightly)]
use crate::provider::{self, Demand, Provider};
use crate::Context;

/// Classification of the contents of a [`Frame`], determined by how it was created.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum FrameKind {
    /// Frame was created through [`Report::new()`] or [`change_context()`].
    ///
    /// [`Report::new()`]: crate::Report::new
    /// [`change_context()`]: crate::Report::change_context
    Context,
    /// Frame was created through [`attach()`].
    ///
    /// [`attach()`]: crate::Report::attach
    Attachment,
}

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
    fn from_unerased<T>(
        object: T,
        location: &'static Location<'static>,
        source: Option<Box<Self>>,
        vtable: &'static VTable,
        kind: FrameKind,
    ) -> Self
    where
        T: Context,
    {
        Self {
            // SAFETY: `FrameRepr` must not be dropped without using the vtable, so it's wrapped in
            //   `ManuallyDrop`. A custom drop implementation is provided that takes care of this.
            inner: unsafe { ManuallyDrop::new(FrameRepr::new(object, vtable, kind)) },
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
        Self::from_unerased(
            context,
            location,
            source,
            &VTable {
                object_drop: VTable::object_drop::<C>,
                object_ref: VTable::object_ref::<C>,
                object_downcast: VTable::context_downcast::<C>,
            },
            FrameKind::Context,
        )
    }

    pub(crate) fn from_attachment<A>(
        object: A,
        location: &'static Location<'static>,
        source: Option<Box<Self>>,
    ) -> Self
    where
        A: fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        Self::from_unerased(
            AttachedObject(object),
            location,
            source,
            &VTable {
                object_drop: VTable::object_drop::<AttachedObject<A>>,
                object_ref: VTable::object_ref::<AttachedObject<A>>,
                object_downcast: VTable::attachment_downcast::<A>,
            },
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
            (erased.vtable.object_drop)(erased.into_box());
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

/// Stores a [`Box`] and a [`FrameKind`] by only occupying one pointer in size.
///
/// It's guaranteed that a `TaggedBox` has the same size as `Box`.
pub struct TaggedBox<T>(usize, PhantomData<Box<T>>);

impl<T> TaggedBox<T> {
    /// Mask for the pointer.
    ///
    /// For a given pointer width, this will be
    ///
    ///  - 16 bit: `1111_1111_1111_1110`
    ///  - 32 bit: `1111_1111_1111_1111_1111_1111_1111_1100`
    ///  - 64 bit: `1111_1111_1111_1111_1111_1111_1111_1111_1111_1111_1111_1111_1111_1111_1111_1000`
    ///
    /// so the last bit will *always* be `0`.
    const MASK: usize = !(mem::align_of::<*const T>() - 1);

    /// Creates a new tagged pointer with a `FrameKind`.
    ///
    /// # Panics
    ///
    /// if the tag is too large to be stored next to a pointer.
    pub fn new(frame: T, kind: FrameKind) -> Self {
        // Will only fail on 8-bit platforms which Rust currently does not support
        assert!(
            mem::align_of::<*const T>() >= 2,
            "Tag can't be stored as tagged pointer"
        );
        let raw = Box::into_raw(Box::new(frame));

        let tag = kind == FrameKind::Context;
        // Store the tag in the last bit, due to alignment, this is 0 for 16-bit and higher
        Self(raw as usize | usize::from(tag), PhantomData)
    }

    /// Returns the tag stored inside the pointer
    pub const fn kind(&self) -> FrameKind {
        // We only store the last bit. If it's `1`, it's an context, otherwise it's an attachement
        if self.0 & 1 == 1 {
            FrameKind::Context
        } else {
            FrameKind::Attachment
        }
    }

    /// Returns a pointer to the stored object.
    const fn ptr(&self) -> NonNull<T> {
        let ptr = (self.0 & Self::MASK) as *mut T;

        // SAFETY: Pointer was created from `Box::new`
        unsafe { NonNull::new_unchecked(ptr) }
    }

    /// Casts the box to another type.
    ///
    /// # Safety
    ///
    /// - Same as casting between pointers and dereference them later on
    pub const unsafe fn cast<U>(self) -> TaggedBox<U> {
        TaggedBox(self.0, PhantomData)
    }

    /// Converts the tagged box back to a box.
    pub fn into_box(self) -> Box<T> {
        // SAFETY: Pointer was created from `Box::new`
        unsafe { Box::from_raw(self.ptr().as_ptr()) }
    }
}

impl<T> Deref for TaggedBox<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        // SAFETY: Pointer was created from `Box::new`
        unsafe { self.ptr().as_ref() }
    }
}

impl<T> DerefMut for TaggedBox<T> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        // SAFETY: Pointer was created from `Box::new`
        unsafe { self.ptr().as_mut() }
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
    unsafe fn new(context: C, vtable: &'static VTable, kind: FrameKind) -> TaggedBox<FrameRepr> {
        let unerased_frame = Self {
            vtable,
            _unerased: context,
        };
        let unerased_box = TaggedBox::new(unerased_frame, kind);
        // erase the frame by casting the pointer to `FrameBox<()>`
        unerased_box.cast()
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
    }
}
