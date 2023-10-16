#![allow(unused_attributes, unreachable_pub)] // This file is used as module in other tests
#![feature(async_fn_in_trait, associated_type_bounds)]

use authorization::backend::{SpiceDbOpenApi, ZanzibarBackend};

/// Connect to the authorization API.
///
/// # Panics
///
/// - If the `HASH_SPICEDB_HOST` environment variable is not set.
/// - If the `HASH_SPICEDB_HTTP_PORT` environment variable is not set.
/// - If the `HASH_SPICEDB_GRPC_PRESHARED_KEY` environment variable is not set.
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
