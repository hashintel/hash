//! Criterion.rs integration for hardware performance counters on Apple Silicon.
//!
//! A [`Measurement`](criterion::measurement::Measurement) implementation backed
//! by hardware performance counters (PMCs) instead of wall-clock time.
//!
//! On non-macOS platforms, [`HardwareCounter`] falls back to wall-clock time so
//! that benchmarks still compile and run everywhere. The optional `codspeed`
//! feature adds a second `Measurement` implementation for
//! `codspeed-criterion-compat-walltime`, so the same `HardwareCounter` type
//! works in both vanilla Criterion and [codspeed](https://codspeed.io)
//! environments.
//!
//! # Quick start
//!
//! ```rust,ignore
//! use darwin_kperf_criterion::HardwareCounter;
//!
//! fn alternate_measurement() -> Criterion<HardwareCounter> {
//!     Criterion::default()
//!         .with_measurement(HardwareCounter::instructions().unwrap())
//! }
//!
//! criterion_group! {
//!     name = benches;
//!     config = alternate_measurement();
//!     targets = my_benchmark
//! }
//! criterion_main!(benches);
//! ```
//!
//! # Available counters
//!
//! | Constructor | Event | Availability |
//! |---|---|---|
//! | [`instructions`](HardwareCounter::instructions) | Retired instructions | All generations (fixed) |
//! | [`cycles`](HardwareCounter::cycles) | CPU cycles | All generations (fixed) |
//! | [`branch_mispredictions`](HardwareCounter::branch_mispredictions) | Retired branch mispredictions | All generations |
//! | [`l1d_cache_misses`](HardwareCounter::l1d_cache_misses) | Retired L1D cache miss loads | All generations |
//! | [`custom`](HardwareCounter::custom) | Any [`Event`](darwin_kperf_events::Event) | Depends on event |
//!
//! # Choosing a counter
//!
//! **Instructions** is the best default for most benchmarks. Instruction counts
//! are deterministic: they don't vary with CPU frequency scaling, thermal
//! throttling, or background load. You get stable, reproducible numbers even
//! with a small sample size. Use **cycles** when you care about actual
//! execution time on a specific microarchitecture (IPC, port pressure, etc.),
//! but expect higher variance.
//!
//! # Tuning Criterion for instruction counting
//!
//! Instruction counts are nearly deterministic for straight-line code;
//! typical variance is 0.01% to 0.05%, far below wall-clock noise. This means
//! you can dramatically reduce sample sizes without sacrificing precision:
//!
//! ```rust,ignore
//! use std::time::Duration;
//!
//! use darwin_kperf_criterion::HardwareCounter;
//!
//! fn fast_measurement() -> Criterion<HardwareCounter> {
//!     Criterion::default()
//!         .with_measurement(HardwareCounter::instructions().unwrap())
//!         .warm_up_time(Duration::from_millis(100))
//!         .measurement_time(Duration::from_millis(100))
//!         .sample_size(10)        // minimum Criterion allows
//! }
//! ```
//!
//! With these settings, benchmarks that previously took seconds per group
//! complete in tens of milliseconds, with equally stable results.
//!
//! Note that instruction counts are *not* perfectly deterministic for all
//! workloads. Code paths that depend on allocator state, hash map resizing,
//! or other runtime decisions can show significant variance (sometimes
//! ±50% or more for very short operations). Keep Criterion's default
//! `nresamples` and `noise_threshold` to handle these cases gracefully.
//!
//! # Platform
//!
//! macOS only (Apple Silicon M1-M5). Requires root privileges or the
//! `com.apple.private.kernel.kpc` entitlement. On other platforms the
//! constructors return a wall-clock fallback.

#![cfg_attr(docsrs, feature(doc_cfg))]

mod error;

#[cfg(target_os = "macos")]
mod pmc;

#[cfg(not(target_os = "macos"))]
mod fallback;

#[cfg(target_os = "macos")]
mod unit;

pub use error::MeasurementError;
#[cfg(not(target_os = "macos"))]
pub use fallback::HardwareCounter;
#[cfg(target_os = "macos")]
pub use pmc::HardwareCounter;
