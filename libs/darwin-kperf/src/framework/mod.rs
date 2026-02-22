//! RAII handles for Apple's private performance counter frameworks.
//!
//! [`KPerf`] wraps `kperf.framework` (counter configuration and sampling) and
//! [`KPerfData`] wraps `kperfdata.framework` (PMC event database and
//! configuration building). Both load their framework at construction via
//! `dlopen` and resolve all required symbols eagerly into a
//! [`VTable`](darwin_kperf_sys::kperf::VTable).
//!
//! You normally don't construct these directly. [`Sampler::new`](crate::Sampler::new)
//! creates both handles internally. If you need the raw function pointers for
//! something the safe API doesn't expose, you can access them through
//! [`Sampler::kperf`](crate::Sampler::kperf) and
//! [`Sampler::kperfdata`](crate::Sampler::kperfdata).

mod error;

use core::ffi::CStr;

use darwin_kperf_sys::load::{LibraryHandle, LoadError};

pub use self::error::{FrameworkError, FrameworkErrorKind};

/// Handle to Apple's private `kperf.framework`.
///
/// Owns the dynamically loaded library and its resolved
/// [`VTable`](darwin_kperf_sys::kperf::VTable), which has the KPC function
/// pointers for counter configuration, sampling, and tick/nanosecond
/// conversion.
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
/// Owns the dynamically loaded library and its resolved
/// [`VTable`](darwin_kperf_sys::kperfdata::VTable). The vtable contains the
/// KPEP functions for opening the PMC event database for the current CPU,
/// looking up events by name or alias, and building the register configuration
/// that gets pushed to the kernel via [`KPerf`].
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
