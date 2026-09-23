use alloc::borrow::Cow;

use deadpool::managed::{HookError, PoolError, TimeoutType};
use tokio_postgres::Config;

use crate::store::postgres::connection::ConnectionError;

#[test]
fn pool_error_acquire_causes() {
    for error in [
        PoolError::Timeout(TimeoutType::Wait),
        PoolError::Timeout(TimeoutType::Create),
        PoolError::Timeout(TimeoutType::Recycle),
        PoolError::Closed,
        PoolError::NoRuntimeSpecified,
        PoolError::PostCreateHook(HookError::Message(Cow::Borrowed(
            "hook rejected connection",
        ))),
    ] {
        let description = error.to_string();
        let report = ConnectionError::from_pool(error);

        assert_eq!(
            report.current_context(),
            &ConnectionError::Acquire,
            "pool failures should retain the acquisition context"
        );
        let cause = report
            .downcast_ref::<PoolError<tokio_postgres::Error>>()
            .expect("the typed pool cause should remain directly accessible");
        assert_eq!(
            cause.to_string(),
            description,
            "the pool cause should retain its timeout phase or hook message"
        );
    }
}

#[test]
fn pool_error_hook_backend() {
    let error = "unknown_option=value"
        .parse::<Config>()
        .expect_err("the connection configuration should be invalid");
    let description = error.to_string();

    let report = ConnectionError::from_pool(PoolError::PostCreateHook(HookError::Backend(error)));

    assert_eq!(
        report.current_context(),
        &ConnectionError::Connect,
        "backend hook failures should retain the connection context"
    );
    let cause = report
        .downcast_ref::<tokio_postgres::Error>()
        .expect("the typed backend cause should remain directly accessible");
    assert_eq!(
        cause.to_string(),
        description,
        "the backend cause should retain its details"
    );
}
