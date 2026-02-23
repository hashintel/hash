//! Hardware performance counter sampling.
//!
//! # Workflow
//!
//! 1. Create a [`Sampler`] to load the frameworks, detect the CPU, and force-acquire all hardware
//!    counters.
//! 2. Call [`Sampler::thread`] with an array of [`Event`]s to create a [`ThreadSampler`] bound to
//!    the calling thread.
//! 3. Use [`start`](ThreadSampler::start), [`sample`](ThreadSampler::sample), and
//!    [`stop`](ThreadSampler::stop) to toggle counting and read raw values.
//! 4. Compute deltas between successive samples to get per-region counts.
//!
//! Both types clean up on drop: [`ThreadSampler`] stops counting and frees
//! its config; [`Sampler`] restores the previous `force_all_ctrs` state and
//! frees the database.

pub(crate) mod error;
mod ll;
mod thread;

use core::{ffi::c_int, fmt, ptr::NonNull};

use darwin_kperf_sys::kperfdata::kpep_db;

use self::error::try_kpc;
pub use self::{error::SamplerError, thread::ThreadSampler};
use crate::{
    database::Database,
    event::{Cpu, Event},
    framework::{KPerf, KPerfData},
};

/// Session-scoped handle for hardware performance counters.
///
/// When you create a `Sampler`, it loads Apple's private `kperf.framework` and
/// `kperfdata.framework`, detects which CPU you're running on, opens the
/// corresponding PMC event database, and force-acquires all hardware counters.
///
/// "Force-acquiring" means taking control of the counters that macOS normally
/// reserves for the OS Power Manager. Without this step, you can only access
/// a subset of the available counters. The previous force-all state is saved
/// at construction and restored when the `Sampler` is dropped, so other tools
/// that rely on those counters (like `powermetrics`) are only affected while
/// the `Sampler` is alive.
///
/// You should typically create one `Sampler` per process. Creating multiple
/// `Sampler`s is safe but will interfere with the save/restore of the
/// force-all-counters state, since each one independently saves and restores
/// the `sysctl` value on drop.
///
/// A `Sampler` is [`Send`] + [`Sync`] because all of its operations are
/// stateless `sysctl` calls. Use [`thread`](Self::thread) to create per-thread
/// [`ThreadSampler`]s that read the actual counter values.
pub struct Sampler {
    kperf: KPerf,
    kperfdata: KPerfData,
    db: NonNull<kpep_db>,
    cpu: Cpu,
    saved_force_all: c_int,
}

// SAFETY: the raw `kpep_db` pointer is only accessed behind `&self` after
// construction, and the framework vtable calls are stateless sysctl
// operations. The `kpep_db` itself is not modified after `kpep_db_create`.
unsafe impl Send for Sampler {}

// SAFETY: all `&self` methods on Sampler only read from the db and dispatch
// through vtable function pointers (stateless sysctl wrappers). No interior
// mutability.
unsafe impl Sync for Sampler {}

impl fmt::Debug for Sampler {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("Sampler")
            .field("cpu", &self.cpu)
            .finish_non_exhaustive()
    }
}

impl Sampler {
    /// Creates a new sampler for the current CPU.
    ///
    /// # Errors
    ///
    /// Returns [`SamplerError`] if a framework fails to load, the CPU is
    /// unrecognized, or counter acquisition fails (typically due to missing
    /// root privileges).
    pub fn new() -> Result<Self, SamplerError> {
        self::ll::ll_init()
    }

    /// Releases force-acquired counters back to the OS Power Manager.
    ///
    /// Restores the `force_all_ctrs` state saved at construction. This performs
    /// the same teardown step as [`Drop`], but without freeing the database.
    /// Intended for `static` samplers that outlive the measurement phase (e.g.
    /// a Criterion harness) and need to relinquish counters before process
    /// exit.
    ///
    /// # Safety
    ///
    /// The caller must ensure no [`ThreadSampler`] created from this `Sampler`
    /// is currently running. Releasing counters while a `ThreadSampler` is
    /// actively counting produces undefined hardware counter behavior.
    ///
    /// # Errors
    ///
    /// Returns [`SamplerError::FailedToForceAllCounters`] if the kernel
    /// rejects the sysctl write.
    pub unsafe fn release(&self) -> Result<(), SamplerError> {
        let kpc_vt = self.kperf.vtable();

        // SAFETY: restores the force_all_ctrs value saved at init.
        let result = unsafe { (kpc_vt.kpc_force_all_ctrs_set)(self.saved_force_all) };

        try_kpc(result, SamplerError::FailedToForceAllCounters)
    }

    /// The loaded `kperf.framework` handle.
    #[must_use]
    pub const fn kperf(&self) -> &KPerf {
        &self.kperf
    }

    /// The loaded `kperfdata.framework` handle.
    #[must_use]
    pub const fn kperfdata(&self) -> &KPerfData {
        &self.kperfdata
    }

    /// The detected CPU generation.
    #[must_use]
    pub const fn cpu(&self) -> Cpu {
        self.cpu
    }

    /// A safe view of the PMC event database for the detected CPU.
    #[must_use]
    pub const fn database(&self) -> Database<'_> {
        // SAFETY: db was allocated by kpep_db_create and remains valid for
        // the lifetime of the Sampler.
        unsafe { Database::from_raw(&*self.db.as_ptr()) }
    }

    /// Creates a [`ThreadSampler`] configured for the given events.
    ///
    /// The returned `ThreadSampler` is `!Send + !Sync` and must be used on
    /// the thread that created it.
    ///
    /// # Errors
    ///
    /// Returns [`SamplerError`] if any event is unavailable on the current CPU
    /// or if counter programming fails.
    pub fn thread<const N: usize>(
        &self,
        events: [Event; N],
    ) -> Result<ThreadSampler<'_, N>, SamplerError> {
        self::ll::ll_configure(self, events)
    }
}

impl Drop for Sampler {
    fn drop(&mut self) {
        self::ll::ll_drop(self);
    }
}
