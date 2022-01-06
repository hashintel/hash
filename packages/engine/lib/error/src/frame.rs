// Ensure `_error` is only accessed through vtable
#![deny(clippy::used_underscore_binding)]

use alloc::boxed::Box;
use core::{
    any::TypeId,
    fmt,
    fmt::Formatter,
    mem::ManuallyDrop,
    panic::Location,
    ptr::{self, NonNull},
};

use provider::{self, tags, Provider, Requisition, TypeTag};

use super::tags::{FrameLocation, FrameSource};
use crate::Frame;

// Stores information for acting on `Frame` without knowing the internal type
struct VTable {
    object_drop: unsafe fn(Box<FrameRepr>),
    object_ref: unsafe fn(&FrameRepr) -> &dyn Context,
    object_downcast: unsafe fn(&FrameRepr, target: TypeId) -> Option<NonNull<()>>,
}

// We need a trait-alias like trait for writing `&dyn Context` because only auto traits can be used
// as additional traits in a trait object
pub trait Context: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static {}
// Need to implement it to get
impl<T: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static> Context for T {}

// Contextual messages don't necessarily implement `Provider`, `WrapErr` adds an empty
// implementation.
struct WrapErr<T>(T);

impl<T: fmt::Display> fmt::Display for WrapErr<T> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl<T: fmt::Debug> fmt::Debug for WrapErr<T> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

impl<T> Provider for WrapErr<T> {
    fn provide<'p>(&'p self, _req: &mut Requisition<'p, '_>) {}
}

// std errors don't necessarily implement `Provider`, `StdError` adds an implementation providing
// the backtrace if any.
#[cfg(feature = "std")]
struct StdError<T>(T);

#[cfg(feature = "std")]
impl<T: fmt::Display> fmt::Display for StdError<T> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

#[cfg(feature = "std")]
impl<T: fmt::Debug> fmt::Debug for StdError<T> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.0, fmt)
    }
}

#[cfg(feature = "std")]
impl<T: std::error::Error> Provider for StdError<T> {
    fn provide<'p>(&'p self, req: &mut Requisition<'p, '_>) {
        #[cfg(feature = "backtrace")]
        if let Some(backtrace) = self.0.backtrace() {
            req.provide_ref(backtrace);
        }
    }
}

impl VTable {
    /// Drops the `frame`
    ///
    /// # Safety
    ///
    /// - Layout of `*frame` must match `FrameRepr<E>`.
    unsafe fn object_drop<E>(frame: Box<FrameRepr>) {
        // Attach E's native vtable onto the pointer to self._error
        let unerased = Box::from_raw(Box::into_raw(frame).cast::<FrameRepr<E>>());
        drop(unerased);
    }

    /// Unerase error as `&dyn Error`
    ///
    /// # Safety
    ///
    /// - Layout of `Self` must match `FrameRepr<E>`.
    unsafe fn object_ref<E: Context>(frame: &FrameRepr) -> &dyn Context {
        // Attach E's native vtable onto the pointer to self._error
        let unerased = (frame as *const FrameRepr).cast::<FrameRepr<E>>();
        // inside of vtable it's allowed to access `_error`
        #[allow(clippy::used_underscore_binding)]
        &(*(unerased))._error
    }

    /// Downcasts error to `target`
    ///
    /// # Safety
    ///
    /// - Layout of `Self` must match `FrameRepr<E>`.
    unsafe fn object_downcast<E: Context>(
        frame: &FrameRepr,
        target: TypeId,
    ) -> Option<NonNull<()>> {
        if TypeId::of::<E>() == target {
            // Attach E's native vtable onto the pointer to self._error
            let unerased = (frame as *const FrameRepr).cast::<FrameRepr<E>>();
            // inside of vtable it's allowed to access `_error`
            #[allow(clippy::used_underscore_binding)]
            let addr = &(*(unerased))._error as *const E as *mut ();
            Some(NonNull::new_unchecked(addr))
        } else {
            None
        }
    }
}

