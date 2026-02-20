//! Raw FFI bindings for Apple's private `kperf.framework` and `kperfdata.framework`.
//!
//! **⚠️ Experimental.** These frameworks are not part of any public SDK and carry no
//! ABI stability guarantee. Apple may change struct layouts, function signatures, or
//! remove symbols entirely in any macOS update. The `repr(C)` structs in this crate
//! have compile-time layout assertions, but those only catch drift at build time on the
//! specific macOS version used to compile.
//!
//! This crate provides low-level, `#![no_std]` Rust bindings to the two private macOS
//! frameworks that expose hardware performance monitoring counters (PMCs). It is the
//! foundation that [`darwin-kperf`] builds its safe API on top of.
//!
//! [`darwin-kperf`]: https://docs.rs/darwin-kperf
//!
//! # Frameworks
//!
//! Apple ships two private frameworks for PMC access. Neither framework appears in the
//! public SDK headers, and neither has a stable ABI guarantee.
//!
//! **`kperf.framework`** contains the Kernel Performance Counter (KPC) and Kernel
//! Performance (KPERF) interfaces. KPC functions configure which counter classes are
//! active, program hardware register values, and read back per-thread or per-CPU counter
//! accumulations. KPERF functions manage the sampling subsystem — actions, timers, and
//! trigger-based profiling. All of these are thin wrappers around `sysctl` calls into
//! the XNU kernel. See the [`kperf`] module.
//!
//! **`kperfdata.framework`** contains the Kernel Performance Event Programming (KPEP)
//! interface. KPEP manages the PMC event database — the plist files shipped in
//! `/usr/share/kpep/` that describe every hardware event a given CPU supports. It
//! provides functions to open a database for the current CPU, look up events by name or
//! alias, and build the register configuration that KPC expects. See the [`kperfdata`]
//! module.
//!
//! # Runtime loading
//!
//! Because these frameworks are private, they cannot be linked at compile time. Instead,
//! this crate loads them at runtime via `dlopen(3)` / `dlsym(3)` and resolves each
//! function pointer into a [`VTable`](kperf::VTable). The [`load`] module provides the
//! underlying [`LibraryHandle`](load::LibraryHandle) and
//! [`LibrarySymbol`](load::LibrarySymbol) primitives that make this work without pulling
//! in `libc` or `libloading`.
//!
//! # Modules
//!
//! - [`load`] — Dynamic library loading primitives (`LibraryHandle`, `LibrarySymbol`, `LoadError`).
//! - [`kperf`] — Constants, type aliases, and [`VTable`](kperf::VTable) for `kperf.framework`
//!   (counter configuration and sampling).
//! - [`kperfdata`] — `repr(C)` structs, error codes, and [`VTable`](kperfdata::VTable) for
//!   `kperfdata.framework` (PMC event database and configuration).
//!
//! Each framework module provides a `VTable` struct whose [`load`](kperf::VTable::load)
//! method eagerly resolves every required symbol from a `LibraryHandle`. If any symbol is
//! missing, loading fails with a [`LoadError`](load::LoadError) — there is no lazy or
//! partial resolution.
//!
//! # Platform
//!
//! This crate only supports macOS on `x86_64` and `aarch64`. Root privileges (`sudo`) are required
//! at runtime to force-acquire performance counters and to read thread-level PMC values.
//!
//! # Safety
//!
//! Everything in this crate is `unsafe`. The function pointer type aliases describe C
//! calling conventions with raw pointers, and the `repr(C)` structs mirror kernel data
//! structures whose layout is not guaranteed by Apple to remain stable. Callers must
//! uphold the documented preconditions for every FFI call — buffer sizes, pointer
//! validity, and thread-safety constraints.
//!
//! For a safe, ergonomic interface, use the [`darwin-kperf`] crate instead.
//!
//! # References
//!
//! This crate's API surface and struct layouts are derived from
//! [ibireme's `kpc_demo.c`][kpc-demo], a standalone C program that demonstrates the full
//! KPC / KPEP workflow on Apple Silicon. That gist is the most complete public
//! documentation of these private interfaces.
//!
//! [kpc-demo]: https://gist.github.com/ibireme/173517c208c7dc333ba962c1f0d67d12
#![cfg(target_os = "macos")]
#![cfg_attr(docsrs, feature(doc_cfg))]
#![expect(unsafe_code)]
#![no_std]

extern crate alloc;

pub mod kperf;
pub mod kperfdata;
pub mod load;
