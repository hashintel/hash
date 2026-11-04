use core::time::Duration;
use std::thread;

use pretty_assertions::assert_eq;

use super::Progress;

#[test]
fn progress_concurrent_updates() {
    let progress = Progress::start("apply", Some(800));
    thread::scope(|scope| {
        for _ in 0..8 {
            scope.spawn(|| {
                for _ in 0..100 {
                    progress.advance(1);
                }
            });
        }
    });

    let snapshot = progress.snapshot();
    assert_eq!(
        snapshot.completed, 800,
        "all observed work should be counted"
    );
    assert_eq!(
        snapshot.total,
        Some(800),
        "the expected total should remain fixed"
    );
}

#[test]
fn progress_exceeds_expected_total() {
    let progress = Progress::start("apply", Some(2));
    progress.advance(3);
    assert_eq!(
        progress.snapshot().completed,
        3,
        "observed work should not be capped by an estimate"
    );

    let progress = Progress::start("scan", None);
    progress.advance(u64::MAX);
    progress.advance(1);
    let snapshot = progress.snapshot();
    assert_eq!(
        snapshot.completed,
        u64::MAX,
        "the counter should saturate instead of wrapping"
    );
    assert_eq!(
        snapshot.total, None,
        "an unknown total should remain unknown"
    );
}

#[test]
fn progress_report_interval() {
    let progress = Progress::start("apply", None);
    assert!(
        !progress.claim_report(Duration::from_millis(9_999)),
        "an early report should be suppressed"
    );
    assert!(
        progress.claim_report(Duration::from_secs(10)),
        "the first report should be due after 10 seconds"
    );
    assert!(
        !progress.claim_report(Duration::from_secs(10)),
        "only one task should claim each report"
    );
    assert!(
        !progress.claim_report(Duration::from_secs(9)),
        "an older observation should not move the interval backwards"
    );
    assert!(
        progress.claim_report(Duration::from_secs(20)),
        "the next interval should allow another report"
    );
}

#[test]
fn progress_concurrent_reports() {
    let progress = Progress::start("apply", None);
    let reports = thread::scope(|scope| {
        let workers: Vec<_> = core::iter::repeat_with(|| {
            scope.spawn(|| progress.claim_report(Duration::from_secs(10)))
        })
        .take(8)
        .collect();
        workers
            .into_iter()
            .map(|worker| worker.join().expect("reporting thread should finish"))
            .filter(|claimed| *claimed)
            .count()
    });
    assert_eq!(
        reports, 1,
        "concurrent updates should reserve only one periodic report"
    );
}
