#![expect(clippy::print_stdout, clippy::use_debug)]
//! Builds a store configuration from two layers of programmatic defaults.

use error_stack::Report;
use hash_config::{LoadError, Loader};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Deserialize)]
struct Config {
    store: Store,
    routes: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct Store {
    host: String,
    port: u16,
}

#[derive(Serialize)]
struct StoreDefaults {
    host: &'static str,
    port: u16,
}

#[derive(Serialize)]
struct Defaults {
    store: StoreDefaults,
    routes: [&'static str; 2],
}

/// The values the binary ships with.
const SHIPPED: Defaults = Defaults {
    store: StoreDefaults {
        host: "localhost",
        port: 5432,
    },
    routes: ["api", "health"],
};

/// A deployment moves the store to another port and leaves the rest alone.
fn deployed() -> Result<Config, Report<LoadError>> {
    Loader::new()
        .with_defaults(SHIPPED)
        .with_defaults(json!({ "store": { "port": 6543 } }))
        .load()
}

/// A deployment sets the port to a password by mistake.
fn misconfigured() -> Result<Config, Report<LoadError>> {
    Loader::new()
        .with_defaults(SHIPPED)
        .with_defaults(json!({ "store": { "port": "hunter2" } }))
        .load()
}

fn main() {
    let config = deployed().expect("the deployed defaults should load");
    println!(
        "{}:{} serving {:?}",
        config.store.host, config.store.port, config.routes
    );

    let report = misconfigured().expect_err("a password should not load as a port");
    println!("\n{report:?}");
}

#[test]
fn deployment_overrides_shipped_port() {
    let config = deployed().expect("the deployed defaults should load");

    assert_eq!(
        config.store.host, "localhost",
        "the shipped host should survive the deployment layer"
    );
    assert_eq!(
        config.store.port, 6543,
        "the deployment layer should replace the shipped port"
    );
}

#[test]
fn report_names_key_not_password() {
    let report = misconfigured().expect_err("a password should not load as a port");
    let rendered = format!("{report:?}");

    assert!(
        rendered.contains("store.port"),
        "the report should name the key: {report:?}"
    );
    assert!(
        !rendered.contains("hunter2"),
        "the report should omit the value: {report:?}"
    );
}
