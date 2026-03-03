//! Minimal dynamic library loading primitives built directly on `dlopen(3)`.
//!
//! This module provides [`LibraryHandle`] and [`LibrarySymbol`], thin wrappers around
//! the POSIX `dl*` family, without pulling in `libc` or `libloading`. This works on
//! macOS because `libSystem.B.dylib` (which exports `dlopen`, `dlsym`, `dlclose`, and
//! `dlerror`) is always implicitly linked into every process.
//!
//! # Lifecycle
//!
//! 1. [`LibraryHandle::open`] loads a dylib and returns a handle.
//! 2. [`LibraryHandle::symbol`] resolves a named symbol from the loaded library.
//! 3. The symbol is typically transmuted into a concrete function pointer via
//!    [`core::mem::transmute`] (see the `load_sym!` macros in [`crate::kperf`] and
//!    [`crate::kperfdata`]).
//! 4. [`LibraryHandle::close`] unloads the library, or [`Drop`] does so automatically.
//!
//! # Safety invariant
//!
//! A [`LibrarySymbol`] (and any function pointer derived from it) borrows the library's
//! mapped code pages. The caller must ensure that no such pointer is used after the
//! originating [`LibraryHandle`] is closed or dropped.

use alloc::{borrow::ToOwned as _, ffi::CString};
use core::{
    error::Error,
    ffi::{CStr, c_char, c_int, c_void},
    fmt,
    ptr::NonNull,
};

/// Bind symbols lazily; each symbol is resolved on first use.
pub const RTLD_LAZY: c_int = 0x1;
/// Bind symbols eagerly; all symbols are resolved when `dlopen` returns.
pub const RTLD_NOW: c_int = 0x2;

unsafe extern "C" {
    pub fn dlopen(path: *const c_char, mode: c_int) -> *mut c_void;
    pub fn dlsym(handle: *mut c_void, symbol: *const c_char) -> *mut c_void;
    pub fn dlclose(handle: *mut c_void) -> c_int;
    pub fn dlerror() -> *const c_char;
}

/// An error produced by `dlopen`, `dlsym`, or `dlclose`.
///
/// Owns a copy of the message returned by `dlerror()`. The message is copied immediately
/// because `dlerror` returns a pointer to a thread-local buffer that is overwritten by the
/// next `dl*` call.
#[derive(Debug)]
pub struct LoadError {
    message: CString,
}

impl fmt::Display for LoadError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Debug::fmt(&self.message, fmt)
    }
}

impl Error for LoadError {}

/// An opaque, non-null pointer to a symbol resolved from a loaded library.
///
/// This is a `repr(transparent)` wrapper around `NonNull<c_void>`, which makes it safe to
/// transmute into a function pointer of the correct signature. The null case is already
/// handled by [`LibraryHandle::symbol`], which returns `Err` instead.
///
/// # Safety
///
/// A `LibrarySymbol` borrows the memory-mapped pages of its originating library. It must
/// not be used (directly or after transmuting to a function pointer) once the
/// [`LibraryHandle`] that produced it has been closed or dropped.
#[derive(Debug)]
#[repr(transparent)]
pub struct LibrarySymbol(NonNull<c_void>);

/// A RAII wrapper around a `dlopen` handle.
///
/// Opens a dynamic library on construction and closes it on drop. After an
/// explicit [`close`](Self::close), the destructor is disarmed.
#[derive(Debug)]
#[repr(transparent)]
pub struct LibraryHandle(Option<NonNull<c_void>>);

// SAFETY: a `LibraryHandle` is an opaque token for a `dlopen`-ed library.
// `dlsym` and `dlclose` are thread-safe per POSIX, and `&self` methods only
// call `dlsym`. No interior mutability.
unsafe impl Send for LibraryHandle {}

// SAFETY: a `LibraryHandle` is an opaque token for a `dlopen`-ed library.
// `dlsym` and `dlclose` are thread-safe per POSIX, and `&self` methods only
// call `dlsym`. No interior mutability.
unsafe impl Sync for LibraryHandle {}

impl LibraryHandle {
    /// Loads the dynamic library at `path` with `RTLD_LAZY` binding.
    ///
    /// Returns a handle that keeps the library mapped until it is closed or dropped.
    ///
    /// # Errors
    ///
    /// Returns [`LoadError`] if the library cannot be loaded.
    pub fn open(path: &CStr) -> Result<Self, LoadError> {
        // SAFETY: `path` is a valid, null-terminated C string.
        let ptr = unsafe { dlopen(path.as_ptr(), RTLD_LAZY) };
        let Some(ptr) = NonNull::new(ptr) else {
            // SAFETY: `dlerror` is guaranteed to return a valid C string
            let message = unsafe { CStr::from_ptr(dlerror()).to_owned() };
            return Err(LoadError { message });
        };

        Ok(Self(Some(ptr)))
    }

    /// Resolves a named symbol from the loaded library.
    ///
    /// The returned [`LibrarySymbol`] is typically transmuted into a typed function pointer
    /// via [`core::mem::transmute`].
    ///
    /// # Safety
    ///
    /// The caller must ensure that:
    /// - `name` identifies a symbol whose actual signature matches the type it will be transmuted
    ///   to.
    /// - The resulting `LibrarySymbol` (or any pointer derived from it) is not used after this
    ///   handle is closed or dropped.
    /// # Errors
    ///
    /// Returns [`LoadError`] if the symbol cannot be found in the library.
    pub unsafe fn symbol(&self, name: &CStr) -> Result<LibrarySymbol, LoadError> {
        // SAFETY: `self.handle()` is a valid `dlopen` handle, and `name` is a valid C string.
        let ptr = unsafe { dlsym(self.handle().as_ptr(), name.as_ptr()) };
        let Some(ptr) = NonNull::new(ptr) else {
            // SAFETY: `dlerror` is guaranteed to return a valid C string
            let message = unsafe { CStr::from_ptr(dlerror()).to_owned() };
            return Err(LoadError { message });
        };

        Ok(LibrarySymbol(ptr))
    }

    const fn handle(&self) -> NonNull<c_void> {
        self.0.expect("library should not have been closed")
    }

    fn close_handle(handle: NonNull<c_void>) -> Result<(), LoadError> {
        // SAFETY: we're the only ones that have access to the library
        let res = unsafe { dlclose(handle.as_ptr()) };

        if res == 0 {
            return Ok(());
        }

        // SAFETY: `dlerror` is guaranteed to return a valid C string
        let message = unsafe { CStr::from_ptr(dlerror()).to_owned() };
        Err(LoadError { message })
    }

    /// Explicitly closes the library handle and returns any error from `dlclose`.
    ///
    /// After this call the destructor is disarmed; dropping the handle is a no-op.
    ///
    /// # Errors
    ///
    /// Returns [`LoadError`] if `dlclose` fails.
    ///
    /// # Safety
    ///
    /// The caller must ensure that no [`LibrarySymbol`] (or function pointer derived from
    /// one) obtained from this handle is used after this call returns.
    pub unsafe fn close(mut self) -> Result<(), LoadError> {
        self.0.take().map_or(Ok(()), Self::close_handle)
    }
}

impl Drop for LibraryHandle {
    fn drop(&mut self) {
        if let Some(handle) = self.0.take() {
            let _result = Self::close_handle(handle);
        }
    }
}
