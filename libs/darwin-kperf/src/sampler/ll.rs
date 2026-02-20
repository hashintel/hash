//! Low-level sampler operations.
//!
//! These functions bridge the safe [`Sampler`](super::Sampler) /
//! [`ThreadSampler`](super::ThreadSampler) API to the raw framework vtables. They are
//! `pub(crate)` and not part of the public API.

#![expect(clippy::indexing_slicing)]
use alloc::{borrow::ToOwned as _, vec};
use core::{
    ffi::CStr,
    mem::MaybeUninit,
    ptr::{self, NonNull},
};

use darwin_kperf_sys::{
    kperf::{KPC_CLASS_CONFIGURABLE_MASK, KPC_MAX_COUNTERS, kpc_config_t},
    kperfdata::{kpep_db, kpep_event},
};

use super::{Sampler, error::SamplerError, thread::ThreadSampler};
use crate::{
    KPerf, KPerfData,
    event::{Cpu, Event, EventInfo as _, ResolvedEvent},
    sampler::error::{try_kpc, try_kpep},
    utils::DropGuard,
};

/// Resolves an array of [`Event`]s to their CPU-specific
/// [`ResolvedEvent`]s, failing if any event is unavailable.
fn resolve_array<const N: usize>(
    cpu: Cpu,
    events: [Event; N],
) -> Result<[ResolvedEvent; N], SamplerError> {
    let mut resolved = [MaybeUninit::uninit(); N];
    for (index, event) in events.into_iter().enumerate() {
        // ResolvedEvent is Copy, so no Drop cleanup is needed on early return.
        let event = event.on(cpu).ok_or(SamplerError::EventUnavailable(event))?;

        resolved[index].write(event);
    }

    // SAFETY: all N elements were initialized in the loop above.
    Ok(resolved.map(|value| unsafe { value.assume_init() }))
}

/// Creates a [`ThreadSampler`] configured for the given events.
///
/// Resolves events, builds a KPEP config, extracts KPC register values,
/// and programs the counters. The returned `ThreadSampler` owns the config
/// and is ready for [`start`](ThreadSampler::start).
pub(crate) fn ll_configure<const N: usize>(
    sampler: &Sampler,
    events: [Event; N],
) -> Result<ThreadSampler<'_, N>, SamplerError> {
    let kpc_vt = sampler.kperf.vtable();
    let kpep_vt = sampler.kperfdata.vtable();

    // Privilege probe: if we can't even read force_all state, we lack the
    // necessary entitlements or root access.
    let mut force_ctrs = 0;
    try_kpc(
        // SAFETY: kpc_force_all_ctrs_get reads a sysctl value into the pointer.
        unsafe { (kpc_vt.kpc_force_all_ctrs_get)(&raw mut force_ctrs) },
        |_| SamplerError::MissingPrivileges,
    )?;

    let mut config = ptr::null_mut();
    // SAFETY: db is valid (owned by Sampler), config receives the new pointer.
    try_kpep(unsafe { (kpep_vt.kpep_config_create)(sampler.db.as_ptr(), &raw mut config) })?;

    let Some(config) = NonNull::new(config) else {
        return Err(SamplerError::UnexpectedNullPointer);
    };

    let config = DropGuard::new(config, |config| {
        // SAFETY: config was allocated by kpep_config_create above.
        unsafe { (kpep_vt.kpep_config_free)(config.as_ptr()) }
    });

    // SAFETY: config is a valid kpep_config allocated above.
    try_kpep(unsafe { (kpep_vt.kpep_config_force_counters)(config.as_ptr()) })?;

    let mut event_pointers = [ptr::null_mut(); N];
    let resolved_events = resolve_array(sampler.cpu, events)?;

    for (index, event) in resolved_events.iter().enumerate() {
        // SAFETY: db and c_name are valid; event_pointers[index] receives
        // a pointer into the db's internal event array.
        try_kpep(unsafe {
            (kpep_vt.kpep_db_event)(
                sampler.db.as_ptr(),
                event.c_name().as_ptr(),
                &raw mut event_pointers[index],
            )
        })?;
    }

    for event_pointer in &mut event_pointers {
        // SAFETY: config is valid, event_pointer points to a valid kpep_event
        // obtained from kpep_db_event above. Flag 0 = count all (user + kernel).
        try_kpep(unsafe {
            (kpep_vt.kpep_config_add_event)(config.as_ptr(), event_pointer, 0, ptr::null_mut())
        })?;
    }

    let mut classes = 0_u32;
    let mut reg_count = 0_usize;
    let mut regs = [0 as kpc_config_t; KPC_MAX_COUNTERS];
    let mut counter_map = [0_usize; N];

    // SAFETY: passes a valid config pointer and correctly sized output buffers.
    try_kpep(unsafe { (kpep_vt.kpep_config_kpc_classes)(config.as_ptr(), &raw mut classes) })?;
    // SAFETY: passes a valid config pointer and correctly sized output buffers.
    try_kpep(unsafe { (kpep_vt.kpep_config_kpc_count)(config.as_ptr(), &raw mut reg_count) })?;
    // SAFETY: passes a valid config pointer and correctly sized output buffers.
    try_kpep(unsafe {
        (kpep_vt.kpep_config_kpc_map)(
            config.as_ptr(),
            counter_map.as_mut_ptr(),
            size_of_val(&counter_map),
        )
    })?;
    // SAFETY: passes a valid config pointer and correctly sized output buffers.
    try_kpep(unsafe {
        (kpep_vt.kpep_config_kpc)(config.as_ptr(), regs.as_mut_ptr(), size_of_val(&regs))
    })?;

    if (classes & KPC_CLASS_CONFIGURABLE_MASK) != 0 && reg_count > 0 {
        try_kpc(
            // SAFETY: regs buffer contains valid KPC config values extracted from the kpep_config.
            // classes was obtained from the same config.
            unsafe { (kpc_vt.kpc_set_config)(classes, regs.as_mut_ptr()) },
            SamplerError::FailedToSetKpcConfig,
        )?;
    }

    let config = DropGuard::dismiss(config);

    Ok(ThreadSampler::new(sampler, config, classes, counter_map))
}

