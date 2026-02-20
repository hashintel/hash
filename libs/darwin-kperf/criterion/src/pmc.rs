//! Hardware performance counter measurement for macOS.

use core::sync::atomic::{AtomicBool, Ordering};
use std::sync::LazyLock;

use darwin_kperf::{Sampler, ThreadSampler, event::Event};

use crate::{
    MeasurementError,
    unit::{CounterFormatter, unit_for_event},
};

static SAMPLER: LazyLock<Sampler> =
    LazyLock::new(|| Sampler::new().expect("must have root privileges"));

static SAMPLER_ACQUIRED: AtomicBool = AtomicBool::new(false);

/// A Criterion.rs [`Measurement`](criterion::measurement::Measurement) that
/// reads a single hardware performance counter.
///
/// Created via one of the named constructors ([`instructions`](Self::instructions),
/// [`cycles`](Self::cycles), etc.) or [`custom`](Self::custom) for arbitrary
/// [`Event`]s.
///
/// # Examples
///
/// ```rust,ignore
/// use darwin_kperf_criterion::HardwareCounter;
///
/// let criterion = Criterion::default()
///     .with_measurement(HardwareCounter::instructions().unwrap());
/// ```
pub struct HardwareCounter {
    thread: ThreadSampler<'static, 1>,
    formatter: CounterFormatter,
}

impl HardwareCounter {
    fn try_new(event: Event) -> Result<Self, MeasurementError> {
        let mut thread = SAMPLER.thread([event])?;
        thread.start()?;

        Ok(Self {
            thread,
            formatter: CounterFormatter::new(unit_for_event(event)),
        })
    }

    #[expect(clippy::panic_in_result_fn)]
    fn new(event: Event) -> Result<Self, MeasurementError> {
        // We're using a bool here, instead of the LazyLock itself, to ensure that multiple threads
        // don't initialize at the same time, leading to a race condition.
        let previously_acquired = SAMPLER_ACQUIRED.fetch_or(true, Ordering::SeqCst);
        assert!(
            !previously_acquired,
            "HardwareCounter can only be acquired once"
        );

        let result = Self::try_new(event);

        if result.is_err() {
            // We actually *weren't* able to acquire it, reset the flag, so that other threads can
            // try again.
            SAMPLER_ACQUIRED.store(false, Ordering::SeqCst);
        }

        result
    }

    /// Measures retired instructions (fixed counter, all generations).
    ///
    /// # Errors
    ///
    /// Returns [`MeasurementError`] if counter configuration fails.
    pub fn instructions() -> Result<Self, MeasurementError> {
        Self::new(Event::FixedInstructions)
    }

    /// Measures CPU cycles (fixed counter, all generations).
    ///
    /// # Errors
    ///
    /// Returns [`MeasurementError`] if counter configuration fails.
    pub fn cycles() -> Result<Self, MeasurementError> {
        Self::new(Event::FixedCycles)
    }

    /// Measures retired branch mispredictions (all generations).
    ///
    /// # Errors
    ///
    /// Returns [`MeasurementError`] if counter configuration fails.
    pub fn branch_mispredictions() -> Result<Self, MeasurementError> {
        Self::new(Event::BranchMispredNonspec)
    }

    /// Measures retired L1 data cache miss loads (all generations).
    ///
    /// # Errors
    ///
    /// Returns [`MeasurementError`] if counter configuration fails.
    pub fn l1d_cache_misses() -> Result<Self, MeasurementError> {
        Self::new(Event::L1DCacheMissLdNonspec)
    }

    /// Measures an arbitrary [`Event`].
    ///
    /// The formatter uses a generic "counts" unit. Prefer the named
    /// constructors when available for clearer output.
    ///
    /// # Errors
    ///
    /// Returns [`MeasurementError`] if the event is unavailable on the current CPU
    /// or counter configuration fails.
    pub fn custom(event: Event) -> Result<Self, MeasurementError> {
        Self::new(event)
    }

    fn sample_or_panic(&self) -> u64 {
        let [count] = self.thread.sample().unwrap_or_else(|error| {
            panic!("failed to read counter: {error}");
        });

        count
    }
}

impl Drop for HardwareCounter {
    #[expect(unsafe_code)]
    fn drop(&mut self) {
        // SAFETY: the ThreadSampler field is dropped after this runs (struct
        // drop order is field declaration order), and we are the sole owner.
        // No ThreadSampler will be running after this point.
        let _result = unsafe { SAMPLER.release() };
    }
}

impl criterion::measurement::Measurement for HardwareCounter {
    type Intermediate = u64;
    type Value = u64;

    fn start(&self) -> Self::Intermediate {
        self.sample_or_panic()
    }

    fn end(&self, i: Self::Intermediate) -> Self::Value {
        self.sample_or_panic().saturating_sub(i)
    }

    fn add(&self, v1: &Self::Value, v2: &Self::Value) -> Self::Value {
        v1 + v2
    }

    fn zero(&self) -> Self::Value {
        0
    }

    fn to_f64(&self, value: &Self::Value) -> f64 {
        #[expect(clippy::cast_precision_loss)]
        let value = *value as f64;

        value
    }

    fn formatter(&self) -> &dyn criterion::measurement::ValueFormatter {
        &self.formatter
    }
}

#[cfg(feature = "codspeed")]
impl codspeed_criterion_compat_walltime::measurement::Measurement for HardwareCounter {
    type Intermediate = u64;
    type Value = u64;

    fn start(&self) -> Self::Intermediate {
        self.sample_or_panic()
    }

    fn end(&self, i: Self::Intermediate) -> Self::Value {
        self.sample_or_panic().saturating_sub(i)
    }

    fn add(&self, v1: &Self::Value, v2: &Self::Value) -> Self::Value {
        v1 + v2
    }

    fn zero(&self) -> Self::Value {
        0
    }

    fn to_f64(&self, value: &Self::Value) -> f64 {
        #[expect(clippy::cast_precision_loss)]
        let value = *value as f64;

        value
    }

    fn formatter(&self) -> &dyn codspeed_criterion_compat_walltime::measurement::ValueFormatter {
        &self.formatter
    }
}
