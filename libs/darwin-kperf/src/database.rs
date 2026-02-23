//! Safe read-only view of the PMC event database.
//!
//! Each Apple Silicon CPU has a corresponding plist file in `/usr/share/kpep/`
//! that catalogues every hardware event the chip supports: event names, hardware
//! selectors, fixed-counter assignments, and human-readable aliases like
//! `"Instructions"` or `"Cycles"`. The `kperfdata.framework` parses these plists
//! into an in-memory `kpep_db`, and this module wraps that allocation with a
//! safe, borrowing API.
//!
//! You get a [`Database`] by calling [`Sampler::database`](crate::Sampler::database).
//! It borrows the `Sampler`'s lifetime, so the underlying database memory is
//! freed when the `Sampler` is dropped. From there you can inspect the full
//! event list, query fixed-counter events, or read database metadata like the
//! CPU identifier and marketing name.
//!
//! ```rust,ignore
//! let sampler = Sampler::new()?;
//! let db = sampler.database();
//!
//! for event in db.events() {
//!     if let Some(alias) = event.alias() {
//!         println!("{}: {}", event.name(), alias);
//!     }
//! }
//! ```

use core::{
    ffi::{CStr, c_char},
    marker::PhantomData,
    ptr::NonNull,
};

use darwin_kperf_sys::kperfdata::{
    KPEP_ARCH_ARM, KPEP_ARCH_ARM64, KPEP_ARCH_I386, KPEP_ARCH_X86_64, kpep_event,
};

use crate::event::Cpu;

/// Reads a non-null `*const c_char` as a `&str`.
///
/// # Safety
///
/// `field` must be non-null, point to a valid NUL-terminated C string whose
/// bytes are valid UTF-8, and the backing memory must remain alive and
/// unmodified for at least `'db`.
const unsafe fn as_str<'db>(field: *const c_char) -> &'db str {
    assert!(!field.is_null());

    // SAFETY: caller guarantees `field` is non-null and NUL-terminated.
    let str = unsafe { CStr::from_ptr(field).to_str() };

    match str {
        Ok(str) => str,
        Err(_) => panic!("string is not utf-8"),
    }
}

/// Reads a possibly-null `*const c_char` as an `Option<&str>`.
///
/// # Safety
///
/// If `field` is non-null, it must point to a valid NUL-terminated C string
/// whose bytes are valid UTF-8, and the backing memory must remain alive and
/// unmodified for at least `'db`.
const unsafe fn as_opt_str<'db>(field: *const c_char) -> Option<&'db str> {
    if field.is_null() {
        return None;
    }

    // SAFETY: we just checked for null; caller guarantees validity otherwise.
    let str = unsafe { CStr::from_ptr(field).to_str() };

    match str {
        Ok(str) => Some(str),
        Err(_) => panic!("string is not utf-8"),
    }
}

/// CPU architecture reported by the PMC database.
///
/// Mirrors the `KPEP_ARCH_*` constants from `kperfdata.framework`. Includes
/// non-Apple-Silicon values because the database format predates the ARM
/// transition.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum Architecture {
    /// 32-bit x86 (`IA-32`).
    I386,
    /// 64-bit x86 (`x86_64` / `AMD64`).
    X86_64,
    /// 32-bit ARM.
    Arm,
    /// 64-bit ARM (`AArch64`).
    Arm64,
}

impl Architecture {
    const fn from_sys(value: u32) -> Self {
        match value {
            KPEP_ARCH_I386 => Self::I386,
            KPEP_ARCH_X86_64 => Self::X86_64,
            KPEP_ARCH_ARM => Self::Arm,
            KPEP_ARCH_ARM64 => Self::Arm64,
            _ => unreachable!(), // unknown architecture
        }
    }
}

/// Safe, read-only view of a `kpep_db` opened by the framework.
///
/// Each database describes every PMC event that a specific Apple Silicon CPU
/// supports. The `'db` lifetime is tied to the framework-allocated database;
/// all string and event pointers inside the database remain valid for this
/// lifetime.
pub struct Database<'db> {
    inner: &'db darwin_kperf_sys::kperfdata::kpep_db,
}

impl<'db> Database<'db> {
    /// Wraps a framework-allocated `kpep_db`.
    ///
    /// # Safety
    ///
    /// The `kpep_db` must have been created by `kpep_db_create` and must
    /// remain alive and unmodified for `'db`.
    pub(crate) const unsafe fn from_raw(db: &'db darwin_kperf_sys::kperfdata::kpep_db) -> Self {
        Self { inner: db }
    }

    /// Returns a non-null pointer to the underlying `kpep_db`.
    ///
    /// This is useful if you need to call `kperfdata.framework` functions
    /// directly through the [`VTable`](darwin_kperf_sys::kperfdata::VTable).
    ///
    /// # Safety
    ///
    /// The returned pointer borrows the database. The caller must not mutate
    /// it, free it, or use it after the [`Database`]'s lifetime has expired.
    #[must_use]
    pub const unsafe fn as_raw(&self) -> NonNull<darwin_kperf_sys::kperfdata::kpep_db> {
        NonNull::from_ref(self.inner)
    }

