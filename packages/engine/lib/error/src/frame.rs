// Ensure `_context` is only accessed through vtable
#![deny(clippy::used_underscore_binding)]

use alloc::boxed::Box;
use core::{
    any::TypeId,
    fmt,
    fmt::Formatter,
    mem::ManuallyDrop,
    panic::Location,
    ptr::{self, addr_of, NonNull},
};

use provider::{self, Demand, Provider};

use crate::{Context, Frame, Message};

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

// Contextual messages don't necessarily implement `Provider`, `Message` adds an empty
// implementation.
struct MessageRepr<E>(E);

impl<E: fmt::Display> fmt::Display for MessageRepr<E> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl<E: fmt::Debug> fmt::Debug for MessageRepr<E> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

impl<E> Provider for MessageRepr<E> {
    // An empty impl is fine as it's not possible to safely create a Requisition outside of the
    // provider API, so this won't cause silent problems
    fn provide<'a>(&'a self, _demand: &mut Demand<'a>) {}
}

// std errors don't necessarily implement `Provider`, `std::error::Error` adds an implementation
// providing the backtrace if any.
#[cfg(feature = "std")]
struct ErrorRepr<E>(E);

#[cfg(feature = "std")]
impl<E: fmt::Display> fmt::Display for ErrorRepr<E> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

#[cfg(feature = "std")]
impl<E: fmt::Debug> fmt::Debug for ErrorRepr<E> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

#[cfg(feature = "std")]
impl<E: std::error::Error> Provider for ErrorRepr<E> {
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        #[cfg(feature = "backtrace")]
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
#[allow(clippy::module_name_repetitions)]
pub struct FrameRepr<C = ()> {
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
        // Use vtable to attach C's native vtable for the right original type C.
        unsafe { (self.vtable.object_ref)(self) }
    }

    fn downcast<C>(&self) -> Option<NonNull<C>>
    where
        C: Context,
    {
        let target = TypeId::of::<C>();
        // Use vtable to attach C's native vtable for the right original type C.
        let addr = unsafe { (self.vtable.object_downcast)(self, target) };
        addr.map(NonNull::cast)
    }
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
        // SAFETY: `inner` is wrapped in `ManuallyDrop`
        Self {
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
        // SAFETY: `inner` is wrapped in `ManuallyDrop`
        Self {
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
        E: std::error::Error + Send + Sync + 'static,
    {
        // SAFETY: `inner` is wrapped in `ManuallyDrop`
        Self {
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

    /// Returns if `E` is the type held by this frame.
    #[must_use]
    pub fn is<C>(&self) -> bool
    where
        C: Context,
    {
        self.inner.downcast::<C>().is_some()
    }

    /// Downcasts this frame if the held provider object is the same as `C`.
    #[must_use]
    pub fn downcast_ref<C>(&self) -> Option<&C>
    where
        C: Context,
    {
        self.inner.downcast().map(|addr| unsafe { &*addr.as_ptr() })
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
        unsafe {
            // Read Box<ErrorImpl<()>> from self.
            let inner = ptr::read(&self.inner);
            let erased = ManuallyDrop::into_inner(inner);

            // Invoke the vtable's drop behavior.
            (erased.vtable.object_drop)(erased);
        }
    }
}
