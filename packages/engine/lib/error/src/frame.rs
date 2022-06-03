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

/// Trait alias to require all required traits used on a [`Frame`].
///
/// In order to implement these traits on a [`Frame`], the underlying type requires these types as
/// well. After creation of the [`Frame`] it's erased. To unerase it later on to act on the actual
/// Frame implementation, this trait is used.
#[cfg(nightly)]
trait Unerased: Provider + fmt::Debug + fmt::Display + Send + Sync + 'static {}
#[cfg(nightly)]
impl<T> Unerased for T where T: Provider + fmt::Debug + fmt::Display + Send + Sync + 'static {}

/// Trait alias to require all required traits used on a [`Frame`].
///
/// In order to implement these traits on a [`Frame`], the underlying type requires these types as
/// well. After creation of the [`Frame`] it's erased. To unerase it later on to act on the actual
/// Frame implementation, this trait is used.
#[cfg(not(nightly))]
trait Unerased: fmt::Debug + fmt::Display + Send + Sync + 'static {}
#[cfg(not(nightly))]
impl<T> Unerased for T where T: fmt::Debug + fmt::Display + Send + Sync + 'static {}

/// A single error, contextual message, or error context inside of a [`Report`].
///
/// `Frame`s are organized as a singly linked list, which can be iterated by calling
/// [`Report::frames()`]. The head is pointing to the most recent context or contextual message,
/// the tail is the root error created by [`Report::from_context()`] or [`Report::from_error()`].
/// The next `Frame` can be accessed by requesting it by calling [`Report::request_ref()`].
///
/// [`Report`]: crate::Report
/// [`Report::frames()`]: crate::Report::frames
/// [`Report::from_error()`]: crate::Report::from_error
/// [`Report::from_context()`]: crate::Report::from_context
/// [`Report::request_ref()`]: crate::Report::request_ref
pub struct Frame {
    inner: ManuallyDrop<Box<FrameRepr>>,
    location: &'static Location<'static>,
    // `pub(crate)` required for `Frames` implementation for non-nightly builds
    pub(crate) source: Option<Box<Frame>>,
}

impl Frame {
    fn from_unerased<T: Unerased>(
        object: T,
        location: &'static Location<'static>,
        source: Option<Box<Self>>,
    ) -> Self {
        Self {
            // SAFETY: `FrameRepr` must not be dropped without using the vtable, so it's wrapped in
            //   `ManuallyDrop`. A custom drop implementation is provided that takes care of this.
            inner: unsafe { ManuallyDrop::new(FrameRepr::new(object)) },
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
        Self::from_unerased(ContextRepr(context), location, source)
    }

    pub(crate) fn from_object<O>(
        object: O,
        location: &'static Location<'static>,
        source: Option<Box<Self>>,
    ) -> Self
    where
        O: fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        Self::from_unerased(FrameObject(object), location, source)
    }

    /// Returns the location where this `Frame` was created.
    #[must_use]
    pub const fn location(&self) -> &'static Location<'static> {
        self.location
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

    /// Returns if `T` is the type held by this frame.
    #[must_use]
    pub fn is<T: Any>(&self) -> bool {
        self.downcast_ref::<T>().is_some()
    }

    /// Downcasts this frame if the held provider object is the same as `T`.
    #[must_use]
    pub fn downcast_ref<T: Any>(&self) -> Option<&T> {
        self.inner.as_ref().downcast().map(|addr| {
            // SAFETY: Dereferencing is safe as T has the same lifetimes as Self
            unsafe { addr.as_ref() }
        })
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
/// This works around the limitation of not being able to coerce from `Box<dyn Unerased>` to
/// `Box<dyn Any>` to add downcasting. Also this works around dynamic dispatching, as the functions
/// are stored and called directly. In addition this reduces the memory usage by one pointer, as the
/// `VTable` is stored next to the object.
struct VTable {
    object_drop: unsafe fn(Box<FrameRepr>),
    object_ref: unsafe fn(&FrameRepr) -> &dyn Unerased,
    object_downcast: unsafe fn(&FrameRepr, target: TypeId) -> Option<NonNull<()>>,
}

/// Wrapper around the contextual information stored in a [`Frame`].
///
/// An information can be requested by calling [`Report::request_ref`]. It's used for the
/// [`Display`] and [`Debug`] implementation for a [`Frame`]. If the information is a [`Provider`],
/// use [`Report::attach_provider`] instead.
struct FrameObject<T>(T);

impl<T: fmt::Display> fmt::Display for FrameObject<T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl<T: fmt::Debug> fmt::Debug for FrameObject<T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

impl<T: Context> Context for FrameObject<T> {}

#[cfg(nightly)]
impl<T: 'static> Provider for FrameObject<T> {
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        demand.provide_ref(&self.0);
    }
}

/// Wrapper around [`Context`].
///
/// As [`Context`] does not necessarily implement [`Provider`] but [`Unerased`] requires it (on
/// nightly), an empty implementation is provided. If a [`Provider`] is required use it directly
/// instead of [`Context`].
#[repr(transparent)]
struct ContextRepr<C>(C);

impl<C: fmt::Display> fmt::Display for ContextRepr<C> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl<C: fmt::Debug> fmt::Debug for ContextRepr<C> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

#[cfg(nightly)]
impl<C: Context> Provider for ContextRepr<C> {
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        self.0.provide(demand);
    }
}