    /// Database name, e.g. `"a14"`, `"as4"`.
    #[must_use]
    pub const fn name(&self) -> &'db str {
        // SAFETY: the framework guarantees `kpep_db.name` is a non-null,
        // NUL-terminated C string that lives as long as the database.
        unsafe { as_str(self.inner.name) }
    }

    /// Plist CPU identifier, e.g. `"cpu_7_8_10b282dc"`.
    #[must_use]
    pub const fn cpu_id(&self) -> &'db str {
        // SAFETY: same as `name`, framework-owned, NUL-terminated, valid for 'db.
        unsafe { as_str(self.inner.cpu_id) }
    }

    /// The `Cpu` corresponding to this database.
    #[must_use]
    pub const fn cpu(&self) -> Option<Cpu> {
        Cpu::from_db_name(self.name())
    }

    /// Marketing name, e.g. `"Apple A14/M1"`.
    #[must_use]
    pub const fn marketing_name(&self) -> &'db str {
        // SAFETY: same as `name`, framework-owned, NUL-terminated, valid for 'db.
        unsafe { as_str(self.inner.marketing_name) }
    }

    /// All events in the database.
    #[must_use]
    pub const fn events(&self) -> &'db [DatabaseEvent<'db>] {
        if self.inner.event_arr.is_null() {
            return &[];
        }

        // SAFETY:
        // - `event_arr` is a contiguous buffer of `event_count` `kpep_event` structs.
        // - `DatabaseEvent` is `#[repr(transparent)]` over `kpep_event`, so the slice
        //   reinterpretation is layout-compatible.
        // - The framework guarantees the buffer is properly aligned and lives for `'db`.
        // - The buffer is not mutated for `'db`.
        unsafe { core::slice::from_raw_parts(self.inner.event_arr.cast(), self.inner.event_count) }
    }

    /// Events assigned to fixed counter registers.
    ///
    /// Each element is a reference into the [`events`](Self::events) array.
    #[must_use]
    pub const fn fixed_events(&self) -> &'db [&'db DatabaseEvent<'db>] {
        if self.inner.fixed_event_arr.is_null() {
            return &[];
        }

        // SAFETY:
        // - `fixed_event_arr` points to `fixed_counter_count` contiguous `*mut kpep_event` values,
        //   each pointing into `event_arr`.
        // - `DatabaseEvent` is `#[repr(transparent)]` over `kpep_event`, so `&DatabaseEvent` has
        //   the same representation as `&kpep_event`, which has the same representation as `*const
        //   kpep_event`.
        // - The framework guarantees all pointers are non-null, properly aligned, and point to
        //   valid events that live for `'db`.
        // - The pointed-to events are not mutated for `'db`, satisfying Rust's shared-reference
        //   aliasing rules.
        unsafe {
            core::slice::from_raw_parts(
                self.inner.fixed_event_arr.cast(),
                self.inner.fixed_counter_count,
            )
        }
    }

    /// The CPU architecture this database targets.
    #[must_use]
    pub const fn architecture(&self) -> Architecture {
        Architecture::from_sys(self.inner.archtecture)
    }
}

/// A single hardware performance counter event from the PMC database.
///
/// Each event describes one thing the CPU can count: retired instructions,
/// cache misses, branch mispredictions, micro-ops, and so on. The [`name`](Self::name)
/// is the hardware-specific identifier (e.g. `"INST_ALL"`), while
/// [`alias`](Self::alias) provides a human-readable label when one exists
/// (e.g. `"Instructions"`).
#[derive(Debug, Copy, Clone)]
#[repr(transparent)]
pub struct DatabaseEvent<'db> {
    event: kpep_event,
    _marker: PhantomData<&'db ()>,
}

impl<'db> DatabaseEvent<'db> {
    /// Unique event name, e.g. `"INST_ALL"`.
    #[must_use]
    pub const fn name(&self) -> &'db str {
        // SAFETY: framework-owned, NUL-terminated, valid for 'db.
        unsafe { as_str(self.event.name) }
    }

    /// Human-readable description, if available.
    #[must_use]
    pub const fn description(&self) -> Option<&'db str> {
        // SAFETY: null indicates absence; otherwise same validity as `name`.
        unsafe { as_opt_str(self.event.description) }
    }

    /// Errata notes, if any.
    #[must_use]
    pub const fn errata(&self) -> Option<&'db str> {
        // SAFETY: null indicates absence; otherwise same validity as `name`.
        unsafe { as_opt_str(self.event.errata) }
    }

    /// Human-readable alias, e.g. `"Instructions"`, `"Cycles"`.
    #[must_use]
    pub const fn alias(&self) -> Option<&'db str> {
        // SAFETY: null indicates absence; otherwise same validity as `name`.
        unsafe { as_opt_str(self.event.alias) }
    }

    /// Fallback event name for fixed counters.
    #[must_use]
    pub const fn fallback(&self) -> Option<&'db str> {
        // SAFETY: null indicates absence; otherwise same validity as `name`.
        unsafe { as_opt_str(self.event.fallback) }
    }

    /// Whether this event is bound to a fixed counter register.
    ///
    /// The framework sets bit 0 of the event's `flags` field during
    /// `_event_init` when the plist contains a `"fixed_counter"` key.
    #[must_use]
    pub const fn is_fixed(&self) -> bool {
        self.event.flags & 1 != 0
    }
}
