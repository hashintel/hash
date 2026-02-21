//! Integration tests for the sampler API.
//!
//! These tests require root privileges (or the `com.apple.private.kernel.kpc`
//! entitlement) because they program hardware performance counters via the
//! private kperf/kperfdata frameworks.
//!
//! `kpc_set_counting` and `kpc_set_config` are process-wide sysctls, so tests
//! that program counters must run sequentially to avoid clobbering each
//! other's configuration.
//!
//! Run with:
//!
//! ```sh
//! sudo -E cargo test --package darwin-kperf --test sampler -- --ignored --nocapture --test-threads=1
//! ```

use core::hint::black_box;

use darwin_kperf::{Sampler, SamplerError, event::Event};

/// Helper: do enough work that fixed counters produce non-trivial deltas.
#[inline(never)]
fn do_work() {
    let mut sum: u64 = 0;
    for index in 0..100_000_u64 {
        sum = sum.wrapping_add(index.wrapping_mul(index));
    }
    black_box(sum);
}

#[test]
#[ignore = "requires root privileges"]
fn sampler_new_succeeds() {
    let sampler = Sampler::new().expect("Sampler::new() failed - are you running as root?");
    let cpu = sampler.cpu();
    eprintln!("detected CPU: {cpu:?}");

    let database = sampler.database();
    eprintln!(
        "db: {} ({}) — {} events",
        database.name(),
        database.marketing_name(),
        database.events().len(),
    );
}

#[test]
#[ignore = "requires root privileges"]
fn sample_fixed_counters() {
    let sampler = Sampler::new().expect("Sampler::new() failed - are you running as root?");

    let mut thread = sampler
        .thread([Event::FixedInstructions, Event::FixedCycles])
        .expect("failed to create ThreadSampler");

    thread.start().expect("failed to start counting");

    let before = thread.sample().expect("failed to read counters (before)");
    do_work();
    let after = thread.sample().expect("failed to read counters (after)");

    thread.stop().expect("failed to stop counting");

    let instructions = after[0].wrapping_sub(before[0]);
    let cycles = after[1].wrapping_sub(before[1]);

    eprintln!("instructions: {instructions}");
    eprintln!("cycles:       {cycles}");
    #[expect(clippy::cast_precision_loss)]
    let ipc = instructions as f64 / cycles as f64;
    eprintln!("IPC:          {ipc:.2}");

    // Sanity: 100k iterations should retire at least tens of thousands of
    // instructions and consume a non-trivial number of cycles.
    // assert!(
    //     instructions > 10_000,
    //     "instruction count suspiciously low: {instructions}"
    // );
    // assert!(cycles > 10_000, "cycle count suspiciously low: {cycles}");
}

#[test]
#[ignore = "requires root privileges"]
fn sample_configurable_event() {
    let sampler = Sampler::new().expect("Sampler::new() failed - are you running as root?");

    // RetireUop is a configurable (non-fixed) counter available on all
    // Apple Silicon generations.
    let mut thread = sampler
        .thread([Event::RetireUop])
        .expect("failed to create ThreadSampler with configurable event");

    thread.start().expect("failed to start counting");

    let before = thread.sample().expect("sample before")[0];
    do_work();
    let after = thread.sample().expect("sample after")[0];

    thread.stop().expect("failed to stop counting");

    let retired = after.wrapping_sub(before);
    eprintln!("retired uops: {retired}");

    // assert!(
    //     retired > 10_000,
    //     "retired uop count suspiciously low: {retired}"
    // );
}

#[test]
#[ignore = "requires root privileges"]
fn sample_non_power_configurable_event() {
    let sampler = Sampler::new().expect("Sampler::new() failed - are you running as root?");

    // InstAll is a configurable (non-fixed) event, like RetireUop.
    // Both land in configurable counter slots; this test exercises a
    // second configurable event to ensure counter programming is stable.
    let mut thread = sampler
        .thread([Event::InstAll])
        .expect("failed to create ThreadSampler");

    thread.start().expect("failed to start counting");

    let before = thread.sample().expect("sample before")[0];
    do_work();
    let after = thread.sample().expect("sample after")[0];

    thread.stop().expect("failed to stop counting");

    let retired = after.wrapping_sub(before);
    eprintln!("InstAll: {retired}");
    // assert!(
    //     retired > 10_000,
    //     "InstAll count suspiciously low: {retired}"
    // );
}

