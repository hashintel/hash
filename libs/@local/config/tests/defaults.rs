use core::fmt;
use std::collections::HashMap;

use hash_config::Loader;
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

#[derive(serde::Serialize)]
struct Defaults {
    store: StoreDefaults,
    routes: Vec<&'static str>,
}

#[derive(serde::Serialize)]
struct StoreDefaults {
    host: &'static str,
    port: u16,
}

fn defaults() -> Defaults {
    Defaults {
        store: StoreDefaults {
            host: "localhost",
            port: 5432,
        },
        routes: vec!["api", "health"],
    }
}

#[test]
fn programmatic_defaults_load() {
    let config = Loader::new()
        .with_defaults(defaults())
        .load::<Config>()
        .expect("the complete defaults should load");

    assert_eq!(config.store.host, "localhost");
    assert_eq!(config.store.port, 5432);
    assert_eq!(config.routes, ["api", "health"]);
}

#[test]
fn later_defaults_merge_maps_and_replace_arrays() {
    let config = Loader::new()
        .with_defaults(defaults())
        .with_defaults(json!({
            "store": { "port": 6543 },
            "routes": ["metrics"],
        }))
        .load::<Config>()
        .expect("the composed defaults should load");

    assert_eq!(config.store.host, "localhost");
    assert_eq!(config.store.port, 6543);
    assert_eq!(config.routes, ["metrics"]);
}

#[test]
fn missing_required_value_fails() {
    #[derive(Debug, serde::Deserialize)]
    #[expect(dead_code, reason = "the field exists to make deserialization fail")]
    struct Required {
        password: String,
    }

    let report = Loader::new()
        .load::<Required>()
        .expect_err("the missing password should fail the load");

    assert_eq!(report.current_context(), &hash_config::LoadError::Invalid);
    assert!(
        format!("{report:?}").contains("password"),
        "the report should name the missing field: {report:?}"
    );
}

#[test]
fn defaults_require_map() {
    let report = Loader::new()
        .with_defaults(SECRET)
        .load::<Config>()
        .expect_err("a scalar default document should fail the load");
    let rendered = format!("{report:?}");

    assert_eq!(report.current_context(), &hash_config::LoadError::Invalid);
    assert!(
        rendered.contains("invalid type: found string"),
        "the report should identify the rejected value kind: {report:?}"
    );
    assert!(
        !rendered.contains(SECRET),
        "the report should redact the rejected value: {report:?}"
    );
}

#[test]
fn defaults_require_string_keys() {
    let report = Loader::new()
        .with_defaults(HashMap::from([(4096_u16, "value")]))
        .load::<Config>()
        .expect_err("a numeric map key should fail the load");
    let rendered = format!("{report:?}");

    assert_eq!(report.current_context(), &hash_config::LoadError::Invalid);
    assert!(
        rendered.contains("expected `string`"),
        "the report should explain the supported key shape: {report:?}"
    );
    assert!(
        !rendered.contains("4096"),
        "the report should redact the rejected key: {report:?}"
    );
}

#[test]
fn load_redacts_mistyped_values() {
    #[derive(Debug, serde::Deserialize)]
    #[expect(dead_code, reason = "the field exists to make deserialization fail")]
    struct SecretConfig {
        api_key: u16,
    }

    let report = Loader::new()
        .with_defaults(json!({ "api_key": SECRET }))
        .load::<SecretConfig>()
        .expect_err("a string API key should not deserialize as a number");
    let rendered = format!("{report:?}");

    assert_eq!(report.current_context(), &hash_config::LoadError::Invalid);
    assert!(
        rendered.contains("invalid type: found string"),
        "the report should identify the rejected value kind: {report:?}"
    );
    assert!(
        !rendered.contains(SECRET),
        "the report should redact the rejected value: {report:?}"
    );
}

#[test]
fn load_redacts_numeric_overflow() {
    #[derive(Debug, serde::Deserialize)]
    #[expect(dead_code, reason = "the field exists to make deserialization fail")]
    struct SmallConfig {
        retries: i8,
    }

    let report = Loader::new()
        .with_defaults(json!({ "retries": 4096 }))
        .load::<SmallConfig>()
        .expect_err("an overflowing number should not deserialize as i8");
    let rendered = format!("{report:?}");

    assert_eq!(report.current_context(), &hash_config::LoadError::Invalid);
    assert!(
        rendered.contains("invalid value: found unsigned integer"),
        "the report should name the rejected value kind: {report:?}"
    );
    assert!(
        !rendered.contains("4096"),
        "the report should redact the rejected number: {report:?}"
    );
}

#[test]
fn load_redacts_unknown_variants() {
    #[derive(Debug, serde::Deserialize)]
    enum Level {
        Debug,
        Info,
    }

    #[derive(Debug, serde::Deserialize)]
    #[expect(dead_code, reason = "the field exists to make deserialization fail")]
    struct LevelConfig {
        level: Level,
    }

    let report = Loader::new()
        .with_defaults(json!({ "level": SECRET }))
        .load::<LevelConfig>()
        .expect_err("an unknown variant name should fail the load");
    let rendered = format!("{report:?}");

    assert_eq!(report.current_context(), &hash_config::LoadError::Invalid);
    assert!(
        rendered.contains("`Debug`") && rendered.contains("`Info`"),
        "the report should list the expected variants: {report:?}"
    );
    assert!(
        !rendered.contains(SECRET),
        "the report should redact the rejected variant name: {report:?}"
    );
}

