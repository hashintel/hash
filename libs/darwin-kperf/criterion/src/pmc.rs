//! Hardware performance counter measurement for macOS.

use std::sync::LazyLock;

use darwin_kperf::{Sampler, SamplerError, ThreadSampler, event::Event};

use crate::unit::{CounterFormatter, unit_for_event};

static SAMPLER: LazyLock<Sampler> =
    LazyLock::new(|| Sampler::new().expect("must have root privileges"));

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
    fn new(event: Event) -> Result<Self, SamplerError> {
        let mut thread = SAMPLER.thread([event])?;
        thread.start()?;

        Ok(Self {
            thread,
            formatter: CounterFormatter::new(unit_for_event(event)),
        })
    }

    /// Measures retired instructions (fixed counter, all generations).
    ///
    /// # Errors
    ///
    /// Returns [`SamplerError`] if counter configuration fails.
    pub fn instructions() -> Result<Self, SamplerError> {
        Self::new(Event::FixedInstructions)
    }

    /// Measures CPU cycles (fixed counter, all generations).
    ///
    /// # Errors
    ///
    /// Returns [`SamplerError`] if counter configuration fails.
    pub fn cycles() -> Result<Self, SamplerError> {
        Self::new(Event::FixedCycles)
    }

    /// Measures retired branch mispredictions (all generations).
    ///
    /// # Errors
    ///
    /// Returns [`SamplerError`] if counter configuration fails.
    pub fn branch_mispredictions() -> Result<Self, SamplerError> {
        Self::new(Event::BranchMispredNonspec)
    }

    /// Measures retired L1 data cache miss loads (all generations).
    ///
    /// # Errors
    ///
    /// Returns [`SamplerError`] if counter configuration fails.
    pub fn l1d_cache_misses() -> Result<Self, SamplerError> {
        Self::new(Event::L1DCacheMissLdNonspec)
    }

    /// Measures an arbitrary [`Event`].
    ///
    /// The formatter uses a generic "counts" unit. Prefer the named
    /// constructors when available for clearer output.
    ///
    /// # Errors
    ///
    /// Returns [`SamplerError`] if the event is unavailable on the current CPU
    /// or counter configuration fails.
    pub fn custom(event: Event) -> Result<Self, SamplerError> {
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

    fn end(&self, start: Self::Intermediate) -> Self::Value {
        self.sample_or_panic().saturating_sub(start)
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
impl codspeed_criterion_compat::measurement::Measurement for HardwareCounter {
    type Intermediate = u64;
    type Value = u64;

    fn start(&self) -> Self::Intermediate {
        self.sample_or_panic()
    }

    fn end(&self, start: Self::Intermediate) -> Self::Value {
        self.sample_or_panic().saturating_sub(start)
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

    fn formatter(&self) -> &dyn codspeed_criterion_compat::measurement::ValueFormatter {
        &self.formatter
    }
}