impl VTable {
    /// Drops the `frame`
    ///
    /// # Safety
    ///
    /// - Layout of `*frame` must match `FrameRepr<T>`.
    unsafe fn object_drop<T>(frame: Box<FrameRepr>) {
        // Attach T's native vtable onto the pointer to `self._unerased`
        // Note: This must not use `mem::transmute` because it tries to reborrow the `Unique`
        //   contained in `Box`, which must not be done. In practice this probably won't make any
        //   difference by now, but technically it's unsound.
        //   see: https://github.com/rust-lang/unsafe-code-guidelines/blob/master/wip/stacked-borrows.md
        let unerased = Box::from_raw(Box::into_raw(frame).cast::<FrameRepr<T>>());
        drop(unerased);
    }

    /// Unerase the object as `&dyn Unerased`
    ///
    /// # Safety
    ///
    /// - Layout of `Self` must match `FrameRepr<T>`.
    unsafe fn object_ref<T: Unerased>(frame: &FrameRepr) -> &dyn Unerased {
        // Attach T's native vtable onto the pointer to `self._unerased`
        let unerased = (frame as *const FrameRepr).cast::<FrameRepr<T>>();
        // inside of vtable it's allowed to access `_unerased`
        #[allow(clippy::used_underscore_binding)]
        &(*(unerased))._unerased
    }

    /// Downcasts the object to `target`
    ///
    /// # Safety
    ///
    /// - Layout of `Self` must match `FrameRepr<T>`.
    unsafe fn object_downcast<T: Unerased>(
        frame: &FrameRepr,
        target: TypeId,
    ) -> Option<NonNull<()>> {
        if TypeId::of::<T>() == target {
            // Attach T's native vtable onto the pointer to `self._unerased`
            let unerased = (frame as *const FrameRepr).cast::<FrameRepr<T>>();
            // inside of vtable it's allowed to access `_unerased`
            #[allow(clippy::used_underscore_binding)]
            let addr = addr_of!((*(unerased))._unerased) as *mut ();
            Some(NonNull::new_unchecked(addr))
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

impl<T> FrameRepr<T>
where
    T: Unerased,
{
    /// Creates a new frame from an unerased object.
    ///
    /// # Safety
    ///
    /// Must not be dropped without calling `vtable.object_drop`
    unsafe fn new(object: T) -> Box<FrameRepr> {
        let unerased_frame = Self {
            vtable: &VTable {
                object_drop: VTable::object_drop::<T>,
                object_ref: VTable::object_ref::<T>,
                object_downcast: VTable::object_downcast::<T>,
            },
            _unerased: object,
        };
        let unerased_box = Box::new(unerased_frame);
        // erase the frame by casting the pointer to `FrameBox<()>`
        Box::from_raw(Box::into_raw(unerased_box).cast())
    }
}

#[allow(clippy::used_underscore_binding)]
impl FrameRepr {
    fn unerase(&self) -> &dyn Unerased {
        // SAFETY: Use vtable to attach T's native vtable for the right original type T.
        unsafe { (self.vtable.object_ref)(self) }
    }

    fn downcast<T: Any>(&self) -> Option<NonNull<T>> {
        // TODO: Use tagged pointer to store the frame kind
        //   see https://app.asana.com/0/0/1202366470755781/f
        // SAFETY: Use vtable to attach T's native vtable for the right original type T. Casting
        //   between `T` and `ContextRepr<T>`/`ErrorRepr<T>` is safe as those structs are
        //   `repr(transparent)`.
        unsafe {
            if let Some(addr) = (self.vtable.object_downcast)(self, TypeId::of::<ContextRepr<T>>())
            {
                return Some(addr.cast());
            }

            if let Some(addr) = (self.vtable.object_downcast)(self, TypeId::of::<FrameObject<T>>())
            {
                return Some(addr.cast());
            }

            None
        }
    }
}
