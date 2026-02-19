//! `repr(C)` structs, error codes, and function pointer type aliases for
//! `kperfdata.framework`.
//!
//! This module provides the Kernel Performance Event Programming (KPEP)
//! interface — the layer that sits between the raw KPC hardware registers and
//! human-readable event names like `"INST_RETIRED.ANY"` or `"Cycles"`.
//!
//! # Structs
//!
//! Three opaque-ish C structs form the core of the KPEP API:
//!
//! - [`kpep_db`] (152 bytes) — a parsed PMC event database, opened via [`kpep_db_create`] from the
//!   plist files in `/usr/share/kpep/`. Contains the full catalogue of events the current CPU
//!   supports, queryable by name ([`kpep_db_event`]) or enumerated in bulk ([`kpep_db_events`]).
//!
//! - [`kpep_event`] (56 bytes) — a single PMC event descriptor. Holds the event's name,
//!   description, alias, hardware selector (`number`, `mask`), and whether the event is bound to a
//!   fixed counter. Layout reverse-engineered from `kperfdata.framework` via Ghidra.
//!
//! - [`kpep_config`] (80 bytes) — a mutable configuration builder. Events are added via
//!   [`kpep_config_add_event`], then [`kpep_config_kpc`] and [`kpep_config_kpc_map`] extract the
//!   register values and counter-to-event mapping that
//!   [`kpc_set_config`](crate::kperf::kpc_set_config) expects.
//!
//! All three structs have compile-time layout assertions that verify size,
//! alignment, and field offsets.
//!
//! # VTable
//!
//! Because the framework is private, symbols are not available at link time.
//! [`VTable::load`] resolves all function pointers eagerly from a [`LibraryHandle`] at runtime,
//! failing immediately if any symbol is missing.

#![expect(non_camel_case_types)]
use core::{
    ffi::{c_char, c_int, c_void},
    fmt,
};

use crate::{
    kperf::kpc_config_t,
    load::{LibraryHandle, LibrarySymbol, LoadError},
};

// -----------------------------------------------------------------------------
// KPEP architecture constants
// -----------------------------------------------------------------------------

pub const KPEP_ARCH_I386: u32 = 0;
pub const KPEP_ARCH_X86_64: u32 = 1;
pub const KPEP_ARCH_ARM: u32 = 2;
pub const KPEP_ARCH_ARM64: u32 = 3;

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/// KPEP event (56 bytes on 64-bit).
///
/// Layout reverse-engineered from `kperfdata.framework` via Ghidra
/// disassembly of `_event_init`, `_event_free`, and `_event_cmp`.
#[repr(C)]
#[derive(Debug, Copy, Clone)]
pub struct kpep_event {
    /// Unique name of an event, such as `"INST_RETIRED.ANY"`.
    pub name: *const c_char,
    /// Description for this event.
    pub description: *const c_char,
    /// Errata, currently NULL.
    pub errata: *const c_char,
    /// Alias name, such as `"Instructions"`, `"Cycles"`.
    pub alias: *const c_char,
    /// Fallback event name for fixed counter.
    pub fallback: *const c_char,
    /// Hardware event selector mask.
    pub mask: u32,
    /// Event number (selector value written to the PMC config register).
    pub number: u16,
    /// Whether this event must be placed in a fixed counter.
    pub is_fixed: u8,
    pub _pad0: u8,
    /// Bit 0: fallback event was set during `_event_init`.
    pub flags: u8,
    pub _pad1: [u8; 7],
}

const _: () = {
    assert!(core::mem::size_of::<kpep_event>() == 56);
    assert!(core::mem::align_of::<kpep_event>() == 8);
    assert!(core::mem::offset_of!(kpep_event, name) == 0);
    assert!(core::mem::offset_of!(kpep_event, description) == 8);
    assert!(core::mem::offset_of!(kpep_event, errata) == 16);
    assert!(core::mem::offset_of!(kpep_event, alias) == 24);
    assert!(core::mem::offset_of!(kpep_event, fallback) == 32);
    assert!(core::mem::offset_of!(kpep_event, mask) == 40);
    assert!(core::mem::offset_of!(kpep_event, number) == 44);
    assert!(core::mem::offset_of!(kpep_event, is_fixed) == 46);
    assert!(core::mem::offset_of!(kpep_event, flags) == 48);
};

