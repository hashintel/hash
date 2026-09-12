use aws_sdk_s3::{
    operation::delete_objects::DeleteObjectsOutput,
    types::{DeletedObject, Error},
};

use super::{S3, WriteCondition};
use crate::file::storage::error::StorageError;

/// Conditional writes select one precondition header, while unconditional writes select neither.
#[test]
fn write_condition_headers() {
    for (condition, expected) in [
        (WriteCondition::Any, (None, None)),
        (WriteCondition::Absent, (None, Some("*"))),
        (
            WriteCondition::Match("\"opaque-token\""),
            (Some("\"opaque-token\""), None),
        ),
    ] {
        assert_eq!(
            (condition.if_match(), condition.if_none_match()),
            expected,
            "should select exactly the requested destination precondition"
        );
    }
}

#[test]
fn reject_refusals_absent() {
    let output = DeleteObjectsOutput::builder()
        .deleted(
            DeletedObject::builder()
                .key("generation/0/quad.bin")
                .build(),
        )
        .build();

    S3::reject_refusals(output).expect("should accept a response that refuses no object");
}

#[test]
fn reject_refusals_mixed_output() {
    let output = DeleteObjectsOutput::builder()
        .deleted(
            DeletedObject::builder()
                .key("generation/0/quad.bin")
                .build(),
        )
        .errors(
            Error::builder()
                .key("generation/0/landmark.bin")
                .code("AccessDenied")
                .message("Access Denied")
                .build(),
        )
        .errors(
            Error::builder()
                .key("generation/0/policy.bin")
                .code("InternalError")
                .message("We encountered an internal error.")
                .build(),
        )
        .build();

    let error =
        S3::reject_refusals(output).expect_err("should refuse a response naming any failure");

    assert_eq!(
        error.to_string(),
        "S3 refused 2 object deletions: generation/0/landmark.bin (AccessDenied: Access Denied), \
         generation/0/policy.bin (InternalError: We encountered an internal error.)"
    );
    let StorageError::DeleteRefused { failures } = error else {
        panic!("should classify per-object refusals as refused deletions");
    };
    let expected = vec![
        Error::builder()
            .key("generation/0/landmark.bin")
            .code("AccessDenied")
            .message("Access Denied")
            .build(),
        Error::builder()
            .key("generation/0/policy.bin")
            .code("InternalError")
            .message("We encountered an internal error.")
            .build(),
    ];
    assert_eq!(
        failures, expected,
        "should retain every refused key, code and message in response order"
    );
}

#[test]
fn reject_refusals_partial_fields() {
    let output = DeleteObjectsOutput::builder()
        .errors(Error::builder().code("InternalError").build())
        .errors(Error::builder().key("generation/0/sprs.bin").build())
        .build();

    let error =
        S3::reject_refusals(output).expect_err("should refuse a response naming any failure");

    let StorageError::DeleteRefused { failures } = &error else {
        panic!("should classify per-object refusals as refused deletions");
    };
    let expected = vec![
        Error::builder().code("InternalError").build(),
        Error::builder().key("generation/0/sprs.bin").build(),
    ];
    assert_eq!(
        failures, &expected,
        "should retain each field exactly as the response carried it"
    );

    let rendered = error.to_string();
    assert!(
        rendered.contains("S3 refused 2 object deletions"),
        "should count every refusal, not report only the first: {rendered}"
    );
    assert!(
        rendered.contains("generation/0/sprs.bin"),
        "should name a refused key that carried no code: {rendered}"
    );
    assert!(
        rendered.contains("InternalError"),
        "should report a refusal code that carried no key: {rendered}"
    );
}