#[repr(C)]
#[allow(clippy::module_name_repetitions)]
pub struct FrameRepr<E = ()> {
    vtable: &'static VTable,
    // Must not be used directly, only through vtable
    _error: E,
}

impl<E> FrameRepr<E> {
    pub fn new(error: E) -> Box<FrameRepr>
    where
        E: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        let unerased = Box::new(Self {
            vtable: &VTable {
                object_drop: VTable::object_drop::<E>,
                object_ref: VTable::object_ref::<E>,
                object_downcast: VTable::object_downcast::<E>,
            },
            _error: error,
        });
        unsafe { Box::from_raw(Box::into_raw(unerased).cast()) }
    }
}

#[allow(clippy::used_underscore_binding)]
impl FrameRepr {
    pub fn from_message<M>(message: M) -> Box<Self>
    where
        M: fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        FrameRepr::new(WrapErr(message))
    }

    #[cfg(feature = "std")]
    pub fn from_std<M>(error: M) -> Box<Self>
    where
        M: std::error::Error + Send + Sync + 'static,
    {
        FrameRepr::new(StdError(error))
    }

    pub fn unerase(&self) -> &dyn Context {
        // Use vtable to attach E's native vtable for the right original type E.
        unsafe { (self.vtable.object_ref)(self) }
    }

    pub fn downcast<E>(&self) -> Option<NonNull<E>>
    where
        E: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        let target = TypeId::of::<E>();
        // Use vtable to attach E's native vtable for the right original type E.
        let addr = unsafe { (self.vtable.object_downcast)(self, target) };
        addr.map(NonNull::cast)
    }
}

impl Frame {
    /// Returns the location where this `Frame` was created.
    #[must_use]
    pub const fn location(&self) -> &'static Location<'static> {
        self.location
    }

    /// Requests the value specified by [`TypeTag`] from the `Frame` if provided.
    #[must_use]
    pub fn request<'p, I>(&'p self) -> Option<I::Type>
    where
        I: TypeTag<'p>,
    {
        provider::request_by_type_tag::<'p, I, _>(self)
    }

    /// Requests the reference to `T` from the `Frame` if provided.
    #[must_use]
    pub fn request_ref<T>(&self) -> Option<&T>
    where
        T: ?Sized + 'static,
    {
        self.request::<'_, tags::Ref<T>>()
    }

    /// Requests the value of `T` from the `Frame` if provided.
    #[must_use]
    pub fn request_value<T>(&self) -> Option<T>
    where
        T: 'static,
    {
        self.request::<'_, tags::Value<T>>()
    }

    /// Returns if `E` is the type held by this frame.
    #[must_use]
    pub fn is<E>(&self) -> bool
    where
        E: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        self.error.downcast::<E>().is_some()
    }

    /// Downcast this error object by a shared reference.
    #[must_use]
    pub fn downcast_ref<E>(&self) -> Option<&E>
    where
        E: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        self.error.downcast().map(|addr| unsafe { &*addr.as_ptr() })
    }
}

impl Provider for Frame {
    fn provide<'p>(&'p self, req: &mut Requisition<'p, '_>) {
        self.error.unerase().provide(req);
        req.provide_with::<FrameLocation, _>(|| self.location);
        if let Some(source) = &self.source {
            req.provide_with::<FrameSource, _>(|| source);
        }
    }
}

impl fmt::Debug for Frame {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("Frame")
            .field("error", &self.error.unerase())
            .field("location", &self.location)
            .finish()
    }
}

impl fmt::Display for Frame {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(self.error.unerase(), fmt)
    }
}
//
impl Drop for Frame {
    fn drop(&mut self) {
        unsafe {
            // Read Box<ErrorImpl<()>> from self.
            let inner = ptr::read(&self.error);
            let erased = ManuallyDrop::into_inner(inner);

            // Invoke the vtable's drop behavior.
            (erased.vtable.object_drop)(erased);
        }
    }
}
