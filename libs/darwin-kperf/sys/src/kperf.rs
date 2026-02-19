//! Types, constants, and function pointer type aliases for `kperf.framework`.
//!
//! This module covers two subsystems that live inside the same framework:
//!
//! - **KPC** (Kernel Performance Counters) — configuring which counter classes are active
//!   ([`kpc_set_counting`]), programming hardware register values ([`kpc_set_config`]), and reading
//!   back counter accumulations per-thread or per-CPU ([`kpc_get_thread_counters`],
//!   [`kpc_get_cpu_counters`]).
//!
//! - **KPERF** (Kernel Performance) — the sampling subsystem that fires actions on timer triggers,
//!   enabling continuous profiling with configurable sample sources ([`kperf_action_samplers_set`],
//!   [`kperf_timer_period_set`]).
//!
//! Every KPC and KPERF function is a thin wrapper around a `sysctl` call into
//! the XNU kernel. The specific `sysctl` node is noted in each type alias's
//! documentation.
//!
//! # VTable
//!
//! Because the framework is private, symbols are not available at link time.
//! [`VTable::load`] resolves all function pointers eagerly from a [`LibraryHandle`] at runtime,
//! failing immediately if any symbol is missing.

#![expect(non_camel_case_types)]
use core::{
    ffi::{c_char, c_int},
    fmt,
};

use crate::load::{LibraryHandle, LibrarySymbol, LoadError};

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

pub type kpc_config_t = u64;

// -----------------------------------------------------------------------------
// KPC class constants
// -----------------------------------------------------------------------------

pub const KPC_CLASS_FIXED: u32 = 0;
pub const KPC_CLASS_CONFIGURABLE: u32 = 1;
pub const KPC_CLASS_POWER: u32 = 2;
pub const KPC_CLASS_RAWPMU: u32 = 3;

pub const KPC_CLASS_FIXED_MASK: u32 = 1 << KPC_CLASS_FIXED;
pub const KPC_CLASS_CONFIGURABLE_MASK: u32 = 1 << KPC_CLASS_CONFIGURABLE;
pub const KPC_CLASS_POWER_MASK: u32 = 1 << KPC_CLASS_POWER;
pub const KPC_CLASS_RAWPMU_MASK: u32 = 1 << KPC_CLASS_RAWPMU;

// -----------------------------------------------------------------------------
// PMU version constants
// -----------------------------------------------------------------------------

pub const KPC_PMU_ERROR: u32 = 0;
pub const KPC_PMU_INTEL_V3: u32 = 1;
pub const KPC_PMU_ARM_APPLE: u32 = 2;
pub const KPC_PMU_INTEL_V2: u32 = 3;
pub const KPC_PMU_ARM_V2: u32 = 4;

pub const KPC_MAX_COUNTERS: usize = 32;

// -----------------------------------------------------------------------------
// kperf sampler constants
// -----------------------------------------------------------------------------

pub const KPERF_SAMPLER_TH_INFO: u32 = 1 << 0;
pub const KPERF_SAMPLER_TH_SNAPSHOT: u32 = 1 << 1;
pub const KPERF_SAMPLER_KSTACK: u32 = 1 << 2;
pub const KPERF_SAMPLER_USTACK: u32 = 1 << 3;
pub const KPERF_SAMPLER_PMC_THREAD: u32 = 1 << 4;
pub const KPERF_SAMPLER_PMC_CPU: u32 = 1 << 5;
pub const KPERF_SAMPLER_PMC_CONFIG: u32 = 1 << 6;
pub const KPERF_SAMPLER_MEMINFO: u32 = 1 << 7;
pub const KPERF_SAMPLER_TH_SCHEDULING: u32 = 1 << 8;
pub const KPERF_SAMPLER_TH_DISPATCH: u32 = 1 << 9;
pub const KPERF_SAMPLER_TK_SNAPSHOT: u32 = 1 << 10;
pub const KPERF_SAMPLER_SYS_MEM: u32 = 1 << 11;
pub const KPERF_SAMPLER_TH_INSCYC: u32 = 1 << 12;
pub const KPERF_SAMPLER_TK_INFO: u32 = 1 << 13;

pub const KPERF_ACTION_MAX: u32 = 32;
pub const KPERF_TIMER_MAX: u32 = 8;

// -----------------------------------------------------------------------------
// Function pointer types
// -----------------------------------------------------------------------------

