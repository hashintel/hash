//! Wall-clock fallback for non-macOS platforms.

use std::time::{Duration, Instant};

use criterion::measurement::WallTime;
use darwin_kperf_events::Event;

/// Wall-clock fallback that mirrors the macOS [`HardwareCounter`](crate::pmc::HardwareCounter)
/// API surface but delegates to [`WallTime`].
///
/// Returned on non-macOS platforms. The named constructors always succeed;
/// `custom` is not available since [`Event`](darwin_kperf::event::Event)
/// requires macOS.
pub struct HardwareCounter {
    inner: WallTime,
}

impl HardwareCounter {
    /// Falls back to wall-clock time (not on macOS).
    pub fn instructions() -> Result<Self, std::io::Error> {
        Ok(Self { inner: WallTime })
    }

    /// Falls back to wall-clock time (not on macOS).
    pub fn cycles() -> Result<Self, std::io::Error> {
        Ok(Self { inner: WallTime })
    }

    /// Falls back to wall-clock time (not on macOS).
    pub fn branch_mispredictions() -> Result<Self, std::io::Error> {
        Ok(Self { inner: WallTime })
    }

    /// Falls back to wall-clock time (not on macOS).
    pub fn l1d_cache_misses() -> Result<Self, std::io::Error> {
        Ok(Self { inner: WallTime })
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
impl codspeed_criterion_compat::measurement::Measurement for HardwareCounter {
    type Intermediate = Instant;
    type Value = Duration;

    fn start(&self) -> Self::Intermediate {
        Instant::now()
    }

    fn end(&self, i: Self::Intermediate) -> Self::Value {
        i.elapsed()
    }

    fn add(&self, v1: &Self::Value, v2: &Self::Value) -> Self::Value {
        *v1 + *v2
    }

    fn zero(&self) -> Self::Value {
        Duration::from_secs(0)
    }

    fn to_f64(&self, value: &Self::Value) -> f64 {
        value.as_nanos() as f64
    }

    fn formatter(&self) -> &dyn codspeed_criterion_compat::measurement::ValueFormatter {
        &FallbackFormatter
    }
}

#[cfg(feature = "codspeed")]
struct FallbackFormatter;

#[cfg(feature = "codspeed")]
impl codspeed_criterion_compat::measurement::ValueFormatter for FallbackFormatter {
    fn scale_values(&self, ns: f64, values: &mut [f64]) -> &'static str {
        let (factor, unit) = if ns < 1.0 {
            (1e3, "ps")
        } else if ns < 1e3 {
            (1.0, "ns")
        } else if ns < 1e6 {
            (1e-3, "µs")
        } else if ns < 1e9 {
            (1e-6, "ms")
        } else {
            (1e-9, "s")
        };

        for value in values {
            *value *= factor;
        }

        unit
    }

    fn scale_throughputs(
        &self,
        _typical: f64,
        throughput: &codspeed_criterion_compat::Throughput,
        values: &mut [f64],
    ) -> &'static str {
        match *throughput {
            codspeed_criterion_compat::Throughput::Bytes(bytes)
            | codspeed_criterion_compat::Throughput::BytesDecimal(bytes) => {
                for value in values {
                    *value = (bytes as f64) / (*value * 1e-9);
                }
                "B/s"
            }
            codspeed_criterion_compat::Throughput::Elements(elements) => {
                for value in values {
                    *value = (elements as f64) / (*value * 1e-9);
                }
                "elem/s"
            }
        }
    }

    fn scale_for_machines(&self, _values: &mut [f64]) -> &'static str {
        "ns"
    }
}
