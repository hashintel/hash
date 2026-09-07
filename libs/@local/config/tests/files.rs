#![expect(
    clippy::result_large_err,
    reason = "Figment's Jail fixes the test closures' error type"
)]

use core::assert_matches;
#[cfg(unix)]
use std::{ffi::OsString, os::unix::ffi::OsStringExt as _, path::PathBuf};
use std::{fs, path::Path};

use error_stack::{
    Report,
    fmt::{Charset, ColorMode},
};
use figment::Jail;
use hash_config::{FileFormat, LoadError, Loader};
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
        let loader = Loader::new().with_toml_file("config.toml");
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
                    .with_toml_file("config.toml")
                    .with_defaults(defaults)
            } else {
                Loader::new()
                    .with_defaults(defaults)
                    .with_toml_file("config.toml")
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
                .fold(Loader::new(), Loader::with_toml_file)
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

/// Only the merged configuration must fit the target type, so a later file can correct a value.
#[test]
fn files_overridden_invalid_value() {
    Jail::expect_with(|jail| {
        jail.create_file(
            "invalid.toml",
            "routes = ['api']\n[store]\nhost = 'localhost'\nport = 'not-a-number'\n",
        )?;
        jail.create_file("correction.toml", "[store]\nport = 5432\n")?;

        let report = Loader::new()
            .with_toml_file("invalid.toml")
            .load::<Config>()
            .expect_err("the uncorrected port should fail deserialization");
        assert_matches!(
            report.current_context(),
            LoadError::Invalid,
            "the error should identify an invalid configuration"
        );

        let config = Loader::new()
            .with_toml_file("invalid.toml")
            .with_toml_file("correction.toml")
            .load::<Config>()
            .expect("the later file should correct the port");

        assert_eq!(
            config,
            Config {
                store: Store {
                    host: "localhost".to_owned(),
                    port: 5432,
                },
                routes: vec!["api".to_owned()],
            },
            "the corrected port and untouched values should survive the merge"
        );
        Ok(())
    });
}

/// An empty file contributes no values, regardless of its position among the file layers.
#[test]
fn files_empty_layer() {
    Jail::expect_with(|jail| {
        jail.create_file("empty.toml", "")?;
        jail.create_file(
            "config.toml",
            "routes = ['api']\n[store]\nhost = 'localhost'\nport = 5432\n",
        )?;

        for files in [["empty.toml", "config.toml"], ["config.toml", "empty.toml"]] {
            let config = files
                .into_iter()
                .fold(Loader::new(), Loader::with_toml_file)
                .load::<Config>()
                .expect("the empty file should compose with the configuration file");

            assert_eq!(
                config,
                Config {
                    store: Store {
                        host: "localhost".to_owned(),
                        port: 5432,
                    },
                    routes: vec!["api".to_owned()],
                },
                "the empty file should preserve the complete configuration in either position"
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
            .with_optional_toml_file("missing.toml")
            .with_toml_file("missing.toml")
            .load::<Config>()
            .expect_err("the absent required file should fail the load");

        assert_matches!(
            report.current_context(),
            LoadError::ReadFile { path } if path == Path::new("missing.toml"),
            "the error should identify a read failure and retain the original path"
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
        for loader in [
            Loader::new().with_toml_file(jail.directory()),
            Loader::new().with_optional_toml_file(jail.directory()),
        ] {
            let report = loader
                .load::<Config>()
                .expect_err("the directory should fail as a configuration file");

            assert_matches!(
                report.current_context(),
                LoadError::ReadFile { path } if path == jail.directory(),
                "the error should identify a read failure and retain the original path"
            );
            assert_eq!(
                report
                    .downcast_ref::<std::io::Error>()
                    .map(std::io::Error::kind),
                Some(std::io::ErrorKind::IsADirectory),
                "the report should preserve the directory IO cause"
            );
            assert_report("file_directory", &report, jail);
        }
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

        for loader in [
            Loader::new().with_toml_file("config.toml"),
            Loader::new().with_optional_toml_file("config.toml"),
        ] {
            let report = loader
                .load::<Config>()
                .expect_err("the non-UTF-8 file should fail the load");
            assert_matches!(
                report.current_context(),
                LoadError::ReadFile { path } if path == Path::new("config.toml"),
                "the error should identify a read failure and retain the original path"
            );
            assert_eq!(
                report
                    .downcast_ref::<std::io::Error>()
                    .map(std::io::Error::kind),
                Some(std::io::ErrorKind::InvalidData),
                "the report should preserve the encoding IO cause"
            );
            assert_report("file_non_utf8", &report, jail);
        }
        Ok(())
    });
}

/// A syntax error reports its position without retaining the parser's source excerpt.
#[test]
fn file_malformed_redaction() {
    Jail::expect_with(|jail| {
        jail.create_file("config.toml", &format!("# ü\npassword = \"{SECRET}\n"))?;

        for loader in [
            Loader::new().with_toml_file("config.toml"),
            Loader::new().with_optional_toml_file("config.toml"),
        ] {
            let report = loader
                .load::<Config>()
                .expect_err("the unterminated string should fail TOML parsing");
            assert_matches!(
                report.current_context(),
                LoadError::ParseFile { path, format: FileFormat::Toml }
                    if path == Path::new("config.toml"),
                "the error should identify the TOML format and retain the original path"
            );
            assert!(
                !report.contains::<toml::de::Error>(),
                "the report should not retain the source-bearing TOML error"
            );
            assert_report("file_malformed_redaction", &report, jail);
        }
        Ok(())
    });
}

/// Read errors retain the original path even when its bytes are not valid UTF-8.
#[cfg(unix)]
#[test]
fn file_non_utf8_path() {
    Jail::expect_with(|_jail| {
        let path = PathBuf::from(OsString::from_vec(b"config-\xFF.toml".to_vec()));
        let report = Loader::new()
            .with_toml_file(&path)
            .load::<Config>()
            .expect_err("the unreadable file path should fail the load");
        assert_matches!(
            report.current_context(),
            LoadError::ReadFile { path: actual_path } if actual_path == &path,
            "the error should identify a read failure and preserve the original path bytes"
        );
        Ok(())
    });
}

/// Parse errors name the selected parser even when the extension suggests another format.
#[test]
fn file_format_explicit() {
    Jail::expect_with(|jail| {
        jail.create_file(
            "config.json",
            &json!({ "host": "localhost", "port": 5432 }).to_string(),
        )?;

        for loader in [
            Loader::new().with_toml_file("config.json"),
            Loader::new().with_optional_toml_file("config.json"),
        ] {
            let report = loader
                .load::<Store>()
                .expect_err("the JSON document should fail TOML parsing");

            assert_matches!(
                report.current_context(),
                LoadError::ParseFile { path, format: FileFormat::Toml }
                    if path == Path::new("config.json"),
                "the error should name the selected TOML parser regardless of the file extension"
            );
        }
        Ok(())
    });
}

/// Deserialization errors retain the winning file and key while redacting the value.
#[test]
fn file_invalid_value() {
    Jail::expect_with(|jail| {
        jail.create_file("config.toml", &format!("[store]\nport = '{SECRET}'\n"))?;
        for loader in [
            Loader::new().with_toml_file("config.toml"),
            Loader::new().with_optional_toml_file("config.toml"),
        ] {
            let report = loader
                .with_defaults(json!({ "store": { "host": "localhost" }, "routes": [] }))
                .load::<Config>()
                .expect_err("the string should not deserialize as a port");
            assert_matches!(
                report.current_context(),
                LoadError::Invalid,
                "the error should identify invalid configuration"
            );
            assert_report("file_invalid_value", &report, jail);
        }
        Ok(())
    });
}

/// A valid partial TOML document does not supply missing required fields.
#[test]
fn file_missing_required_value() {
    Jail::expect_with(|jail| {
        jail.create_file("config.toml", "routes = []\n[store]\nhost = 'localhost'\n")?;
        let report = Loader::new()
            .with_toml_file("config.toml")
            .load::<Config>()
            .expect_err("the absent port should fail the load");
        assert_matches!(
            report.current_context(),
            LoadError::Invalid,
            "the error should identify incomplete configuration"
        );
        assert_report("file_missing_required_value", &report, jail);
        Ok(())
    });
}

/// An absent optional file contributes no values, including when its parent directory is absent.
#[test]
fn optional_file_missing() {
    Jail::expect_with(|_jail| {
        for path in ["missing.toml", "missing/config.toml"] {
            let config = Loader::new()
                .with_defaults(json!({ "host": "localhost", "port": 5432 }))
                .with_optional_toml_file(path)
                .load::<Store>()
                .expect("the absent optional file should leave the defaults intact");

            assert_eq!(
                config,
                Store {
                    host: "localhost".to_owned(),
                    port: 5432,
                },
                "the defaults should survive an absent optional file"
            );
        }
        Ok(())
    });
}

/// Skipping an absent file does not waive required configuration fields.
#[test]
fn optional_file_missing_required_value() {
    Jail::expect_with(|_jail| {
        let report = Loader::new()
            .with_defaults(json!({ "host": "localhost" }))
            .with_optional_toml_file("missing.toml")
            .load::<Store>()
            .expect_err("the missing port should still fail deserialization");

        assert_matches!(
            report.current_context(),
            LoadError::Invalid,
            "the error should identify an incomplete configuration"
        );
        assert!(
            format!("{report:?}").contains("missing field `port`"),
            "the report should name the missing field: {report:?}"
        );
        Ok(())
    });
}

/// A file created after adding its path is read as TOML, independent of its extension.
#[test]
fn optional_file_deferred_read() {
    Jail::expect_with(|jail| {
        let loader = Loader::new().with_optional_toml_file("config.local");
        jail.create_file("config.local", "host = 'database'\nport = 6543\n")?;

        let config = loader
            .load::<Store>()
            .expect("the optional file created before load should be read");

        assert_eq!(
            config,
            Store {
                host: "database".to_owned(),
                port: 6543,
            },
            "the values should come from the file created after the builder call"
        );
        Ok(())
    });
}

/// A file removed before load is skipped even if it existed when its path was added.
#[test]
fn optional_file_removed_before_load() {
    Jail::expect_with(|jail| {
        jail.create_file("config.toml", "port = 6543\n")?;
        let loader = Loader::new()
            .with_defaults(json!({ "host": "localhost", "port": 5432 }))
            .with_optional_toml_file("config.toml");
        fs::remove_file("config.toml").expect("the optional file should be removed before load");

        let config = loader
            .load::<Store>()
            .expect("the removed optional file should be skipped");

        assert_eq!(
            config.port, 5432,
            "the default port should survive the removed optional file"
        );
        Ok(())
    });
}

/// Required and optional files share one order above defaults; absent layers leave it intact.
#[test]
fn files_required_optional_order() {
    Jail::expect_with(|jail| {
        jail.create_file(
            "required.toml",
            "routes = ['api', 'health']\n[store]\nport = 5432\n",
        )?;
        jail.create_file(
            "optional.toml",
            "routes = ['metrics']\n[store]\nhost = 'database'\nport = 6543\n",
        )?;

        for (loader, expected_port, expected_routes) in [
            (
                Loader::new()
                    .with_toml_file("required.toml")
                    .with_optional_toml_file("missing.toml")
                    .with_optional_toml_file("optional.toml"),
                6543,
                vec!["metrics"],
            ),
            (
                Loader::new()
                    .with_optional_toml_file("optional.toml")
                    .with_toml_file("required.toml")
                    .with_optional_toml_file("missing.toml"),
                5432,
                vec!["api", "health"],
            ),
        ] {
            let config = loader
                .with_defaults(json!({
                    "store": { "host": "localhost", "port": 1234 },
                    "routes": ["default"],
                }))
                .load::<Config>()
                .expect("the required and optional files should compose above the defaults");

            assert_eq!(
                config.store.host, "database",
                "the optional file's host should override defaults and survive either file order"
            );
            assert_eq!(
                config.store.port, expected_port,
                "the later present file should supply the port"
            );
            assert_eq!(
                config.routes, expected_routes,
                "the later present file should replace the routes"
            );
        }
        Ok(())
    });
}
