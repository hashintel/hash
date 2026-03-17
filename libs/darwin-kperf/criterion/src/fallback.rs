//! Wall-clock fallback for non-macOS platforms.
#![expect(
    clippy::missing_errors_doc,
    clippy::unnecessary_wraps,
    reason = "compatibility with pmc module"
)]

use core::time::Duration;
use std::time::Instant;

use criterion::measurement::WallTime;
use darwin_kperf_events::Event;

use crate::MeasurementError;

/// Wall-clock fallback that mirrors the macOS `HardwareCounter`
/// API surface but delegates to [`WallTime`].
///
/// Returned on non-macOS platforms. The named constructors always succeed;
/// `custom` is not available since [`Event`]
/// requires macOS.
pub struct HardwareCounter {
    inner: WallTime,
    #[cfg(feature = "codspeed")]
    codspeed: codspeed_criterion_compat_walltime::measurement::WallTime,
}

impl HardwareCounter {
    const fn new() -> Self {
        Self {
            inner: WallTime,
            #[cfg(feature = "codspeed")]
            codspeed: codspeed_criterion_compat_walltime::measurement::WallTime,
        }
    }

    /// Falls back to wall-clock time (not on macOS).
    pub const fn instructions() -> Result<Self, MeasurementError> {
        Ok(Self::new())
    }

    /// Falls back to wall-clock time (not on macOS).
    pub const fn cycles() -> Result<Self, MeasurementError> {
        Ok(Self::new())
    }

    /// Falls back to wall-clock time (not on macOS).
    pub const fn branch_mispredictions() -> Result<Self, MeasurementError> {
        Ok(Self::new())
    }

    /// Falls back to wall-clock time (not on macOS).
    pub const fn l1d_cache_misses() -> Result<Self, MeasurementError> {
        Ok(Self::new())
    }

    /// Falls back to wall-clock time (not on macOS).
    ///
    /// The event is ignored; measurement uses wall-clock time.
    pub const fn custom(_event: Event) -> Result<Self, MeasurementError> {
        Ok(Self::new())
    }
}

impl criterion::measurement::Measurement for HardwareCounter {
    type Intermediate = Instant;
    type Value = Duration;

    fn start(&self) -> Self::Intermediate {
        self.inner.start()
    }

    fn end(&self, i: Self::Intermediate) -> Self::Value {
        self.inner.end(i)
    }

    fn add(&self, v1: &Self::Value, v2: &Self::Value) -> Self::Value {
        self.inner.add(v1, v2)
    }

    fn zero(&self) -> Self::Value {
        self.inner.zero()
    }

    fn to_f64(&self, value: &Self::Value) -> f64 {
        self.inner.to_f64(value)
    }

    fn formatter(&self) -> &dyn criterion::measurement::ValueFormatter {
        self.inner.formatter()
    }
}

#[cfg(feature = "codspeed")]
impl codspeed_criterion_compat_walltime::measurement::Measurement for HardwareCounter {
    type Intermediate = Instant;
    type Value = Duration;

    fn start(&self) -> Self::Intermediate {
        self.codspeed.start()
    }

    fn end(&self, i: Self::Intermediate) -> Self::Value {
        self.codspeed.end(i)
    }

    fn add(&self, v1: &Self::Value, v2: &Self::Value) -> Self::Value {
        self.codspeed.add(v1, v2)
    }

    fn zero(&self) -> Self::Value {
        self.codspeed.zero()
    }

    fn to_f64(&self, value: &Self::Value) -> f64 {
        self.codspeed.to_f64(value)
    }

    fn formatter(&self) -> &dyn codspeed_criterion_compat_walltime::measurement::ValueFormatter {
        self.codspeed.formatter()
    }
}