/// Loads both frameworks, opens the PMC database, and force-acquires counters.
///
/// # Errors
///
/// Returns [`SamplerError`] if either framework fails to load, the PMC
/// database cannot be opened, the CPU is not recognized, or counter
/// acquisition fails.
pub(crate) fn ll_init() -> Result<Sampler, SamplerError> {
    let kperf = KPerf::new()?;
    let kperfdata = KPerfData::new()?;

    let kpc_vt = kperf.vtable();
    let kpep_vt = kperfdata.vtable();

    let mut db = ptr::null_mut();
    // SAFETY: passing null name opens the database for the current CPU.
    try_kpep(unsafe { (kpep_vt.kpep_db_create)(ptr::null(), &raw mut db) })?;
    let Some(db) = NonNull::new(db) else {
        return Err(SamplerError::UnexpectedNullPointer);
    };

    let db = DropGuard::new(db, |db| {
        // SAFETY: db was allocated by kpep_db_create above.
        unsafe { (kpep_vt.kpep_db_free)(db.as_ptr()) }
    });

    // SAFETY: db is valid, name receives a pointer into the db's internal storage.
    let name = unsafe { db.as_ref().name };

    // SAFETY: kpep_db_name returns a pointer into the db's internal storage,
    // valid for the lifetime of the db.
    let name = unsafe { CStr::from_ptr(name) };
    let name = name.to_str().map_err(|_err| SamplerError::InvalidCpuName)?;

    let cpu = Cpu::from_db_name(name).ok_or_else(|| SamplerError::UnknownCpu(name.to_owned()))?;

    // Save the previous force_all state so we can restore it on drop.
    let mut saved_force_all = 0;
    try_kpc(
        // SAFETY: reads the current force_all_ctrs sysctl value.
        unsafe { (kpc_vt.kpc_force_all_ctrs_get)(&raw mut saved_force_all) },
        |_| SamplerError::MissingPrivileges,
    )?;

    try_kpc(
        // SAFETY: acquires power counters from the OS Power Manager.
        unsafe { (kpc_vt.kpc_force_all_ctrs_set)(1) },
        SamplerError::FailedToForceAllCounters,
    )?;

    let clear_force = DropGuard::new((), |()| {
        // SAFETY: Value acquired is simply re-set
        let _result = unsafe { (kpc_vt.kpc_force_all_ctrs_set)(saved_force_all) };
    });

    // Verify that the framework's kpep_event stride matches our struct
    // definition. Apple has changed this struct size across macOS versions;
    // a mismatch means our repr(C) definition is stale and direct field
    // access would read corrupt data.
    if cfg!(any(debug_assertions, feature = "runtime-assertions")) {
        verify_event_stride(kpep_vt, db.as_ptr())?;
    }

    DropGuard::dismiss(clear_force);
    let db = DropGuard::dismiss(db);

    Ok(Sampler {
        kperf,
        kperfdata,
        db,
        cpu,
        saved_force_all,
    })
}

/// Tears down the sampler: restores the previous `force_all` state and frees
/// the PMC database.
pub(crate) fn ll_drop(sampler: &Sampler) {
    let kpc_vt = sampler.kperf.vtable();
    let kpep_vt = sampler.kperfdata.vtable();

    // SAFETY: restores the force_all_ctrs value saved at init.
    let _result = unsafe { (kpc_vt.kpc_force_all_ctrs_set)(sampler.saved_force_all) };

    // SAFETY: db was allocated by kpep_db_create and has not been freed.
    // The kperfdata framework is still loaded (Sampler owns it).
    unsafe {
        (kpep_vt.kpep_db_free)(sampler.db.as_ptr());
    }
}

/// Verifies the runtime `kpep_event` stride matches `size_of::<kpep_event>()`.
///
/// Fetches all event pointers from the database, sorts by address, and checks
/// that the minimum distance between adjacent events equals our compiled struct
/// size. Requires at least 2 events in the database.
fn verify_event_stride(
    vt: &darwin_kperf_sys::kperfdata::VTable,
    db: *mut kpep_db,
) -> Result<(), SamplerError> {
    let mut count: usize = 0;
    // SAFETY: db is valid, count receives the number of events.
    try_kpep(unsafe { (vt.kpep_db_events_count)(db, &raw mut count) })?;

    if count < 2 {
        return Ok(());
    }

    let mut buf = vec![ptr::null_mut::<kpep_event>(); count];
    // SAFETY: buffer has `count` elements, matching `buf_size`.
    try_kpep(unsafe {
        (vt.kpep_db_events)(db, buf.as_mut_ptr(), count * size_of::<*mut kpep_event>())
    })?;

    let mut addrs: alloc::vec::Vec<usize> = buf.iter().map(|ptr| ptr.addr()).collect();
    addrs.sort_unstable();

    let expected = size_of::<kpep_event>();
    let min_stride = addrs
        .windows(2)
        .map(|pair| pair[1] - pair[0])
        .filter(|&delta| delta > 0)
        .min();

    if let Some(stride) = min_stride
        && stride != expected
    {
        return Err(SamplerError::EventLayoutMismatch {
            expected,
            actual: stride,
        });
    }

    Ok(())
}
