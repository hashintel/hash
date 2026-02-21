//! RAII handles for Apple's private performance counter frameworks.
//!
//! [`KPerf`] wraps `kperf.framework` (counter configuration and sampling) and
//! [`KPerfData`] wraps `kperfdata.framework` (PMC event database and
//! configuration). Both load their framework at construction via `dlopen` and
//! resolve all required symbols eagerly.
//!
//! These types are owned by [`Sampler`](crate::Sampler) and are not typically
//! constructed directly.

mod error;

use core::ffi::CStr;

use darwin_kperf_sys::load::{LibraryHandle, LoadError};

pub use self::error::{FrameworkError, FrameworkErrorKind};

/// Handle to Apple's private `kperf.framework`.
///
/// Owns the dynamically loaded library and the resolved function pointers for kernel
/// performance counter (KPC) operations: configuring counter classes, starting/stopping
/// counting, reading per-thread and per-CPU counters, and converting between ticks and
/// nanoseconds.
#[derive(Debug)]
pub struct KPerf {
    _handle: LibraryHandle,
    vtable: darwin_kperf_sys::kperf::VTable,
}

impl KPerf {
    /// Loads `kperf.framework` from its default system path.
    ///
    /// # Errors
    ///
    /// Returns [`LoadError`] if the framework cannot be loaded or any required symbol
    /// cannot be resolved.
    pub fn new() -> Result<Self, LoadError> {
        Self::load(c"/System/Library/PrivateFrameworks/kperf.framework/kperf")
    }

    /// Loads `kperf.framework` from a custom `path`.
    ///
    /// # Errors
    ///
    /// Returns [`LoadError`] if the framework cannot be loaded or any required symbol
    /// cannot be resolved.
    pub fn load(path: &CStr) -> Result<Self, LoadError> {
        let handle = LibraryHandle::open(path)?;
        let vtable = darwin_kperf_sys::kperf::VTable::load(&handle)?;

        Ok(Self {
            _handle: handle,
            vtable,
        })
    }

    /// Resolved vtable for the loaded `kperf.framework`.
    #[must_use]
    pub const fn vtable(&self) -> &darwin_kperf_sys::kperf::VTable {
        &self.vtable
    }
}

/// Handle to Apple's private `kperfdata.framework`.
///
/// Owns the dynamically loaded library and the resolved function pointers for the kernel
/// performance event programming (KPEP) interface: opening the PMC event database for the
/// current CPU, looking up events by name or alias, and building a register configuration
/// to push to the kernel via [`KPerf`].
#[derive(Debug)]
pub struct KPerfData {
    _handle: LibraryHandle,
    vtable: darwin_kperf_sys::kperfdata::VTable,
}

impl KPerfData {
    /// Loads `kperfdata.framework` from its default system path.
    ///
    /// # Errors
    ///
    /// Returns [`LoadError`] if the framework cannot be loaded or any required symbol
    /// cannot be resolved.
    pub fn new() -> Result<Self, LoadError> {
        Self::load(c"/System/Library/PrivateFrameworks/kperfdata.framework/kperfdata")
    }

    /// Loads `kperfdata.framework` from a custom `path`.
    ///
    /// # Errors
    ///
    /// Returns [`LoadError`] if the framework cannot be loaded or any required symbol
    /// cannot be resolved.
    pub fn load(path: &CStr) -> Result<Self, LoadError> {
        let handle = LibraryHandle::open(path)?;
        let vtable = darwin_kperf_sys::kperfdata::VTable::load(&handle)?;

        Ok(Self {
            _handle: handle,
            vtable,
        })
    }

    /// Resolved vtable for the loaded `kperfdata.framework`.
    #[must_use]
    pub const fn vtable(&self) -> &darwin_kperf_sys::kperfdata::VTable {
        &self.vtable
    }
}