/// KPEP database (152 bytes on 64-bit).
///
/// Layout reverse-engineered from `kperfdata.framework` via Ghidra
/// disassembly of `_kpep_db_createx`, `_kpep_db_free`, and `_init_db_from_plist`.
#[repr(C)]
#[derive(Debug, Copy, Clone)]
pub struct kpep_db {
    /// Database name from the plist `"name"` key (internal identifier).
    pub name: *const c_char,
    /// CPU identifier string, such as `"cpu_7_8_10b282dc"`.
    pub cpu_id: *const c_char,
    /// Marketing name, such as `"Apple M1"`.
    ///
    /// This is what [`kpep_db_name`] returns.
    pub marketing_name: *const c_char,
    /// Serialized plist in binary format v1.0 (CFDataRef). Created lazily by
    /// `kpep_db_serialize`.
    pub plist_data: *mut c_void,
    /// All events keyed by event name (CFDictionaryRef: `CFString → *mut kpep_event`).
    pub event_map: *mut c_void,
    /// Contiguous event array (`sizeof(kpep_event) * event_count`).
    pub event_arr: *mut kpep_event,
    /// Fixed counter event pointers (`sizeof(kpep_event *) * fixed_counter_count`).
    pub fixed_event_arr: *mut *mut kpep_event,
    /// All aliases keyed by alias name (CFDictionaryRef: `CFString → *mut kpep_event`). Searched
    /// first by [`kpep_db_event`].
    pub alias_map: *mut c_void,
    pub _reserved0: usize,
    pub _reserved1: usize,
    pub _reserved2: usize,
    /// Total number of events in [`event_arr`](kpep_db::event_arr).
    pub event_count: usize,
    pub alias_count: usize,
    /// `popcount(fixed_counter_bits)`.
    pub fixed_counter_count: usize,
    /// `popcount(config_counter_bits)`.
    pub config_counter_count: usize,
    /// `popcount(power_counter_bits)`.
    pub power_counter_count: usize,
    /// See `KPEP_ARCH_*` constants.
    pub archtecture: u32,
    /// Bitmap of available fixed counters.
    pub fixed_counter_bits: u32,
    /// Bitmap of available configurable counters.
    pub config_counter_bits: u32,
    /// Bitmap of available power counters.
    pub power_counter_bits: u32,
    /// Search flags passed to [`kpep_db_createx`].
    pub create_flags: u32,
    /// Whether the database contains Apple-internal events.
    pub is_internal: u8,
    /// Whether [`is_internal`](kpep_db::is_internal) has been populated.
    pub internal_known: u8,
    pub _pad: [u8; 2],
}

const _: () = {
    assert!(core::mem::size_of::<kpep_db>() == 152);
    assert!(core::mem::align_of::<kpep_db>() == 8);
    assert!(core::mem::offset_of!(kpep_db, name) == 0);
    assert!(core::mem::offset_of!(kpep_db, cpu_id) == 8);
    assert!(core::mem::offset_of!(kpep_db, marketing_name) == 16);
    assert!(core::mem::offset_of!(kpep_db, plist_data) == 24);
    assert!(core::mem::offset_of!(kpep_db, event_map) == 32);
    assert!(core::mem::offset_of!(kpep_db, event_arr) == 40);
    assert!(core::mem::offset_of!(kpep_db, fixed_event_arr) == 48);
    assert!(core::mem::offset_of!(kpep_db, alias_map) == 56);
    assert!(core::mem::offset_of!(kpep_db, event_count) == 88);
    assert!(core::mem::offset_of!(kpep_db, alias_count) == 96);
    assert!(core::mem::offset_of!(kpep_db, fixed_counter_count) == 104);
    assert!(core::mem::offset_of!(kpep_db, config_counter_count) == 112);
    assert!(core::mem::offset_of!(kpep_db, power_counter_count) == 120);
    assert!(core::mem::offset_of!(kpep_db, archtecture) == 128);
    assert!(core::mem::offset_of!(kpep_db, fixed_counter_bits) == 132);
    assert!(core::mem::offset_of!(kpep_db, config_counter_bits) == 136);
    assert!(core::mem::offset_of!(kpep_db, power_counter_bits) == 140);
    assert!(core::mem::offset_of!(kpep_db, create_flags) == 144);
    assert!(core::mem::offset_of!(kpep_db, is_internal) == 148);
    assert!(core::mem::offset_of!(kpep_db, internal_known) == 149);
};

