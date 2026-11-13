use similar_asserts::assert_eq;
use tempfile::TempDir;

use super::{apply, context, run_id};
use crate::{
    Code, Operation, OperationRequest,
    run::{current, marker},
    start,
};

#[tokio::test]
async fn input_pins_request_and_reconcile_target() {
    let directory = TempDir::new().expect("should create a directory");
    let context = context(directory.path());
    let request = apply(run_id(1), "connector: aviation\n");
    let input = start(&context, request.clone())
        .await
        .expect("should start apply");
    assert_eq!(
        start(&context, request.clone())
            .await
            .expect("should reuse input"),
        input
    );
    let mut changed = request.clone();
    changed.allow_mass_archive = true;
    assert_eq!(
        Code::of(
            &start(&context, changed)
                .await
                .expect_err("should reject changed request")
        ),
        Some(Code::RequestMismatch)
    );
    current::mark_sending(&context, run_id(1), None, &[])
        .await
        .expect("should mark run");
    current::commit(&context, run_id(1), None, &[])
        .await
        .expect("should commit run");
    let mut reconcile = apply(run_id(2), "unused");
    reconcile.operation = OperationRequest::Reconcile;
    let resolved = start(&context, reconcile.clone())
        .await
        .expect("should resolve reconcile");
    assert_eq!(
        resolved.operation,
        Operation::Reconcile { target: run_id(1) }
    );
    assert_eq!(resolved.definition, input.definition);
    current::mark_sending(&context, run_id(2), Some(run_id(1)), &[])
        .await
        .expect("should mark reconcile");
    current::commit(&context, run_id(2), Some(run_id(1)), &[])
        .await
        .expect("should commit reconcile");
    assert_eq!(
        start(&context, reconcile)
            .await
            .expect("should keep original target"),
        resolved
    );
    let mut restore = apply(run_id(3), "unused");
    restore.operation = OperationRequest::Restore { target: None };
    let empty = start(&context, restore.clone())
        .await
        .expect("should resolve empty state");
    assert_eq!(empty.definition, None);
    assert_eq!(empty.namespace.as_ref(), "aviation");
    restore.run = run_id(4);
    restore.operation = OperationRequest::Restore {
        target: Some(run_id(3)),
    };
    let adopted = start(&context, restore)
        .await
        .expect("should restore empty state");
    assert_eq!(adopted.definition, None);
    assert_eq!(adopted.namespace, empty.namespace);
}

#[tokio::test]
async fn input_invalid_request_leaves_no_binding() {
    let directory = TempDir::new().expect("should create a directory");
    let context = context(directory.path());
    for (number, definition, expected) in [
        (1, "connector: [\n", Code::InvalidDefinition),
        (2, "connector: other\n", Code::IntegrationMismatch),
    ] {
        let run = run_id(number);
        assert_eq!(
            Code::of(
                &start(&context, apply(run, definition))
                    .await
                    .expect_err("should reject invalid input")
            ),
            Some(expected)
        );
        assert!(
            marker::finished::<crate::RunInput>(&context, &context.namespace.input(run.into()))
                .await
                .expect("should read binding")
                .is_none(),
            "should publish no invalid input"
        );
    }
    let mut missing = apply(run_id(3), "unused");
    missing.operation = OperationRequest::Reconcile;
    assert_eq!(
        Code::of(
            &start(&context, missing.clone())
                .await
                .expect_err("should require a committed run")
        ),
        Some(Code::NothingCommitted)
    );
    missing.operation = OperationRequest::Restore {
        target: Some(run_id(9)),
    };
    assert_eq!(
        Code::of(
            &start(&context, missing)
                .await
                .expect_err("should require target input")
        ),
        Some(Code::TargetMissing)
    );
}