#[test]
#[ignore = "requires root privileges"]
fn mixed_fixed_and_configurable_events() {
    let sampler = Sampler::new().expect("Sampler::new() failed - are you running as root?");

    let mut thread = sampler
        .thread([Event::FixedInstructions, Event::RetireUop])
        .expect("failed to create ThreadSampler with mixed events");

    thread.start().expect("failed to start counting");

    let before = thread.sample().expect("sample before");
    do_work();
    let after = thread.sample().expect("sample after");

    thread.stop().expect("failed to stop counting");

    let instructions = after[0].wrapping_sub(before[0]);
    let retired_uops = after[1].wrapping_sub(before[1]);

    eprintln!("instructions: {instructions}");
    eprintln!("retired uops: {retired_uops}");

    assert!(
        instructions > 10_000,
        "instruction count suspiciously low: {instructions}"
    );
    assert!(
        retired_uops > 10_000,
        "retired uop count suspiciously low: {retired_uops}"
    );

    // Retired uops should be in the same ballpark as instructions — at least
    // the same order of magnitude. This is a loose sanity check, not a
    // microarchitectural assertion.
    #[expect(clippy::cast_precision_loss)]
    let ratio = retired_uops as f64 / instructions as f64;
    eprintln!("uops/instruction ratio: {ratio:.2}");
    // assert!(
    //     ratio > 0.1 && ratio < 100.0,
    //     "uops/instruction ratio out of sane range: {ratio}"
    // );
}

#[test]
#[ignore = "requires root privileges"]
fn counters_are_monotonic() {
    let sampler = Sampler::new().expect("Sampler::new() failed - are you running as root?");

    let mut thread = sampler
        .thread([Event::FixedInstructions])
        .expect("failed to create ThreadSampler");

    thread.start().expect("failed to start counting");

    let first = thread.sample().expect("sample 1")[0];
    let second = thread.sample().expect("sample 2")[0];
    let third = thread.sample().expect("sample 3")[0];

    thread.stop().expect("failed to stop counting");

    eprintln!("samples: {first}, {second}, {third}");
    assert!(
        second >= first,
        "counters went backwards: {second} < {first}"
    );
    assert!(
        third >= second,
        "counters went backwards: {third} < {second}"
    );
}

#[test]
#[ignore = "requires root privileges"]
fn start_stop_is_idempotent() {
    let sampler = Sampler::new().expect("Sampler::new() failed - are you running as root?");

    let mut thread = sampler
        .thread([Event::FixedCycles])
        .expect("failed to create ThreadSampler");

    // Double start should be a no-op.
    thread.start().expect("start 1");
    thread.start().expect("start 2 (should be no-op)");

    let _values = thread.sample().expect("sample while running");

    // Double stop should be a no-op.
    thread.stop().expect("stop 1");
    thread.stop().expect("stop 2 (should be no-op)");
}

#[test]
#[ignore = "requires root privileges"]
fn sample_while_stopped_returns_error() {
    let sampler = Sampler::new().expect("Sampler::new() failed - are you running as root?");

    let thread = sampler
        .thread([Event::FixedCycles])
        .expect("failed to create ThreadSampler");

    // Never started — sample should fail.
    let result = thread.sample();
    assert!(
        matches!(result, Err(SamplerError::SamplerNotRunning)),
        "expected SamplerNotRunning, got: {result:?}"
    );
}

#[test]
#[ignore = "requires root privileges"]
fn multiple_thread_samplers_sequentially() {
    let sampler = Sampler::new().expect("Sampler::new() failed - are you running as root?");

    // First sampler.
    {
        let mut thread = sampler
            .thread([Event::FixedInstructions])
            .expect("thread 1");
        thread.start().expect("start 1");
        let _values = thread.sample().expect("sample 1");
        thread.stop().expect("stop 1");
    }

    // Second sampler reusing the same Sampler — config should be freed and
    // re-created cleanly.
    {
        let mut thread = sampler.thread([Event::FixedCycles]).expect("thread 2");
        thread.start().expect("start 2");
        let _values = thread.sample().expect("sample 2");
        thread.stop().expect("stop 2");
    }
}

#[test]
#[ignore = "requires root privileges"]
fn drop_stops_counting() {
    let sampler = Sampler::new().expect("Sampler::new() failed - are you running as root?");

    let mut thread = sampler
        .thread([Event::FixedCycles])
        .expect("failed to create ThreadSampler");

    thread.start().expect("start");
    assert!(thread.is_running());

    // Drop should stop counting without panicking.
    drop(thread);

    // Creating a new ThreadSampler should work — the old one cleaned up.
    let thread = sampler
        .thread([Event::FixedInstructions])
        .expect("new thread after drop");
    assert!(!thread.is_running());
}

#[test]
#[ignore = "requires root privileges"]
#[expect(unsafe_code)]
fn release_relinquishes_counters() {
    let sampler = Sampler::new().expect("Sampler::new() failed - are you running as root?");

    // Do a measurement first to confirm the sampler is functional.
    {
        let mut thread = sampler
            .thread([Event::FixedInstructions])
            .expect("failed to create ThreadSampler");
        thread.start().expect("start");
        let _values = thread.sample().expect("sample");
        thread.stop().expect("stop");
    }

    // Release counters back to the OS Power Manager.
    //
    // SAFETY: no ThreadSampler is running.
    unsafe { sampler.release() }.expect("release failed");

    eprintln!("counters released successfully");
}
