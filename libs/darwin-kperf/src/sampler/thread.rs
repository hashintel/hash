use core::{array, fmt, marker::PhantomData, ptr::NonNull};

use darwin_kperf_sys::{kperf::KPC_MAX_COUNTERS, kperfdata::kpep_config};

use super::{
    Sampler,
    error::{SamplerError, try_kpc},
};
use crate::utils::DropGuard;

/// Per-thread performance counter reader.
///
/// Created via [`Sampler::thread`]. Use [`start`](Self::start) /
/// [`sample`](Self::sample) / [`stop`](Self::stop) to control counting
/// and read raw values. Reusable across multiple start/stop cycles.
///
/// `!Send + !Sync` — hardware counters are thread-local, so the sampler
/// must be used on the thread that created it.
pub struct ThreadSampler<'sampler, const N: usize> {
    running: bool,

    sampler: &'sampler Sampler,
    config: NonNull<kpep_config>,

    classes: u32,
    counter_map: [usize; N],

    _marker: PhantomData<*mut ()>,
}

impl<'sampler, const N: usize> ThreadSampler<'sampler, N> {
    pub(crate) const fn new(
        sampler: &'sampler Sampler,
        config: NonNull<kpep_config>,
        classes: u32,
        counter_map: [usize; N],
    ) -> Self {
        Self {
            running: false,
            sampler,
            config,
            classes,
            counter_map,
            _marker: PhantomData,
        }
    }

    /// Returns `true` if counting is currently enabled.
    #[must_use]
    pub const fn is_running(&self) -> bool {
        self.running
    }

    /// Enables counting for the configured events.
    ///
    /// If counting is already enabled, this is a no-op.
    ///
    /// # Errors
    ///
    /// Returns [`SamplerError`] if the kernel rejects the counting request.
    pub fn start(&mut self) -> Result<(), SamplerError> {
        if self.running {
            return Ok(());
        }

        let kpc_vt = self.sampler.kperf.vtable();

        try_kpc(
            // SAFETY: kpc_set_counting is a sysctl write; classes was obtained from
            // a valid kpep_config. Passing 0 on failure is always safe.
            unsafe { (kpc_vt.kpc_set_counting)(self.classes) },
            SamplerError::UnableToStartCounting,
        )?;

        let counting_guard = DropGuard::new((), |()| {
            // SAFETY: Disable counting by writing 0 to the sysctl. The function
            // pointer is valid, and 0 is a valid argument.
            let _res = unsafe { (kpc_vt.kpc_set_counting)(0) };
        });

        try_kpc(
            // SAFETY: same as kpc_set_counting — sysctl write with valid classes.
            unsafe { (kpc_vt.kpc_set_thread_counting)(self.classes) },
            SamplerError::UnableToStartThreadCounting,
        )?;

        self.running = true;

        DropGuard::dismiss(counting_guard);

        Ok(())
    }

    /// Reads the current raw counter values for the configured events.
    ///
    /// Each element in the returned array corresponds to the event at the same
    /// index in the `events` array passed to [`Sampler::thread`]. Values are
    /// absolute hardware counter readings; compute deltas between two calls to
    /// get per-region counts.
    ///
    /// # Errors
    ///
    /// Returns [`SamplerError`] if reading thread counters fails.
    #[expect(clippy::cast_possible_truncation, clippy::indexing_slicing)]
    pub fn sample(&self) -> Result<[u64; N], SamplerError> {
        if !self.running {
            return Err(SamplerError::SamplerNotRunning);
        }

        let kpc_vt = self.sampler.kperf.vtable();
        let mut counters = [0; KPC_MAX_COUNTERS];

        try_kpc(
            // SAFETY: buffer is KPC_MAX_COUNTERS elements, matching the count
            // parameter. tid=0 reads the calling thread's counters.
            unsafe {
                (kpc_vt.kpc_get_thread_counters)(0, KPC_MAX_COUNTERS as u32, counters.as_mut_ptr())
            },
            SamplerError::UnableToReadCounters,
        )?;

        let output = array::from_fn(|index| {
            let counter_index = self.counter_map[index];
            counters[counter_index]
        });

        Ok(output)
    }

    /// Disables counting.
    ///
    /// If counting is already disabled, this is a no-op.
    ///
    /// # Errors
    ///
    /// Returns [`SamplerError`] if the kernel rejects the request. Both calls
    /// are attempted even if the first fails.
    pub fn stop(&mut self) -> Result<(), SamplerError> {
        if !self.running {
            return Ok(());
        }

        let kpc_vt = self.sampler.kperf.vtable();

        // Reverse order of start: thread counting first, then counting.
        // SAFETY: passing 0 to disable counting is always safe.
        let ret_thread_counting = unsafe { (kpc_vt.kpc_set_thread_counting)(0) };
        // SAFETY: same as above.
        let ret_counting = unsafe { (kpc_vt.kpc_set_counting)(0) };

        self.running = false;

        try_kpc(
            ret_thread_counting,
            SamplerError::UnableToStopThreadCounting,
        )?;
        try_kpc(ret_counting, SamplerError::UnableToStopCounting)?;

        Ok(())
    }
}

impl<const N: usize> Drop for ThreadSampler<'_, N> {
    fn drop(&mut self) {
        let _result = self.stop();

        let kpep_vt = self.sampler.kperfdata.vtable();
        // SAFETY: config was allocated by kpep_config_create in ll_start and
        // has not been freed. The kperfdata framework is still loaded because
        // we hold a reference to the Sampler which owns it.
        unsafe {
            (kpep_vt.kpep_config_free)(self.config.as_ptr());
        }
    }
}

impl<const N: usize> fmt::Debug for ThreadSampler<'_, N> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("ThreadSampler")
            .field("running", &self.running)
            .field("classes", &self.classes)
            .field("counter_map", &self.counter_map)
            .finish_non_exhaustive()
    }
}