/// Prints the current CPU identification string to the buffer (same as `snprintf`),
/// such as `"cpu_7_8_10b282dc_46"`. This string can be used to locate the PMC
/// database in `/usr/share/kpep`.
///
/// Returns the string's length, or a negative value if an error occurs.
///
/// This method does not require root privileges.
///
/// Reads `hw.cputype`, `hw.cpusubtype`, `hw.cpufamily`, and `machdep.cpu.model`
/// via sysctl.
pub type kpc_cpu_string = unsafe extern "C" fn(buf: *mut c_char, buf_size: usize) -> c_int;

/// Gets the version of KPC that's being run.
///
/// Returns one of the `KPC_PMU_*` version constants.
///
/// Reads `kpc.pmu_version` via sysctl.
pub type kpc_pmu_version = unsafe extern "C" fn() -> u32;

/// Gets running PMC classes.
///
/// Returns a combination of `KPC_CLASS_*_MASK` constants, or 0 if an error
/// occurs or no class is set.
///
/// Reads `kpc.counting` via sysctl.
pub type kpc_get_counting = unsafe extern "C" fn() -> u32;

/// Sets PMC classes to enable counting.
///
/// `classes` is a combination of `KPC_CLASS_*_MASK` constants; pass 0 to
/// shut down counting.
///
/// Returns 0 for success.
///
/// Writes `kpc.counting` via sysctl.
pub type kpc_set_counting = unsafe extern "C" fn(classes: u32) -> c_int;

/// Gets running PMC classes for the current thread.
///
/// Returns a combination of `KPC_CLASS_*_MASK` constants, or 0 if an error
/// occurs or no class is set.
///
/// Reads `kpc.thread_counting` via sysctl.
pub type kpc_get_thread_counting = unsafe extern "C" fn() -> u32;

/// Sets PMC classes to enable counting for the current thread.
///
/// `classes` is a combination of `KPC_CLASS_*_MASK` constants; pass 0 to
/// shut down counting.
///
/// Returns 0 for success.
///
/// Writes `kpc.thread_counting` via sysctl.
pub type kpc_set_thread_counting = unsafe extern "C" fn(classes: u32) -> c_int;

/// Gets how many config registers there are for a given mask.
///
/// For example, Intel may return 1 for [`KPC_CLASS_FIXED_MASK`] and 4 for
/// [`KPC_CLASS_CONFIGURABLE_MASK`].
///
/// `classes` is a combination of `KPC_CLASS_*_MASK` constants.
///
/// Returns 0 if an error occurs or no class is set.
///
/// This method does not require root privileges.
///
/// Reads `kpc.config_count` via sysctl.
pub type kpc_get_config_count = unsafe extern "C" fn(classes: u32) -> u32;

/// Gets how many counters there are for a given mask.
///
/// For example, Intel may return 3 for [`KPC_CLASS_FIXED_MASK`] and 4 for
/// [`KPC_CLASS_CONFIGURABLE_MASK`].
///
/// `classes` is a combination of `KPC_CLASS_*_MASK` constants.
///
/// This method does not require root privileges.
///
/// Reads `kpc.counter_count` via sysctl.
pub type kpc_get_counter_count = unsafe extern "C" fn(classes: u32) -> u32;

/// Gets config registers.
///
/// `config` is a buffer to receive values; it should be at least
/// `kpc_get_config_count(classes) * size_of::<KpcConfig>()` bytes.
///
/// Returns 0 for success.
///
/// Reads `kpc.config_count` and `kpc.config` via sysctl.
pub type kpc_get_config = unsafe extern "C" fn(classes: u32, config: *mut kpc_config_t) -> c_int;

/// Sets config registers.
///
/// `config` is a buffer of values; it should be at least
/// `kpc_get_config_count(classes) * size_of::<KpcConfig>()` bytes.
///
/// Returns 0 for success.
///
/// Reads `kpc.config_count` and writes `kpc.config` via sysctl.
pub type kpc_set_config = unsafe extern "C" fn(classes: u32, config: *mut kpc_config_t) -> c_int;

