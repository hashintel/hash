// Ensure `_error` is only accessed through vtable
#![deny(clippy::used_underscore_binding)]

use alloc::boxed::Box;
use core::{fmt, fmt::Formatter, mem::ManuallyDrop, panic::Location, ptr};

use provider::{self, tags, Provider, Requisition, TypeTag};

use super::tags::{FrameLocation, FrameSource};
use crate::Frame;

struct VTable {
    object_drop: unsafe fn(Box<ErrorRepr<()>>),
    object_ref: unsafe fn(&ErrorRepr<()>) -> &dyn Context,
}

pub trait Context: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static {}
impl<T: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static> Context for T {}

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
    /// - Layout of `*frame` must match `ErrorRepr<E>`.
    unsafe fn object_drop<E>(frame: Box<ErrorRepr<()>>) {
        // Attach E's native vtable onto the pointer to self._error
        let unerased = Box::from_raw(Box::into_raw(frame).cast::<ErrorRepr<E>>());
        drop(unerased);
    }

    /// Unerase error as `&dyn Error`
    ///
    /// # Safety
    ///
    /// - Layout of `Self` must match `ErrorRepr<E>`.
    unsafe fn object_ref<E: Context>(frame: &ErrorRepr<()>) -> &dyn Context {
        // Attach E's native vtable onto the pointer to self._error
        let unerased = (frame as *const ErrorRepr<()>).cast::<ErrorRepr<E>>();
        // inside of vtable it's allowed to access `_error`
        #[allow(clippy::used_underscore_binding)]
        &(*(unerased))._error
    }
}

#[repr(C)]
pub struct ErrorRepr<E> {
    vtable: &'static VTable,
    // Must not be used directly, only through vtable
    _error: E,
}

impl<E> ErrorRepr<E> {
    pub fn new(error: E) -> Box<ErrorRepr<()>>
    where
        E: Provider + fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        let unerased = Box::new(Self {
            vtable: &VTable {
                object_drop: VTable::object_drop::<E>,
                object_ref: VTable::object_ref::<E>,
            },
            _error: error,
        });
        unsafe { Box::from_raw(Box::into_raw(unerased).cast()) }
    }
}

#[allow(clippy::used_underscore_binding)]
impl ErrorRepr<()> {
    pub fn from_message<M>(message: M) -> Box<Self>
    where
        M: fmt::Display + fmt::Debug + Send + Sync + 'static,
    {
        ErrorRepr::new(WrapErr(message))
    }

    #[cfg(feature = "std")]
    pub fn from_std<M>(error: M) -> Box<Self>
    where
        M: std::error::Error + Send + Sync + 'static,
    {
        ErrorRepr::new(StdError(error))
    }

    pub fn unerase(&self) -> &dyn Context {
        // Use vtable to attach E's native vtable for the right original type E.
        unsafe { (self.vtable.object_ref)(self) }
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
