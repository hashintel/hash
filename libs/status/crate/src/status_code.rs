// Attribution: *Heavily* inspired by the Google Cloud API Error Model
//  https://cloud.google.com/apis/design/errors

use std::fmt::{Display, Formatter};

use serde::{Deserialize, Serialize};

mod http_compat;

/// The canonical status codes for software within the HASH ecosystem.
///
/// Sometimes multiple status codes may apply. Services should return the most specific status code
/// that applies. For example, prefer [`OutOfRange`] over [`FailedPrecondition`] if both codes
/// apply. Similarly prefer [`NotFound`] or [`AlreadyExists`] over [`FailedPrecondition`].
#[derive(Copy, Clone, Eq, PartialEq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum StatusCode {
    /// Not an error; returned on success.
    ///
    /// HTTP Mapping: 200 OK
    Ok,

    /// The operation was cancelled, typically by the caller.
    ///
    /// HTTP Mapping: 499 Client Closed Request
    Cancelled,

    /// Unknown error. For example, this error may be returned when a [`Status`] value received
    /// from another address space belongs to an error space that is not known in this address
    /// space. Also errors raised by APIs that do not return enough error information may be
    /// converted to this error.
    ///
    /// HTTP Mapping: 500 Internal Server Error
    ///
    /// [`Status`]: crate::Status
    Unknown,

    /// The client specified an invalid argument. Note that this differs from
    /// [`FailedPrecondition`]. [`InvalidArgument`] indicates arguments that are problematic
    /// regardless of the state of the system (e.g., a malformed file name).
    ///
    /// HTTP Mapping: 400 Bad Request
    InvalidArgument,

    /// The deadline expired before the operation could complete. For operations that change the
    /// state of the system, this error may be returned even if the operation has completed
    /// successfully. For example, a successful response from a server could have been delayed long
    /// enough for the deadline to expire.
    ///
    /// HTTP Mapping: 504 Gateway Timeout
    DeadlineExceeded,

    /// Some requested entity (e.g., file or directory) was not found.
    ///
    /// Note to server developers: if a request is denied for an entire class of users, such as
    /// gradual feature rollout or undocumented allowlist, [`NotFound`] may be used. If a request
    /// is denied for some users within a class of users, such as user-based access control,
    /// [`PermissionDenied`] must be used.
    ///
    /// HTTP Mapping: 404 Not Found
    NotFound,

    /// The entity that a client attempted to create (e.g., file or directory) already exists.
    ///
    /// HTTP Mapping: 409 Conflict
    AlreadyExists,

    /// The caller does not have permission to execute the specified operation.
    /// [`PermissionDenied`] must not be used for rejections caused by exhausting some resource
    /// (use [`ResourceExhausted`] instead for those errors). [`PermissionDenied`] must not be used
    /// if the caller can not be identified (use [`Unauthenticated`] instead for those errors).
    /// This error code does not imply the request is valid or the requested entity exists or
    /// satisfies other pre-conditions.
    ///
    /// HTTP Mapping: 403 Forbidden
    PermissionDenied,

    /// The request does not have valid authentication credentials for the operation.
    ///
    /// HTTP Mapping: 401 Unauthorized
    Unauthenticated,

    /// Some resource has been exhausted, perhaps a per-user quota, or perhaps the entire file
    /// system is out of space.
    ///
    /// HTTP Mapping: 429 Too Many Requests
    ResourceExhausted,

    /// The operation was rejected because the system is not in a state required for the
    /// operation's execution. For example, the directory to be deleted is non-empty, an rmdir
    /// operation is applied to a non-directory, etc.
    ///
    /// Service implementors can use the following guidelines to decide between
    /// [`FailedPrecondition`], [`Aborted`], and [`Unavailable`]:
    ///
    ///  (a) Use [`Unavailable`] if the client can retry just the failing call.
    ///  (b) Use [`Aborted`] if the client should retry at a higher level. For example, when a
    ///      client-specified test-and-set fails, indicating the client should restart a
    ///      read-modify-write sequence.
    ///  (c) Use [`FailedPrecondition`] if the client should not retry until the system state has
    ///      been explicitly fixed. For example, if an "rmdir" fails because the directory is
    ///      non-empty, [`FailedPrecondition`] should be returned since the client should not
    ///      retry unless the files are deleted from the directory.
    ///
    /// HTTP Mapping: 400 Bad Request
    FailedPrecondition,

    /// The operation was aborted, typically due to a concurrency issue such as a sequencer check
    /// failure or transaction abort.
    ///
    /// See the guidelines above for deciding between [`FailedPrecondition`], [`Aborted`], and
    /// [`Unavailable`].
    ///
    /// HTTP Mapping: 409 Conflict
    Aborted,

    /// The operation was attempted past the valid range. E.g., seeking or reading past
    /// end-of-file.
    ///
    /// Unlike [`InvalidArgument`], this error indicates a problem that may be fixed if the system
    /// state changes. For example, a 32-bit file system will generate [`InvalidArgument`] if
    /// asked to read at an offset that is not in the range [0,2^32-1], but it will generate
    /// [`OutOfRange`] if asked to read from an offset past the current file size.
    ///
    /// There is a fair bit of overlap between [`FailedPrecondition`] and [`OutOfRange`]. We
    /// recommend using [`OutOfRange`] (the more specific error) when it applies so that callers
    /// who are iterating through a space can easily look for an [`OutOfRange`] error to detect
    /// when they are done.
    ///
    /// HTTP Mapping: 400 Bad Request
    OutOfRange,

    /// The operation is not implemented or is not supported/enabled in this service.
    ///
    /// HTTP Mapping: 501 Not Implemented
    Unimplemented,

    /// Internal errors. This means that some invariants expected by the underlying system have
    /// been broken. This error code is reserved for serious errors.
    ///
    /// HTTP Mapping: 500 Internal Server Error
    Internal,

    /// The service is currently unavailable.  This is most likely a transient condition, which can
    /// be corrected by retrying with a backoff. Note that it is not always safe to retry
    /// non-idempotent operations.
    ///
    /// See the guidelines above for deciding between [`FailedPrecondition`], [`Aborted`], and
    /// [`Unavailable`].
    ///
    /// HTTP Mapping: 503 Service Unavailable
    Unavailable,

    /// Unrecoverable data loss or corruption.
    ///
    /// HTTP Mapping: 500 Internal Server Error
    DataLoss,
}

impl Display for StatusCode {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}",
            serde_json::to_string(self).map_err(|_| std::fmt::Error::default())?
        )
    }
}