/// KPEP config (80 bytes on 64-bit).
#[repr(C)]
#[derive(Debug, Copy, Clone)]
pub struct kpep_config {
    pub db: *mut kpep_db,
    /// Event pointers (`sizeof(kpep_event *) * counter_count`), init NULL.
    pub ev_arr: *mut *mut kpep_event,
    /// Event map (`sizeof(usize) * counter_count`), init 0.
    pub ev_map: *mut usize,
    /// Event indices (`sizeof(usize) * counter_count`), init -1.
    pub ev_idx: *mut usize,
    /// Flags (`sizeof(u32) * counter_count`), init 0.
    pub flags: *mut u32,
    /// KPC periods (`sizeof(u64) * counter_count`), init 0.
    pub kpc_periods: *mut u64,
    /// Number of events, see [`kpep_config_events_count`].
    pub event_count: usize,
    pub counter_count: usize,
    /// See `KPC_CLASS_*` class mask constants.
    pub classes: u32,
    pub config_counter: u32,
    pub power_counter: u32,
    pub reserved: u32,
}

// Layout assertions derived from bindgen.
const _: () = {
    assert!(core::mem::size_of::<kpep_config>() == 80);
    assert!(core::mem::align_of::<kpep_config>() == 8);
    assert!(core::mem::offset_of!(kpep_config, db) == 0);
    assert!(core::mem::offset_of!(kpep_config, ev_arr) == 8);
    assert!(core::mem::offset_of!(kpep_config, ev_map) == 16);
    assert!(core::mem::offset_of!(kpep_config, ev_idx) == 24);
    assert!(core::mem::offset_of!(kpep_config, flags) == 32);
    assert!(core::mem::offset_of!(kpep_config, kpc_periods) == 40);
    assert!(core::mem::offset_of!(kpep_config, event_count) == 48);
    assert!(core::mem::offset_of!(kpep_config, counter_count) == 56);
    assert!(core::mem::offset_of!(kpep_config, classes) == 64);
    assert!(core::mem::offset_of!(kpep_config, config_counter) == 68);
    assert!(core::mem::offset_of!(kpep_config, power_counter) == 72);
    assert!(core::mem::offset_of!(kpep_config, reserved) == 76);
};

// -----------------------------------------------------------------------------
// Error codes
// -----------------------------------------------------------------------------

pub const KPEP_CONFIG_ERROR_NONE: c_int = 0;
pub const KPEP_CONFIG_ERROR_INVALID_ARGUMENT: c_int = 1;
pub const KPEP_CONFIG_ERROR_OUT_OF_MEMORY: c_int = 2;
pub const KPEP_CONFIG_ERROR_IO: c_int = 3;
pub const KPEP_CONFIG_ERROR_BUFFER_TOO_SMALL: c_int = 4;
pub const KPEP_CONFIG_ERROR_CUR_SYSTEM_UNKNOWN: c_int = 5;
pub const KPEP_CONFIG_ERROR_DB_PATH_INVALID: c_int = 6;
pub const KPEP_CONFIG_ERROR_DB_NOT_FOUND: c_int = 7;
pub const KPEP_CONFIG_ERROR_DB_ARCH_UNSUPPORTED: c_int = 8;
pub const KPEP_CONFIG_ERROR_DB_VERSION_UNSUPPORTED: c_int = 9;
pub const KPEP_CONFIG_ERROR_DB_CORRUPT: c_int = 10;
pub const KPEP_CONFIG_ERROR_EVENT_NOT_FOUND: c_int = 11;
pub const KPEP_CONFIG_ERROR_CONFLICTING_EVENTS: c_int = 12;
pub const KPEP_CONFIG_ERROR_COUNTERS_NOT_FORCED: c_int = 13;
pub const KPEP_CONFIG_ERROR_EVENT_UNAVAILABLE: c_int = 14;
pub const KPEP_CONFIG_ERROR_ERRNO: c_int = 15;

