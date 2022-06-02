// Ensure `_context` is only accessed through vtable
#![deny(clippy::used_underscore_binding)]

use alloc::boxed::Box;
use core::{
    any::{Any, TypeId},
    fmt,
    fmt::Formatter,
    mem::ManuallyDrop,
    panic::Location,
    ptr::{addr_of, NonNull},
};
#[cfg(feature = "std")]
use std::error::Error;

use crate::{
    provider::{self, Demand, Provider},
    Context, Message,
};

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
    source: Option<Box<Frame>>,
}

impl Frame {
    pub(crate) fn from_context<C>(
        context: C,
        location: &'static Location<'static>,
        source: Option<Box<Self>>,
    ) -> Self
    where
        C: Context,
    {
        Self {
            // SAFETY: `inner` is wrapped in `ManuallyDrop`
            inner: unsafe { ManuallyDrop::new(FrameRepr::new(context)) },
            location,
            source,
        }
    }

    pub(crate) fn from_message<M>(
        message: M,
        location: &'static Location<'static>,
        source: Option<Box<Self>>,
    ) -> Self
    where
        M: Message,
    {
        Self {
            // SAFETY: `inner` is wrapped in `ManuallyDrop`
            inner: unsafe { ManuallyDrop::new(FrameRepr::new(MessageRepr(message))) },
            location,
            source,
        }
    }

    #[cfg(feature = "std")]
    pub(crate) fn from_std<E>(
        error: E,
        location: &'static Location<'static>,
        source: Option<Box<Self>>,
    ) -> Self
    where
        E: Error + Send + Sync + 'static,
    {
        Self {
            // SAFETY: `inner` is wrapped in `ManuallyDrop`
            inner: unsafe { ManuallyDrop::new(FrameRepr::new(ErrorRepr(error))) },
            location,
            source,
        }
    }

    /// Returns the location where this `Frame` was created.
    #[must_use]
    pub const fn location(&self) -> &'static Location<'static> {
        self.location
    }

    /// Requests the reference to `T` from the `Frame` if provided.
    #[must_use]
    pub fn request_ref<T>(&self) -> Option<&T>
    where
        T: ?Sized + 'static,
    {
        provider::request_ref(self)
    }

    /// Requests the value of `T` from the `Frame` if provided.
    #[must_use]
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
        #[cfg_attr(not(feature = "std"), allow(clippy::let_and_return))]
        let downcasted = self.inner.downcast().map(|addr| {
            // SAFETY: Dereferencing is safe as T has the same lifetimes as Self
            unsafe { addr.as_ref() }
        });

        #[cfg(feature = "std")]
        let downcasted = downcasted.or_else(|| {
            // Fallback for `T: Error` as `Error` is wrapped inside of `ErrorRepr`
            // TODO: Remove fallback when `Provider` is implemented for `Error` upstream
            self.inner.downcast::<ErrorRepr<T>>().map(|addr| {
                // SAFETY: Dereferencing is safe as T has the same lifetimes as Self and casting
                //   `ErrorRepr<T>` to `T` is safe as `ErrorRepr` is `#[repr(transparent)]`
                unsafe { addr.cast().as_ref() }
            })
        });

        downcasted
    }
}

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
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("Frame")
            .field("context", &self.inner.unerase())
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

        // SAFETY: Use vtable to attach C's native vtable for the right original type C.
        unsafe {
            // Invoke the vtable's drop behavior.
            (erased.vtable.object_drop)(erased);
        }
    }
}

/// Stores functions to act on the associated context without knowing the internal type.
///
/// This works around the limitation of not being able to coerce from `Box<dyn Context>` to
/// `Box<dyn Any>` to add downcasting. Also this works around dynamic dispatching, as the functions
/// are stored and called directly.
struct VTable {
    object_drop: unsafe fn(Box<FrameRepr>),
    object_ref: unsafe fn(&FrameRepr) -> &dyn Context,
    object_downcast: unsafe fn(&FrameRepr, target: TypeId) -> Option<NonNull<()>>,
}

/// Wrapper around [`Message`].
///
/// As [`Message`] does not necessarily implement [`Provider`], an empty implementation is provided.
/// If a [`Provider`] is required use it directly instead of [`Message`].
struct MessageRepr<M: Message>(M);

impl<C: Message> fmt::Display for MessageRepr<C> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl<C: Message> fmt::Debug for MessageRepr<C> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

impl<C: Message> Provider for MessageRepr<C> {
    fn provide<'a>(&'a self, _: &mut Demand<'a>) {
        // Empty definition as `Message` does not convey provider information
    }
}

