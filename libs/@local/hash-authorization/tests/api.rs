#![allow(unused_attributes, unreachable_pub)] // This file is used as module in other tests
#![feature(associated_type_bounds)]

use authorization::backend::{SpiceDbOpenApi, ZanzibarBackend};

/// Connects to the `SpiceDB` instance specified by the environment variables.
///
/// The following environment variables are used:
/// - `HASH_SPICEDB_HOST`: The host to connect to. Defaults to `http://localhost`.
/// - `HASH_SPICEDB_HTTP_PORT`: The port to connect to. Defaults to `8443`.
/// - `HASH_SPICEDB_GRPC_PRESHARED_KEY`: The preshared key to use for authentication. Defaults to
///   `secret`.
///
/// # Panics
///
/// - If the connection to the authorization API fails.
#[must_use]
pub fn connect() -> impl ZanzibarBackend {
    let host = std::env::var("HASH_SPICEDB_HOST").unwrap_or_else(|_| "http://localhost".to_owned());
    let http_port = std::env::var("HASH_SPICEDB_HTTP_PORT").unwrap_or_else(|_| "8443".to_owned());
    let key =
        std::env::var("HASH_SPICEDB_GRPC_PRESHARED_KEY").unwrap_or_else(|_| "secret".to_owned());

    SpiceDbOpenApi::new(format!("{host}:{http_port}"), Some(&key))
        .expect("failed to connect to SpiceDB")
}
