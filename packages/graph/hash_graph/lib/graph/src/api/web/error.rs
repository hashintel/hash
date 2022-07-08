#![allow(
    clippy::needless_pass_by_value,
    reason = "This is considered the last-stop for errors from the perspective of the web-api and \
              taking Owned reports allows us to simply `map_err` and return the appropriate error \
              response from request handlers"
)]

use axum::http::StatusCode;
use error_stack::Report;

use crate::datastore::{BaseIdAlreadyExists, BaseIdDoesNotExist, QueryError};

/// Convert an error report to an HTTP status code depending on values provided.
/// Assumes the report is created by a _write_ operation in the datastore.
pub fn modify_report_to_status_code<T>(report: Report<T>) -> StatusCode {
    if report.contains::<BaseIdDoesNotExist>() {
        return StatusCode::NOT_FOUND;
    }

    if report.contains::<BaseIdAlreadyExists>() {
        return StatusCode::CONFLICT;
    }

    // Insertion/upddate errors are considered internal server errors.
    StatusCode::INTERNAL_SERVER_ERROR
}

/// Convert an error report to an HTTP status code depending on values provided.
/// Assumes the report is created by a _read_ operation in the datastore.
pub fn query_report_to_status_code<T>(report: Report<T>) -> StatusCode {
    if report.contains::<QueryError>() {
        return StatusCode::NOT_FOUND;
    }

    // Datastore errors such as connection failure are considered internal server errors.
    StatusCode::INTERNAL_SERVER_ERROR
}