// -----------------------------------------------------------------------------
// Function pointer types
// -----------------------------------------------------------------------------

/// Create a config.
///
/// `db` is a kpep db (see [`kpep_db_create`]). `cfg_ptr` receives the new
/// config. Returns 0 on success.
pub type kpep_config_create =
    unsafe extern "C" fn(db: *mut kpep_db, cfg_ptr: *mut *mut kpep_config) -> c_int;

/// Free the config.
pub type kpep_config_free = unsafe extern "C" fn(cfg: *mut kpep_config);

/// Add an event to config.
///
/// `flag`: 0 for all, 1 for user space only. `err` is an optional error bitmap
/// pointer — if the return value is `CONFLICTING_EVENTS`, this bitmap contains
/// the conflicted event indices (e.g. `1 << 2` means index 2). Returns 0 on
/// success.
pub type kpep_config_add_event = unsafe extern "C" fn(
    cfg: *mut kpep_config,
    ev_ptr: *mut *mut kpep_event,
    flag: u32,
    err: *mut u32,
) -> c_int;

/// Remove event at index. Returns 0 on success.
pub type kpep_config_remove_event =
    unsafe extern "C" fn(cfg: *mut kpep_config, idx: usize) -> c_int;

/// Force all counters. Returns 0 on success.
pub type kpep_config_force_counters = unsafe extern "C" fn(cfg: *mut kpep_config) -> c_int;

/// Get events count. Returns 0 on success.
pub type kpep_config_events_count =
    unsafe extern "C" fn(cfg: *mut kpep_config, count_ptr: *mut usize) -> c_int;

/// Get all event pointers.
///
/// `buf` receives event pointers. `buf_size` is the buffer's size in bytes and
/// should be at least `kpep_config_events_count() * sizeof(void *)`. Returns 0
/// on success.
pub type kpep_config_events = unsafe extern "C" fn(
    cfg: *mut kpep_config,
    buf: *mut *mut kpep_event,
    buf_size: usize,
) -> c_int;

/// Get kpc register configs.
///
/// `buf` receives kpc register configs. `buf_size` is the buffer's size in
/// bytes and should be at least `kpep_config_kpc_count() *
/// sizeof(kpc_config_t)`. Returns 0 on success.
pub type kpep_config_kpc =
    unsafe extern "C" fn(cfg: *mut kpep_config, buf: *mut kpc_config_t, buf_size: usize) -> c_int;

/// Get kpc register config count. Returns 0 on success.
pub type kpep_config_kpc_count =
    unsafe extern "C" fn(cfg: *mut kpep_config, count_ptr: *mut usize) -> c_int;

/// Get kpc classes. `classes_ptr` receives the class mask (see `KPC_CLASS_*`
/// constants). Returns 0 on success.
pub type kpep_config_kpc_classes =
    unsafe extern "C" fn(cfg: *mut kpep_config, classes_ptr: *mut u32) -> c_int;

/// Get the index mapping from event to counter.
///
/// `buf` receives indexes. `buf_size` is the buffer's size in bytes and should
/// be at least `kpep_config_events_count() * sizeof(usize)`. Returns 0 on
/// success.
pub type kpep_config_kpc_map =
    unsafe extern "C" fn(cfg: *mut kpep_config, buf: *mut usize, buf_size: usize) -> c_int;