/// Gets counter accumulations.
///
/// If `all_cpus` is true, the buffer element count should be at least
/// `cpu_count * counter_count`. Otherwise, it should be at least `counter_count`.
///
/// See [`kpc_get_counter_count`].
///
/// - `all_cpus` — `true` for all CPUs, `false` for the current CPU.
/// - `classes` — a combination of `KPC_CLASS_*_MASK` constants.
/// - `curcpu` — pointer to receive the current CPU id; may be null.
/// - `buf` — buffer to receive counter values.
///
/// Returns 0 for success.
///
/// Reads `hw.ncpu`, `kpc.counter_count`, and `kpc.counters` via sysctl.
pub type kpc_get_cpu_counters =
    unsafe extern "C" fn(all_cpus: bool, classes: u32, curcpu: *mut c_int, buf: *mut u64) -> c_int;

/// Gets counter accumulations for the current thread.
///
/// - `tid` — thread id, should be 0.
/// - `buf_count` — number of elements in `buf` (not bytes); should be at least
///   `kpc_get_counter_count()`.
/// - `buf` — buffer to receive counter values.
///
/// Returns 0 for success.
///
/// Reads `kpc.thread_counters` via sysctl.
pub type kpc_get_thread_counters =
    unsafe extern "C" fn(tid: u32, buf_count: u32, buf: *mut u64) -> c_int;

/// Acquires or releases the counters used by the Power Manager.
///
/// `val` — 1 to acquire, 0 to release.
///
/// Returns 0 for success.
///
/// Writes `kpc.force_all_ctrs` via sysctl.
pub type kpc_force_all_ctrs_set = unsafe extern "C" fn(val: c_int) -> c_int;

/// Gets the state of `force_all_ctrs`.
///
/// Returns 0 for success.
///
/// Reads `kpc.force_all_ctrs` via sysctl.
pub type kpc_force_all_ctrs_get = unsafe extern "C" fn(val_out: *mut c_int) -> c_int;

/// Sets the number of actions. Should be [`KPERF_ACTION_MAX`].
///
/// Writes `kperf.action.count` via sysctl.
pub type kperf_action_count_set = unsafe extern "C" fn(count: u32) -> c_int;

/// Gets the number of actions.
///
/// Reads `kperf.action.count` via sysctl.
pub type kperf_action_count_get = unsafe extern "C" fn(count: *mut u32) -> c_int;

/// Sets what to sample when a trigger fires an action, e.g.
/// [`KPERF_SAMPLER_PMC_CPU`].
///
/// Writes `kperf.action.samplers` via sysctl.
pub type kperf_action_samplers_set = unsafe extern "C" fn(actionid: u32, sample: u32) -> c_int;

/// Gets what to sample when a trigger fires an action.
///
/// Reads `kperf.action.samplers` via sysctl.
pub type kperf_action_samplers_get = unsafe extern "C" fn(actionid: u32, sample: *mut u32) -> c_int;

/// Applies a task filter to the action. Pass -1 to disable the filter.
///
/// Writes `kperf.action.filter_by_task` via sysctl.
pub type kperf_action_filter_set_by_task = unsafe extern "C" fn(actionid: u32, port: i32) -> c_int;

/// Applies a pid filter to the action. Pass -1 to disable the filter.
///
/// Writes `kperf.action.filter_by_pid` via sysctl.
pub type kperf_action_filter_set_by_pid = unsafe extern "C" fn(actionid: u32, pid: i32) -> c_int;

/// Sets the number of time triggers. Should be [`KPERF_TIMER_MAX`].
///
/// Writes `kperf.timer.count` via sysctl.
pub type kperf_timer_count_set = unsafe extern "C" fn(count: u32) -> c_int;

/// Gets the number of time triggers.
///
/// Reads `kperf.timer.count` via sysctl.
pub type kperf_timer_count_get = unsafe extern "C" fn(count: *mut u32) -> c_int;

/// Sets timer number and period.
///
/// Writes `kperf.timer.period` via sysctl.
pub type kperf_timer_period_set = unsafe extern "C" fn(actionid: u32, tick: u64) -> c_int;

/// Gets timer number and period.
///
/// Reads `kperf.timer.period` via sysctl.
pub type kperf_timer_period_get = unsafe extern "C" fn(actionid: u32, tick: *mut u64) -> c_int;

/// Sets timer number and action id.
///
/// Writes `kperf.timer.action` via sysctl.
pub type kperf_timer_action_set = unsafe extern "C" fn(actionid: u32, timerid: u32) -> c_int;

/// Gets timer number and action id.
///
/// Reads `kperf.timer.action` via sysctl.
pub type kperf_timer_action_get = unsafe extern "C" fn(actionid: u32, timerid: *mut u32) -> c_int;

