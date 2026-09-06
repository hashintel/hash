#![expect(
    clippy::result_large_err,
    reason = "Figment's Jail fixes the test closures' error type"
)]

use std::fs;

use error_stack::{
    Report,
    fmt::{Charset, ColorMode},
};
use figment::Jail;
use hash_config::{LoadError, Loader};
use serde_json::json;

const SECRET: &str = "this-value-must-not-appear-in-an-error";

#[derive(Debug, serde::Deserialize, PartialEq, Eq)]
struct Config {
    store: Store,
    routes: Vec<String>,
}

#[derive(Debug, serde::Deserialize, PartialEq, Eq)]
struct Store {
    host: String,
    port: u16,
}

/// Snapshot the full diagnostic after checking that redaction already happened in the loader.
fn assert_report(name: &str, report: &Report<LoadError>, jail: &Jail) {
    Report::set_color_mode(ColorMode::None);
    Report::set_charset(Charset::Utf8);
    let rendered = format!("{report:?}");
    assert!(
        !rendered.contains(SECRET),
        "the unfiltered report should withhold the secret: {rendered}"
    );

    let rendered = rendered.replace(jail.directory().to_string_lossy().as_ref(), "[config-dir]");
    let mut settings = insta::Settings::clone_current();
    // Rust call-site positions move as code changes; TOML error positions remain part of the test.
    settings.add_filter(r"(\.rs):\d+:\d+", "$1:[line]:[column]");
    let _scope = settings.bind_to_scope();
    insta::assert_snapshot!(name, rendered);
}

/// Reading is deferred until load, so adding a path does not snapshot its contents.
#[test]
fn file_deferred_read() {
    Jail::expect_with(|jail| {
        let loader = Loader::new().with_file("config.toml");
        jail.create_file(
            "config.toml",
            "routes = ['api']\n[store]\nhost = 'localhost'\nport = 5432\n",
        )?;

        let config = loader
            .load::<Config>()
            .expect("the required TOML file should load");

        assert_eq!(
            config.store.host, "localhost",
            "the host should come from the file"
        );
        assert_eq!(
            config.store.port, 5432,
            "the port should come from the file"
        );
        assert_eq!(
            config.routes,
            ["api"],
            "the routes should come from the file"
        );
        Ok(())
    });
}

/// Source precedence holds even when defaults are added after a file.
#[test]
fn file_defaults_precedence() {
    Jail::expect_with(|jail| {
        jail.create_file("config.toml", "[store]\nport = 6543\n")?;

        for file_first in [false, true] {
            let defaults = json!({
                "store": { "host": "localhost", "port": 5432 },
                "routes": ["api"],
            });
            let loader = if file_first {
                Loader::new()
                    .with_file("config.toml")
                    .with_defaults(defaults)
            } else {
                Loader::new()
                    .with_defaults(defaults)
                    .with_file("config.toml")
            };
            let config = loader
                .load::<Config>()
                .expect("the defaults and file should compose");

            assert_eq!(
                config.store.port, 6543,
                "the file should override every default"
            );
            assert_eq!(
                config.store.host, "localhost",
                "the default host should survive"
            );
            assert_eq!(config.routes, ["api"], "the default routes should survive");
        }
        Ok(())
    });
}

/// Files form partial contributions: maps merge and later arrays replace whole arrays.
#[test]
fn files_order_and_merge() {
    Jail::expect_with(|jail| {
        jail.create_file(
            "first.toml",
            "routes = ['api', 'health']\n[store]\nport = 5432\n",
        )?;
        jail.create_file(
            "second.toml",
            "routes = ['metrics']\n[store]\nhost = 'database'\nport = 6543\n",
        )?;

        for (files, expected_port, expected_routes) in [
            (["first.toml", "second.toml"], 6543, vec!["metrics"]),
            (["second.toml", "first.toml"], 5432, vec!["api", "health"]),
        ] {
            let config = files
                .into_iter()
                .fold(Loader::new(), Loader::with_file)
                .load::<Config>()
                .expect("the partial TOML files should compose");

            assert_eq!(
                config.store.host, "database",
                "the host should survive either file order"
            );
            assert_eq!(
                config.store.port, expected_port,
                "the later file should supply the port"
            );
            assert_eq!(
                config.routes, expected_routes,
                "the later file should replace the routes"
            );
        }
        Ok(())
    });
}