/// Open a kpep database file in `/usr/share/kpep/` or `/usr/local/share/kpep/`.
///
/// `name` is the file name, for example `"haswell"` or
/// `"cpu_100000c_1_92fb37c8"`. Pass NULL for the current CPU. Returns 0 on
/// success.
pub type kpep_db_create =
    unsafe extern "C" fn(name: *const c_char, db_ptr: *mut *mut kpep_db) -> c_int;

/// Free the kpep database.
pub type kpep_db_free = unsafe extern "C" fn(db: *mut kpep_db);

/// Get the database's name. Returns 0 on success.
pub type kpep_db_name = unsafe extern "C" fn(db: *mut kpep_db, name: *mut *const c_char) -> c_int;

/// Get the event alias count. Returns 0 on success.
pub type kpep_db_aliases_count = unsafe extern "C" fn(db: *mut kpep_db, count: *mut usize) -> c_int;

/// Get all aliases.
///
/// `buf` receives alias strings. `buf_size` is the buffer's size in bytes and
/// should be at least `kpep_db_aliases_count() * sizeof(void *)`. Returns 0 on
/// success.
pub type kpep_db_aliases =
    unsafe extern "C" fn(db: *mut kpep_db, buf: *mut *const c_char, buf_size: usize) -> c_int;

/// Get counters count for given classes.
///
/// `classes`: 1 for fixed, 2 for configurable. Returns 0 on success.
pub type kpep_db_counters_count =
    unsafe extern "C" fn(db: *mut kpep_db, classes: u8, count: *mut usize) -> c_int;

/// Get all event count. Returns 0 on success.
pub type kpep_db_events_count = unsafe extern "C" fn(db: *mut kpep_db, count: *mut usize) -> c_int;

/// Get all events.
///
/// `buf` receives event pointers. `buf_size` is the buffer's size in bytes and
/// should be at least `kpep_db_events_count() * sizeof(void *)`. Returns 0 on
/// success.
pub type kpep_db_events =
    unsafe extern "C" fn(db: *mut kpep_db, buf: *mut *mut kpep_event, buf_size: usize) -> c_int;

/// Get one event by name. Returns 0 on success.
pub type kpep_db_event = unsafe extern "C" fn(
    db: *mut kpep_db,
    name: *const c_char,
    ev_ptr: *mut *mut kpep_event,
) -> c_int;

/// Get event's name. Returns 0 on success.
pub type kpep_event_name =
    unsafe extern "C" fn(ev: *mut kpep_event, name_ptr: *mut *const c_char) -> c_int;

/// Get event's alias. Returns 0 on success.
pub type kpep_event_alias =
    unsafe extern "C" fn(ev: *mut kpep_event, alias_ptr: *mut *const c_char) -> c_int;

/// Get event's description. Returns 0 on success.
pub type kpep_event_description =
    unsafe extern "C" fn(ev: *mut kpep_event, str_ptr: *mut *const c_char) -> c_int;

// -----------------------------------------------------------------------------
// VTable
// -----------------------------------------------------------------------------

macro_rules! load_sym {
    ($handle:expr, $name:ident, $cname:expr) => {{
        // SAFETY: the symbol is a function pointer with the signature declared
        // by the corresponding type alias.
        unsafe { core::mem::transmute::<LibrarySymbol, $name>($handle.symbol($cname)?) }
    }};
}

