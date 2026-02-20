//! Safe Rust interface for reading hardware performance counters on Apple Silicon.
//!
//! **⚠️ Experimental.** This crate depends entirely on Apple's *private*
//! `kperf.framework` and `kperfdata.framework`. These frameworks are not part
//! of any public SDK and have no ABI stability guarantee — Apple may change
//! struct layouts, rename symbols, or remove them entirely in any macOS update.
//! Testing requires root on physical hardware; the suite cannot run in CI,
//! sandboxed environments, or under Miri.
//!
//! # Overview
//!
//! `darwin-kperf` configures and reads the Performance Monitoring Unit (PMU)
//! counters on Apple Silicon (M1–M5). The underlying frameworks are loaded at
//! runtime via `dlopen`, so there is no link-time dependency on private headers.
//!
//! ```rust,ignore
//! use darwin_kperf::{Sampler, event::Event};
//!
//! let sampler = Sampler::new()?;
//! let mut thread = sampler.thread([Event::FixedInstructions, Event::FixedCycles])?;
//!
//! thread.start()?;
//! let before = thread.sample()?;
//! // ... do work ...
//! let after = thread.sample()?;
//! thread.stop()?;
//!
//! let instructions = after[0] - before[0];
//! let cycles = after[1] - before[1];
//! ```
//!
//! # Key types
//!
//! - [`Sampler`] — session-scoped handle. Loads both frameworks, detects the CPU, and
//!   force-acquires all counters. [`Send`] + [`Sync`].
//! - [`ThreadSampler`] — per-thread counter reader, created via [`Sampler::thread`]. `!Send +
//!   !Sync` (hardware counters are thread-local). Reusable across multiple start/sample/stop
//!   cycles.
//! - [`Database`](database::Database) — read-only view of the PMC event database for the detected
//!   CPU.
//! - [`Event`](event::Event) — chip-agnostic event enum (M1–M5). Resolved to a chip-specific name
//!   at runtime via [`Event::on`](event::Event::on).
//!
//! # Platform
//!
//! - macOS only
//! - Requires root or the `com.apple.private.kernel.kpc` entitlement.
//!
//! ```sh
//! sudo -E cargo test --package darwin-kperf -- --ignored --nocapture
//! ```
//!
//! # Related crates
//!
//! - [`darwin_kperf_sys`] — raw FFI bindings.
//! - [`darwin_kperf_criterion`] — Criterion.rs integration for hardware-counter-based benchmarking.
//!   Drop-in replacement for wall-clock measurement with deterministic, load-immune results.
//!
//! # References
//!
//! - [ibireme's `kpc_demo.c`][kpc-demo] — the reference C implementation.
//!
//! [kpc-demo]: https://gist.github.com/ibireme/173517c208c7dc333ba962c1f0d67d12
//! [`darwin_kperf_criterion`]: https://docs.rs/darwin-kperf-criterion

#![cfg(target_os = "macos")]
#![no_std]
#![expect(unsafe_code)]

extern crate alloc;

mod framework;
mod sampler;

pub mod database;
pub use darwin_kperf_events as event;
pub(crate) mod utils;

pub use darwin_kperf_sys::load::LoadError;

pub use self::{
    framework::{FrameworkError, FrameworkErrorKind, KPerf, KPerfData},
    sampler::{Sampler, SamplerError, ThreadSampler},
};
