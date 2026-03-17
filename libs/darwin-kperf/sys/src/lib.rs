//! Raw FFI bindings for Apple's private `kperf.framework` and `kperfdata.framework`.
//!
//! Low-level, `#![no_std]` bindings to the two private macOS frameworks behind
//! hardware performance monitoring counters (PMCs). The safe [`darwin-kperf`]
//! crate is built on top of these.
//!
//! # ⚠️ Experimental
//!
//! These frameworks are not part of any public SDK. Apple may change struct
//! layouts, function signatures, or remove symbols entirely in any macOS
//! update. The `repr(C)` structs in this crate have compile-time layout
//! assertions, but those only validate the macOS version you build against.
//!
//! # Frameworks
//!
//! **`kperf.framework`** contains the Kernel Performance Counter (KPC) and
//! Kernel Performance (KPERF) interfaces. KPC functions configure which counter
//! classes are active, program hardware register values, and read back
//! per-thread or per-CPU counter accumulations. KPERF functions manage the
//! sampling subsystem: actions, timers, and trigger-based profiling. All of
//! these are thin wrappers around `sysctl` calls into the XNU kernel. See the
//! [`kperf`] module.
//!
//! **`kperfdata.framework`** contains the Kernel Performance Event Programming
//! (KPEP) interface. KPEP manages the PMC event database: the plist files
//! shipped in `/usr/share/kpep/` that describe every hardware event a given CPU
//! supports. It provides functions to open a database for the current CPU, look
//! up events by name or alias, and build the register configuration that KPC
//! expects. See the [`kperfdata`] module.
//!
//! # Runtime loading
//!
//! These frameworks are private, have no public headers, and no stable ABI, so
//! this crate loads them at runtime via `dlopen(3)` / `dlsym(3)` rather than
//! linking against them directly. Runtime loading also lets callers provide
//! alternative framework paths if needed. Each function pointer is resolved
//! into a [`VTable`](kperf::VTable). The [`load`] module provides the
//! underlying [`LibraryHandle`](load::LibraryHandle) and
//! [`LibrarySymbol`](load::LibrarySymbol) primitives, with no dependency on
//! `libc` or `libloading`. Resolution is all-or-nothing: if any symbol is
//! missing, loading fails with a [`LoadError`](load::LoadError).
//!
//! # Platform
//!
//! macOS only (`x86_64` and `aarch64`). Root privileges are required to
//! force-acquire counters and read thread-level PMC values.
//!
//! # Safety
//!
//! Everything in this crate is `unsafe`. The function pointer type aliases
//! describe C calling conventions with raw pointers, and the `repr(C)` structs
//! mirror kernel data structures whose layout Apple does not guarantee. Callers
//! must uphold the documented preconditions for every FFI call: buffer sizes,
//! pointer validity, and thread-safety constraints.
//!
//! For a safe interface, use [`darwin-kperf`] instead.
//!
//! # References
//!
//! API surface and struct layouts are derived from [ibireme's
//! `kpc_demo.c`][kpc-demo], a standalone C program that demonstrates the full
//! KPC/KPEP workflow on Apple Silicon.
//!
//! [`darwin-kperf`]: https://docs.rs/darwin-kperf
//! [kpc-demo]: https://gist.github.com/ibireme/173517c208c7dc333ba962c1f0d67d12
#![cfg(target_os = "macos")]
#![cfg_attr(docsrs, feature(doc_cfg))]
#![expect(unsafe_code)]
#![no_std]

extern crate alloc;

pub mod kperf;
pub mod kperfdata;
pub mod load;