/// Sets which timer ID does PET (Profile Every Thread).
///
/// Writes `kperf.timer.pet_timer` via sysctl.
pub type kperf_timer_pet_set = unsafe extern "C" fn(timerid: u32) -> c_int;

/// Gets which timer ID does PET (Profile Every Thread).
///
/// Reads `kperf.timer.pet_timer` via sysctl.
pub type kperf_timer_pet_get = unsafe extern "C" fn(timerid: *mut u32) -> c_int;

/// Enables or disables sampling.
///
/// Writes `kperf.sampling` via sysctl.
pub type kperf_sample_set = unsafe extern "C" fn(enabled: u32) -> c_int;

/// Gets whether sampling is currently active.
///
/// Reads `kperf.sampling` via sysctl.
pub type kperf_sample_get = unsafe extern "C" fn(enabled: *mut u32) -> c_int;

/// Resets kperf: stops sampling, kdebug, timers, and actions.
///
/// Returns 0 for success.
pub type kperf_reset = unsafe extern "C" fn() -> c_int;

/// Converts nanoseconds to CPU ticks.
pub type kperf_ns_to_ticks = unsafe extern "C" fn(ns: u64) -> u64;

/// Converts CPU ticks to nanoseconds.
pub type kperf_ticks_to_ns = unsafe extern "C" fn(ticks: u64) -> u64;

/// Gets the CPU tick frequency (`mach_absolute_time`).
pub type kperf_tick_frequency = unsafe extern "C" fn() -> u64;

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

/// Resolved function pointers for `kperf.framework`.
///
/// All entries are resolved eagerly by [`load`](Self::load) when the framework
/// is first opened. The functions are thin wrappers around `sysctl` calls into
/// the XNU kernel.
pub struct VTable {
    pub kpc_cpu_string: kpc_cpu_string,
    pub kpc_pmu_version: kpc_pmu_version,
    pub kpc_get_counting: kpc_get_counting,
    pub kpc_set_counting: kpc_set_counting,
    pub kpc_get_thread_counting: kpc_get_thread_counting,
    pub kpc_set_thread_counting: kpc_set_thread_counting,
    pub kpc_get_config_count: kpc_get_config_count,
    pub kpc_get_counter_count: kpc_get_counter_count,
    pub kpc_get_config: kpc_get_config,
    pub kpc_set_config: kpc_set_config,
    pub kpc_get_cpu_counters: kpc_get_cpu_counters,
    pub kpc_get_thread_counters: kpc_get_thread_counters,
    pub kpc_force_all_ctrs_set: kpc_force_all_ctrs_set,
    pub kpc_force_all_ctrs_get: kpc_force_all_ctrs_get,
    pub kperf_action_count_set: kperf_action_count_set,
    pub kperf_action_count_get: kperf_action_count_get,
    pub kperf_action_samplers_set: kperf_action_samplers_set,
    pub kperf_action_samplers_get: kperf_action_samplers_get,
    pub kperf_action_filter_set_by_task: kperf_action_filter_set_by_task,
    pub kperf_action_filter_set_by_pid: kperf_action_filter_set_by_pid,
    pub kperf_timer_count_set: kperf_timer_count_set,
    pub kperf_timer_count_get: kperf_timer_count_get,
    pub kperf_timer_period_set: kperf_timer_period_set,
    pub kperf_timer_period_get: kperf_timer_period_get,
    pub kperf_timer_action_set: kperf_timer_action_set,
    pub kperf_timer_action_get: kperf_timer_action_get,
    pub kperf_timer_pet_set: kperf_timer_pet_set,
    pub kperf_timer_pet_get: kperf_timer_pet_get,
    pub kperf_sample_set: kperf_sample_set,
    pub kperf_sample_get: kperf_sample_get,
    pub kperf_reset: kperf_reset,
    pub kperf_ns_to_ticks: kperf_ns_to_ticks,
    pub kperf_ticks_to_ns: kperf_ticks_to_ns,
    pub kperf_tick_frequency: kperf_tick_frequency,
}

impl fmt::Debug for VTable {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("VTable").finish_non_exhaustive()
    }
}