#[test]
fn load_names_map_keys() {
    #[derive(Debug, serde::Deserialize)]
    #[expect(dead_code, reason = "the field exists to make deserialization fail")]
    struct MapConfig {
        values: HashMap<String, u16>,
    }

    let values = HashMap::from([("alpha", SECRET)]);
    let report = Loader::new()
        .with_defaults(json!({ "values": values }))
        .load::<MapConfig>()
        .expect_err("a string map value should not deserialize as a number");
    let rendered = format!("{report:?}");

    assert_eq!(report.current_context(), &hash_config::LoadError::Invalid);
    assert!(
        rendered.contains("values.alpha"),
        "the report should name the key a map entry sits under: {report:?}"
    );
    assert!(
        !rendered.contains(SECRET),
        "the report should redact the rejected value: {report:?}"
    );
}

#[test]
fn load_names_unknown_fields() {
    #[derive(Debug, serde::Deserialize)]
    #[serde(deny_unknown_fields)]
    #[expect(dead_code, reason = "the field exists to make deserialization fail")]
    struct StrictConfig {
        enabled: bool,
    }

    let values = HashMap::from([("enabled", json!(true)), ("enalbed", json!(false))]);
    let report = Loader::new()
        .with_defaults(values)
        .load::<StrictConfig>()
        .expect_err("an unknown field should fail the load");
    let rendered = format!("{report:?}");

    assert_eq!(report.current_context(), &hash_config::LoadError::Invalid);
    assert!(
        rendered.contains("`enalbed`"),
        "the report should name the field it did not recognise: {report:?}"
    );
    assert!(
        rendered.contains("`enabled`"),
        "the report should list the fields it accepts: {report:?}"
    );
}

#[test]
fn load_reports_serde_expectations() {
    const EXPECTATION: &str = "a port number the registry has not claimed";

    #[derive(Debug)]
    struct Bespoke;

    impl<'de> serde::Deserialize<'de> for Bespoke {
        fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
        where
            D: serde::Deserializer<'de>,
        {
            struct BespokeVisitor;

            impl serde::de::Visitor<'_> for BespokeVisitor {
                type Value = Bespoke;

                fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                    formatter.write_str(EXPECTATION)
                }

                fn visit_u64<E>(self, _value: u64) -> Result<Self::Value, E>
                where
                    E: serde::de::Error,
                {
                    Ok(Bespoke)
                }
            }

            deserializer.deserialize_u64(BespokeVisitor)
        }
    }

    #[derive(Debug, serde::Deserialize)]
    #[expect(dead_code, reason = "the field exists to make deserialization fail")]
    struct ExpectedConfig {
        value: Bespoke,
    }

    let report = Loader::new()
        .with_defaults(json!({ "value": SECRET }))
        .load::<ExpectedConfig>()
        .expect_err("a string should not deserialize as the expected integer");
    let rendered = format!("{report:?}");

    assert_eq!(report.current_context(), &hash_config::LoadError::Invalid);
    assert!(
        rendered.contains(EXPECTATION),
        "the report should carry the visitor's expectation: {report:?}"
    );
    assert!(
        !rendered.contains(SECRET),
        "the report should redact the rejected value: {report:?}"
    );
}

#[test]
fn load_reports_every_failing_layer() {
    let report = Loader::new()
        .with_defaults(1_u16)
        .with_defaults("text")
        .load::<Config>()
        .expect_err("both scalar default documents should fail the load");
    let rendered = format!("{report:?}");

    assert_eq!(report.current_context(), &hash_config::LoadError::Invalid);
    assert!(
        rendered.contains("found unsigned integer"),
        "the report should name the first failing layer: {report:?}"
    );
    assert!(
        rendered.contains("found string"),
        "the report should name the second failing layer: {report:?}"
    );
}

#[test]
fn load_defers_and_redacts_serialization_errors() {
    struct InvalidDefaults;

    impl serde::Serialize for InvalidDefaults {
        fn serialize<S>(&self, _serializer: S) -> Result<S::Ok, S::Error>
        where
            S: serde::Serializer,
        {
            Err(<S::Error as serde::ser::Error>::custom(SECRET))
        }
    }

    let loader = Loader::new().with_defaults(InvalidDefaults);
    let report = loader
        .load::<Config>()
        .expect_err("the serialization failure should be reported by load");
    let rendered = format!("{report:?}");

    assert_eq!(report.current_context(), &hash_config::LoadError::Invalid);
    assert!(
        rendered.contains("tests/defaults.rs"),
        "the report should name the call site of the failing layer: {report:?}"
    );
    assert!(
        !rendered.contains(SECRET),
        "the report should redact the serializer message: {report:?}"
    );
}

#[test]
fn error_names_key_not_value() {
    let report = Loader::new()
        .with_defaults(json!({
            "store": { "host": "localhost", "port": SECRET },
            "routes": [],
        }))
        .load::<Config>()
        .expect_err("a string port should fail the load");
    let rendered = format!("{report:?}");

    assert!(
        rendered.contains("store.port"),
        "the report should name the key: {report:?}"
    );
    assert!(
        !rendered.contains(SECRET),
        "the report should omit the value: {report:?}"
    );
}