/// Wrapper around [`Error`].
///
/// As [`Error`] does not necessarily implement [`Provider`], an implementation is provided. As soon
/// as [`Provider`] is implemented on [`Error`], this struct will be removed and used directly
/// instead.
#[cfg(feature = "std")]
#[repr(transparent)]
struct ErrorRepr<E>(E);

#[cfg(feature = "std")]
impl<E: Error> fmt::Display for ErrorRepr<E> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

#[cfg(feature = "std")]
impl<E: Error> fmt::Debug for ErrorRepr<E> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

#[cfg(feature = "std")]
impl<E: Error> Provider for ErrorRepr<E> {
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        #[cfg(all(nightly, feature = "std"))]
        if let Some(backtrace) = self.0.backtrace() {
            demand.provide_ref(backtrace);
        }
    }
}

impl VTable {
    /// Drops the `frame`
    ///
    /// # Safety
    ///
    /// - Layout of `*frame` must match `FrameRepr<C>`.
    unsafe fn object_drop<C>(frame: Box<FrameRepr>) {
        // Attach C's native vtable onto the pointer to `self._context`
        // Note: This must not use `mem::transmute` because it tries to reborrow the `Unique`
        //   contained in `Box`, which must not be done. In practice this probably won't make any
        //   difference by now, but technically it's unsound.
        //   see: https://github.com/rust-lang/unsafe-code-guidelines/blob/master/wip/stacked-borrows.md
        let unerased = Box::from_raw(Box::into_raw(frame).cast::<FrameRepr<C>>());
        drop(unerased);
    }

    /// Unerase the context as `&dyn Context`
    ///
    /// # Safety
    ///
    /// - Layout of `Self` must match `FrameRepr<C>`.
    unsafe fn object_ref<C: Context>(frame: &FrameRepr) -> &dyn Context {
        // Attach C's native vtable onto the pointer to `self._context`
        let unerased = (frame as *const FrameRepr).cast::<FrameRepr<C>>();
        // inside of vtable it's allowed to access `_context`
        #[allow(clippy::used_underscore_binding)]
        &(*(unerased))._context
    }

    /// Downcasts the context to `target`
    ///
    /// # Safety
    ///
    /// - Layout of `Self` must match `FrameRepr<C>`.
    unsafe fn object_downcast<C: Context>(
        frame: &FrameRepr,
        target: TypeId,
    ) -> Option<NonNull<()>> {
        if TypeId::of::<C>() == target {
            // Attach C's native vtable onto the pointer to `self._context`
            let unerased = (frame as *const FrameRepr).cast::<FrameRepr<C>>();
            // inside of vtable it's allowed to access `_context`
            #[allow(clippy::used_underscore_binding)]
            let addr = addr_of!((*(unerased))._context) as *mut ();
            Some(NonNull::new_unchecked(addr))
        } else {
            None
        }
    }
}

// repr(C): It must be ensured, that vtable is always stored at the same memory position when
// casting between `FrameRepr<C>` and `FrameRepr<()>`.
#[repr(C)]
struct FrameRepr<C = ()> {
    vtable: &'static VTable,
    // As we cast between `FrameRepr<C>` and `FrameRepr<()>`, `_context` must not be used directly,
    // only through `vtable`
    _context: C,
}

impl<C> FrameRepr<C>
where
    C: Context,
{
    /// Creates a new frame from a context
    ///
    /// # Safety
    ///
    /// Must not be dropped without calling `vtable.object_drop`
    unsafe fn new(context: C) -> Box<FrameRepr> {
        let unerased_frame = Self {
            vtable: &VTable {
                object_drop: VTable::object_drop::<C>,
                object_ref: VTable::object_ref::<C>,
                object_downcast: VTable::object_downcast::<C>,
            },
            _context: context,
        };
        let unerased_box = Box::new(unerased_frame);
        // erase the frame by casting the pointer to `FrameBox<()>`
        Box::from_raw(Box::into_raw(unerased_box).cast())
    }
}

#[allow(clippy::used_underscore_binding)]
impl FrameRepr {
    fn unerase(&self) -> &dyn Context {
        // SAFETY: Use vtable to attach C's native vtable for the right original type C.
        unsafe { (self.vtable.object_ref)(self) }
    }

    fn downcast<C: Any>(&self) -> Option<NonNull<C>> {
        let target = TypeId::of::<C>();
        // SAFETY: Use vtable to attach C's native vtable for the right original type C.
        let addr = unsafe { (self.vtable.object_downcast)(self, target) };
        addr.map(NonNull::cast)
    }
}