impl VTable {
    pub fn load(handle: &LibraryHandle) -> Result<Self, LoadError> {
        Ok(Self {
            kpc_cpu_string: load_sym!(handle, kpc_cpu_string, c"kpc_cpu_string"),
            kpc_pmu_version: load_sym!(handle, kpc_pmu_version, c"kpc_pmu_version"),
            kpc_get_counting: load_sym!(handle, kpc_get_counting, c"kpc_get_counting"),
            kpc_set_counting: load_sym!(handle, kpc_set_counting, c"kpc_set_counting"),
            kpc_get_thread_counting: load_sym!(
                handle,
                kpc_get_thread_counting,
                c"kpc_get_thread_counting"
            ),
            kpc_set_thread_counting: load_sym!(
                handle,
                kpc_set_thread_counting,
                c"kpc_set_thread_counting"
            ),
            kpc_get_config_count: load_sym!(handle, kpc_get_config_count, c"kpc_get_config_count"),
            kpc_get_counter_count: load_sym!(
                handle,
                kpc_get_counter_count,
                c"kpc_get_counter_count"
            ),
            kpc_get_config: load_sym!(handle, kpc_get_config, c"kpc_get_config"),
            kpc_set_config: load_sym!(handle, kpc_set_config, c"kpc_set_config"),
            kpc_get_cpu_counters: load_sym!(handle, kpc_get_cpu_counters, c"kpc_get_cpu_counters"),
            kpc_get_thread_counters: load_sym!(
                handle,
                kpc_get_thread_counters,
                c"kpc_get_thread_counters"
            ),
            kpc_force_all_ctrs_set: load_sym!(
                handle,
                kpc_force_all_ctrs_set,
                c"kpc_force_all_ctrs_set"
            ),
            kpc_force_all_ctrs_get: load_sym!(
                handle,
                kpc_force_all_ctrs_get,
                c"kpc_force_all_ctrs_get"
            ),
            kperf_action_count_set: load_sym!(
                handle,
                kperf_action_count_set,
                c"kperf_action_count_set"
            ),
            kperf_action_count_get: load_sym!(
                handle,
                kperf_action_count_get,
                c"kperf_action_count_get"
            ),
            kperf_action_samplers_set: load_sym!(
                handle,
                kperf_action_samplers_set,
                c"kperf_action_samplers_set"
            ),
            kperf_action_samplers_get: load_sym!(
                handle,
                kperf_action_samplers_get,
                c"kperf_action_samplers_get"
            ),
            kperf_action_filter_set_by_task: load_sym!(
                handle,
                kperf_action_filter_set_by_task,
                c"kperf_action_filter_set_by_task"
            ),
            kperf_action_filter_set_by_pid: load_sym!(
                handle,
                kperf_action_filter_set_by_pid,
                c"kperf_action_filter_set_by_pid"
            ),
            kperf_timer_count_set: load_sym!(
                handle,
                kperf_timer_count_set,
                c"kperf_timer_count_set"
            ),
            kperf_timer_count_get: load_sym!(
                handle,
                kperf_timer_count_get,
                c"kperf_timer_count_get"
            ),
            kperf_timer_period_set: load_sym!(
                handle,
                kperf_timer_period_set,
                c"kperf_timer_period_set"
            ),
            kperf_timer_period_get: load_sym!(
                handle,
                kperf_timer_period_get,
                c"kperf_timer_period_get"
            ),
            kperf_timer_action_set: load_sym!(
                handle,
                kperf_timer_action_set,
                c"kperf_timer_action_set"
            ),
            kperf_timer_action_get: load_sym!(
                handle,
                kperf_timer_action_get,
                c"kperf_timer_action_get"
            ),
            kperf_timer_pet_set: load_sym!(handle, kperf_timer_pet_set, c"kperf_timer_pet_set"),
            kperf_timer_pet_get: load_sym!(handle, kperf_timer_pet_get, c"kperf_timer_pet_get"),
            kperf_sample_set: load_sym!(handle, kperf_sample_set, c"kperf_sample_set"),
            kperf_sample_get: load_sym!(handle, kperf_sample_get, c"kperf_sample_get"),
            kperf_reset: load_sym!(handle, kperf_reset, c"kperf_reset"),
            kperf_ns_to_ticks: load_sym!(handle, kperf_ns_to_ticks, c"kperf_ns_to_ticks"),
            kperf_ticks_to_ns: load_sym!(handle, kperf_ticks_to_ns, c"kperf_ticks_to_ns"),
            kperf_tick_frequency: load_sym!(handle, kperf_tick_frequency, c"kperf_tick_frequency"),
        })
    }
}
