//! Read hardware performance counters on Apple Silicon.
//!
//! Every Apple Silicon chip (M1 through M5) has a Performance Monitoring Unit
//! (PMU): a set of dedicated hardware registers that count low-level CPU events
//! like retired instructions, elapsed cycles, branch mispredictions, and cache
//! misses. These are the same counters that power Instruments and `xctrace`.
//!
//! This crate wraps Apple's private `kperf.framework` and `kperfdata.framework`
//! to give you direct access to those counters from Rust. Both frameworks are
//! loaded at runtime via `dlopen`, so there is no link-time dependency on
//! private headers.
//!
//! # ⚠️ Experimental
//!
//! These frameworks are not part of any public SDK. Apple may change struct
//! layouts, rename symbols, or drop them entirely in any macOS update. Testing
//! requires root on physical hardware; the suite cannot run in CI, sandboxed
//! environments, or under Miri.
//!
//! # Quick start
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
//! # Raw values and deltas
//!
//! [`ThreadSampler::sample`] returns the raw hardware counter values at the
//! moment you call it. These are running totals that the CPU maintains
//! internally; they do not reset between calls. To measure a specific region
//! of code, take two samples and subtract:
//!
//! ```rust,ignore
//! let before = thread.sample()?;
//! my_function();
//! let after = thread.sample()?;
//!
//! let instructions_in_my_function = after[0] - before[0];
//! ```
//!
//! The counters only track events on the calling thread, so other threads
//! running concurrently will not pollute your measurements.
//!
//! # Choosing events
//!
//! Apple Silicon CPUs have two kinds of performance counters: fixed and
//! configurable. Fixed counters are always available and always count the same
//! thing (instructions and cycles). Configurable counters can be programmed to
//! count any event the CPU supports, but there are only a handful of them
//! (typically 6 or 8), and you can only use as many configurable events as
//! there are configurable counter registers.
//!
//! For most use cases, [`Event::FixedInstructions`](event::Event::FixedInstructions)
//! and [`Event::FixedCycles`](event::Event::FixedCycles) are what you want.
//! Instruction counts are nearly deterministic for straight-line code, making
//! them ideal for benchmarking. Cycle counts reflect actual execution time on
//! the microarchitecture, but vary with frequency scaling and thermal state.
//!
//! If you need events like branch mispredictions or cache misses, use the
//! configurable counter variants from the [`Event`](event::Event) enum. The
//! [`Event::on`](event::Event::on) method resolves a chip-agnostic event name
//! to the correct hardware-specific name for the detected CPU.
//!
//! # Platform
//!
//! macOS only. Requires root or the `com.apple.private.kernel.kpc` entitlement.
//!
//! ```sh
//! sudo -E cargo test --package darwin-kperf -- --ignored --nocapture
//! ```
//!
//! # Related crates
//!
//! [`darwin-kperf-sys`] provides the raw FFI bindings if you need direct
//! access to the C function pointers and `repr(C)` structs.
//!
//! [`darwin-kperf-criterion`] plugs into Criterion.rs to benchmark with
//! hardware counters instead of wall-clock time.
//!
//! # References
//!
//! The API surface and struct layouts are derived from [ibireme's
//! `kpc_demo.c`][kpc-demo], a standalone C program that demonstrates the full
//! KPC/KPEP workflow on Apple Silicon.
//!
//! [kpc-demo]: https://gist.github.com/ibireme/173517c208c7dc333ba962c1f0d67d12
//! [`darwin-kperf-sys`]: https://docs.rs/darwin-kperf-sys
//! [`darwin-kperf-criterion`]: https://docs.rs/darwin-kperf-criterion

#![cfg(target_os = "macos")]
#![cfg_attr(docsrs, feature(doc_cfg))]
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
