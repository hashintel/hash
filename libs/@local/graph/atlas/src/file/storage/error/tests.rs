use core::assert_matches;
use std::io;

use aws_sdk_s3::{
    config::http::HttpResponse,
    error::{ErrorMetadata, SdkError},
    operation::get_object::GetObjectError,
    primitives::ByteStream,
    types::error::NoSuchKey,
};

use super::StorageError;

/// Conversion retains the service error, response status and response body.
#[test]
fn request_service_metadata() {
    let response = HttpResponse::new(
        404.try_into().expect("should accept an HTTP status"),
        ByteStream::from_static(b"response details").into_inner(),
    );
    let error = SdkError::service_error(
        GetObjectError::NoSuchKey(NoSuchKey::builder().message("missing source").build()),
        response,
    );
    let error = StorageError::from(error);
    assert!(error.is_not_found(), "should recognize a missing key");
    assert!(
        !error.is_precondition_failed(),
        "should distinguish absence from a rejected write"
    );
    let StorageError::Request(error) = error else {
        panic!("should retain the request error");
    };
    assert_matches!(error.as_service_error(), Some(aws_sdk_s3::Error::NoSuchKey(error)) if error.message() == Some("missing source"));
    let response = error
        .raw_response()
        .expect("should retain the service response");
    assert_eq!(
        response.status().as_u16(),
        404,
        "should preserve the raw status"
    );
    assert_eq!(
        response.body().bytes(),
        Some(b"response details".as_slice()),
        "should preserve the raw response body"
    );
}

/// Request construction failure establishes neither absence nor a rejected write.
#[test]
fn request_construction_failure() {
    let error = StorageError::from(SdkError::<GetObjectError>::construction_failure(
        io::Error::other("fixture failure"),
    ));
    assert!(
        !error.is_not_found(),
        "should not infer absence from a construction failure"
    );
    assert!(
        !error.is_precondition_failed(),
        "should require a service response for a definite precondition failure"
    );
    let StorageError::Request(error) = error else {
        panic!("should retain the request error");
    };
    assert_matches!(error.as_ref(), SdkError::ConstructionFailure(_));
}

/// Only a parsed service response with status 412 identifies a rejected write.
#[test]
fn request_service_preconditions() {
    for (status, rejected) in [(412, true), (409, false), (404, false)] {
        let response = HttpResponse::new(
            status.try_into().expect("should accept an HTTP status"),
            ByteStream::from_static(b"").into_inner(),
        );
        let error = StorageError::from(SdkError::service_error(
            GetObjectError::generic(ErrorMetadata::builder().code("FixtureError").build()),
            response,
        ));
        assert_eq!(
            error.is_precondition_failed(),
            rejected,
            "should recognize only a parsed service response with status 412"
        );
        assert!(
            !error.is_not_found(),
            "should require the missing-key service category rather than a bare 404"
        );
    }
}

/// An unparsed 412 response does not establish whether a conditional write failed.
#[test]
fn request_unparsed_precondition() {
    let response = HttpResponse::new(
        412.try_into().expect("should accept an HTTP status"),
        ByteStream::from_static(b"unparsed").into_inner(),
    );
    let error = StorageError::from(SdkError::<GetObjectError>::response_error(
        io::Error::new(io::ErrorKind::InvalidData, "fixture parsing failure"),
        response,
    ));
    assert!(
        !error.is_precondition_failed(),
        "should preserve an unparsed response as an uncertain request failure"
    );
    assert!(
        !error.is_not_found(),
        "should not infer absence from an unparsed response"
    );
}