/// Explicitly naming an absent file is an error even when defaults are complete.
#[test]
fn file_missing() {
    Jail::expect_with(|jail| {
        let report = Loader::new()
            .with_defaults(json!({ "store": { "host": "localhost", "port": 5432 }, "routes": [] }))
            .with_file("missing.toml")
            .load::<Config>()
            .expect_err("the absent required file should fail the load");

        assert_eq!(
            report.current_context(),
            &LoadError::ReadFile,
            "the error should identify a read failure"
        );
        assert_eq!(
            report
                .downcast_ref::<std::io::Error>()
                .map(std::io::Error::kind),
            Some(std::io::ErrorKind::NotFound),
            "the report should preserve the IO cause"
        );
        assert_report("file_missing", &report, jail);
        Ok(())
    });
}

/// A directory cannot silently contribute an empty file layer.
#[test]
fn file_directory() {
    Jail::expect_with(|jail| {
        let report = Loader::new()
            .with_file(jail.directory())
            .load::<Config>()
            .expect_err("the directory should fail as a configuration file");

        assert_eq!(
            report.current_context(),
            &LoadError::ReadFile,
            "the error should identify a read failure"
        );
        assert_eq!(
            report
                .downcast_ref::<std::io::Error>()
                .map(std::io::Error::kind),
            Some(std::io::ErrorKind::IsADirectory),
            "the report should preserve the directory IO cause"
        );
        assert_report("file_directory", &report, jail);
        Ok(())
    });
}

/// Invalid encoding must not expose the bytes read from the file.
#[test]
fn file_non_utf8() {
    Jail::expect_with(|jail| {
        let mut contents = SECRET.as_bytes().to_vec();
        contents.push(0xFF);
        fs::write("config.toml", contents).expect("the invalid UTF-8 fixture should be written");

        let report = Loader::new()
            .with_file("config.toml")
            .load::<Config>()
            .expect_err("the non-UTF-8 file should fail the load");
        assert_eq!(
            report.current_context(),
            &LoadError::ReadFile,
            "the error should identify a read failure"
        );
        assert_eq!(
            report
                .downcast_ref::<std::io::Error>()
                .map(std::io::Error::kind),
            Some(std::io::ErrorKind::InvalidData),
            "the report should preserve the encoding IO cause"
        );
        assert_report("file_non_utf8", &report, jail);
        Ok(())
    });
}

/// A syntax error reports its position without retaining the parser's source excerpt.
#[test]
fn file_malformed_redaction() {
    Jail::expect_with(|jail| {
        jail.create_file("config.toml", &format!("# ü\npassword = \"{SECRET}\n"))?;

        let report = Loader::new()
            .with_file("config.toml")
            .load::<Config>()
            .expect_err("the unterminated string should fail TOML parsing");
        assert_eq!(
            report.current_context(),
            &LoadError::ParseFile,
            "the error should identify malformed TOML"
        );
        assert!(
            !report.contains::<toml::de::Error>(),
            "the report should not retain the source-bearing TOML error"
        );
        assert_report("file_malformed_redaction", &report, jail);
        Ok(())
    });
}

/// Deserialization errors retain the winning file and key while redacting the value.
#[test]
fn file_invalid_value() {
    Jail::expect_with(|jail| {
        jail.create_file("config.toml", &format!("[store]\nport = '{SECRET}'\n"))?;
        let report = Loader::new()
            .with_defaults(json!({ "store": { "host": "localhost" }, "routes": [] }))
            .with_file("config.toml")
            .load::<Config>()
            .expect_err("the string should not deserialize as a port");
        assert_eq!(
            report.current_context(),
            &LoadError::Invalid,
            "the error should identify invalid configuration"
        );
        assert_report("file_invalid_value", &report, jail);
        Ok(())
    });
}

/// A valid partial TOML document does not supply missing required fields.
#[test]
fn file_missing_required_value() {
    Jail::expect_with(|jail| {
        jail.create_file("config.toml", "routes = []\n[store]\nhost = 'localhost'\n")?;
        let report = Loader::new()
            .with_file("config.toml")
            .load::<Config>()
            .expect_err("the absent port should fail the load");
        assert_eq!(
            report.current_context(),
            &LoadError::Invalid,
            "the error should identify incomplete configuration"
        );
        assert_report("file_missing_required_value", &report, jail);
        Ok(())
    });
}