/// Resolved function pointers for `kperfdata.framework`.
///
/// All entries are resolved eagerly by [`load`](Self::load) when the framework
/// is first opened. These functions manage the KPEP event database and
/// configuration — looking up events by name, building register configs, and
/// querying the counter-to-event mapping.
pub struct VTable {
    pub kpep_config_create: kpep_config_create,
    pub kpep_config_free: kpep_config_free,
    pub kpep_config_add_event: kpep_config_add_event,
    pub kpep_config_remove_event: kpep_config_remove_event,
    pub kpep_config_force_counters: kpep_config_force_counters,
    pub kpep_config_events_count: kpep_config_events_count,
    pub kpep_config_events: kpep_config_events,
    pub kpep_config_kpc: kpep_config_kpc,
    pub kpep_config_kpc_count: kpep_config_kpc_count,
    pub kpep_config_kpc_classes: kpep_config_kpc_classes,
    pub kpep_config_kpc_map: kpep_config_kpc_map,
    pub kpep_db_create: kpep_db_create,
    pub kpep_db_free: kpep_db_free,
    pub kpep_db_name: kpep_db_name,
    pub kpep_db_aliases_count: kpep_db_aliases_count,
    pub kpep_db_aliases: kpep_db_aliases,
    pub kpep_db_counters_count: kpep_db_counters_count,
    pub kpep_db_events_count: kpep_db_events_count,
    pub kpep_db_events: kpep_db_events,
    pub kpep_db_event: kpep_db_event,
    pub kpep_event_name: kpep_event_name,
    pub kpep_event_alias: kpep_event_alias,
    pub kpep_event_description: kpep_event_description,
}

impl fmt::Debug for VTable {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("VTable").finish_non_exhaustive()
    }
}

impl VTable {
    pub fn load(handle: &LibraryHandle) -> Result<Self, LoadError> {
        Ok(Self {
            kpep_config_create: load_sym!(handle, kpep_config_create, c"kpep_config_create"),
            kpep_config_free: load_sym!(handle, kpep_config_free, c"kpep_config_free"),
            kpep_config_add_event: load_sym!(
                handle,
                kpep_config_add_event,
                c"kpep_config_add_event"
            ),
            kpep_config_remove_event: load_sym!(
                handle,
                kpep_config_remove_event,
                c"kpep_config_remove_event"
            ),
            kpep_config_force_counters: load_sym!(
                handle,
                kpep_config_force_counters,
                c"kpep_config_force_counters"
            ),
            kpep_config_events_count: load_sym!(
                handle,
                kpep_config_events_count,
                c"kpep_config_events_count"
            ),
            kpep_config_events: load_sym!(handle, kpep_config_events, c"kpep_config_events"),
            kpep_config_kpc: load_sym!(handle, kpep_config_kpc, c"kpep_config_kpc"),
            kpep_config_kpc_count: load_sym!(
                handle,
                kpep_config_kpc_count,
                c"kpep_config_kpc_count"
            ),
            kpep_config_kpc_classes: load_sym!(
                handle,
                kpep_config_kpc_classes,
                c"kpep_config_kpc_classes"
            ),
            kpep_config_kpc_map: load_sym!(handle, kpep_config_kpc_map, c"kpep_config_kpc_map"),
            kpep_db_create: load_sym!(handle, kpep_db_create, c"kpep_db_create"),
            kpep_db_free: load_sym!(handle, kpep_db_free, c"kpep_db_free"),
            kpep_db_name: load_sym!(handle, kpep_db_name, c"kpep_db_name"),
            kpep_db_aliases_count: load_sym!(
                handle,
                kpep_db_aliases_count,
                c"kpep_db_aliases_count"
            ),
            kpep_db_aliases: load_sym!(handle, kpep_db_aliases, c"kpep_db_aliases"),
            kpep_db_counters_count: load_sym!(
                handle,
                kpep_db_counters_count,
                c"kpep_db_counters_count"
            ),
            kpep_db_events_count: load_sym!(handle, kpep_db_events_count, c"kpep_db_events_count"),
            kpep_db_events: load_sym!(handle, kpep_db_events, c"kpep_db_events"),
            kpep_db_event: load_sym!(handle, kpep_db_event, c"kpep_db_event"),
            kpep_event_name: load_sym!(handle, kpep_event_name, c"kpep_event_name"),
            kpep_event_alias: load_sym!(handle, kpep_event_alias, c"kpep_event_alias"),
            kpep_event_description: load_sym!(
                handle,
                kpep_event_description,
                c"kpep_event_description"
            ),
        })
    }
}
