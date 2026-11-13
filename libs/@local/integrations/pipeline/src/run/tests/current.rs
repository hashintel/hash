use rstest::rstest;
use similar_asserts::assert_eq;
use tempfile::TempDir;

use super::{context, run_id};
use crate::{
    Code, StageError,
    run::current,
    storage::tests::{minio, s3_storage},
};

#[rstest]
#[case::local(false)]
#[case::s3(true)]
#[tokio::test]
async fn sending_race_takeover_and_commit(#[case] remote: bool) {
    let directory = TempDir::new().expect("should create a directory");
    let mut first = context(directory.path());
    let mut second = context(directory.path());
    let minio = if remote { Some(minio().await) } else { None };
    if let Some((_, port)) = &minio {
        first.storage = s3_storage(*port, &first.scratch);
        second.storage = s3_storage(*port, &second.scratch);
    }
    let first_run = run_id(1);
    let second_run = run_id(2);
    let (first_result, second_result) = tokio::join!(
        current::mark_sending(&first, first_run, None, &[]),
        current::mark_sending(&second, second_run, None, &[])
    );
    let (winner, loser) = if first_result.is_ok() {
        (
            first_run,
            second_result.expect_err("should refuse a competing sender"),
        )
    } else {
        (
            second_run,
            first_result.expect_err("should refuse a competing sender"),
        )
    };
    assert_eq!(Code::of(&loser), Some(Code::Superseded));
    assert_eq!(
        current::read(&first)
            .await
            .expect("should read current")
            .sending,
        vec![winner]
    );
    current::mark_sending(&second, run_id(3), None, &[winner])
        .await
        .expect("should allow a run that resends the incumbent");
    let error = current::check_sending(&first, winner, None, &[])
        .await
        .expect_err("should stop the stale sender");
    assert_eq!(Code::of(&error), Some(Code::Superseded));
    assert_eq!(*error.current_context(), StageError::Permanent);
    let error = current::commit(&first, winner, None, &[])
        .await
        .expect_err("should refuse a stale commit");
    assert_eq!(Code::of(&error), Some(Code::Superseded));
    current::commit(&second, run_id(3), None, &[winner])
        .await
        .expect("should commit the new authority");
    let committed = current::read(&first).await.expect("should read current");
    assert_eq!(committed.committed, Some(run_id(3)));
    assert!(
        committed.sending.is_empty(),
        "should clear precisely the handled runs"
    );
    current::commit(&second, run_id(3), None, &[winner])
        .await
        .expect("should recover a lost commit acknowledgment");
    assert_eq!(
        current::read(&first).await.expect("should read current"),
        committed
    );
    let error = current::mark_sending(&first, winner, None, &[])
        .await
        .expect_err("should refuse the old base");
    assert_eq!(Code::of(&error), Some(Code::BaseMoved));
}

#[tokio::test]
async fn commit_races_takeover() {
    for _ in 0..8 {
        let directory = TempDir::new().expect("should create a directory");
        let first = context(directory.path());
        let second = context(directory.path());
        current::mark_sending(&first, run_id(1), None, &[])
            .await
            .expect("should mark incumbent");
        let resent = [run_id(1)];
        let (commit, takeover) = tokio::join!(
            current::commit(&first, run_id(1), None, &[]),
            current::mark_sending(&second, run_id(2), None, &resent)
        );
        let state = current::read(&first).await.expect("should read winner");
        if commit.is_ok() {
            assert_eq!(
                Code::of(&takeover.expect_err("should reject stale base")),
                Some(Code::BaseMoved)
            );
            assert_eq!(state.committed, Some(run_id(1)));
            assert!(state.sending.is_empty(), "should keep committed state");
        } else {
            takeover.expect("should allow takeover");
            assert_eq!(
                Code::of(&commit.expect_err("should stop stale commit")),
                Some(Code::Superseded)
            );
            assert_eq!(state.committed, None);
            assert_eq!(state.sending, vec![run_id(1), run_id(2)]);
        }
    }
}

#[tokio::test]
async fn conditional_updates_bound_contention() {
    let directory = TempDir::new().expect("should create directory");
    let context = context(directory.path());
    context
        .storage
        .test_conflicts
        .store(9, core::sync::atomic::Ordering::Relaxed);
    let error = current::mark_sending(&context, run_id(1), None, &[])
        .await
        .expect_err("should stop after eight conflicts");
    assert_eq!(Code::of(&error), Some(Code::StorageUnavailable));
    assert_eq!(*error.current_context(), StageError::Retryable);
    assert_eq!(
        context
            .storage
            .test_conflicts
            .load(core::sync::atomic::Ordering::Relaxed),
        1
    );
    assert_eq!(
        current::read(&context)
            .await
            .expect("should read unchanged state"),
        current::Current::default()
    );
    current::mark_sending(&context, run_id(1), None, &[])
        .await
        .expect("should retry with a fresh state read");
    let sending = current::read(&context)
        .await
        .expect("should read sending state");
    context
        .storage
        .test_conflicts
        .store(9, core::sync::atomic::Ordering::Relaxed);
    let error = current::commit(&context, run_id(1), None, &[])
        .await
        .expect_err("should bound commit contention too");
    assert_eq!(Code::of(&error), Some(Code::StorageUnavailable));
    assert_eq!(
        context
            .storage
            .test_conflicts
            .load(core::sync::atomic::Ordering::Relaxed),
        1
    );
    assert_eq!(
        current::read(&context)
            .await
            .expect("should retain sender after failed commit"),
        sending
    );
    current::commit(&context, run_id(1), None, &[])
        .await
        .expect("should commit after contention subsides");
    assert_eq!(
        current::read(&context)
            .await
            .expect("should read committed state")
            .committed,
        Some(run_id(1))
    );
}
