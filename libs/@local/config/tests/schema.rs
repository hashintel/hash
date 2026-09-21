#![expect(
    dead_code,
    reason = "the fixture fields describe configuration schemas"
)]

extern crate alloc;

use alloc::collections::BTreeMap;
use core::{assert_matches, time::Duration};

use hash_config::{LoadError, Loader, partial_json_schema};
use jsonschema::{Validator, error::ValidationErrorKind};
use schemars::{JsonSchema, Schema, SchemaGenerator};
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Debug, Deserialize, JsonSchema)]
struct Store {
    /// Database hostname.
    host: String,
    /// Database port.
    port: u16,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
struct Logging {
    log_level: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Backend {
    Memory { capacity: u32 },
    Disk { directory: String },
}

#[derive(Debug, Deserialize, JsonSchema)]
struct Config {
    store: Store,
    #[serde(flatten)]
    logging: Logging,
    backend: Backend,
}

#[derive(JsonSchema)]
#[serde(tag = "kind")]
enum InternalNewtype {
    Database(Store),
    Memory { capacity: u32 },
}

#[derive(JsonSchema)]
#[serde(tag = "kind", content = "settings")]
enum Adjacent {
    Database(Store),
    Memory { capacity: u32 },
}

#[derive(JsonSchema)]
enum External {
    Database(Store),
    Memory { capacity: u32 },
}

#[derive(JsonSchema)]
#[serde(untagged)]
enum Untagged {
    Database(Store),
    Path(String),
}

// An unconstrained variant accepts every key, so the enclosing object stays open.
#[derive(JsonSchema)]
#[serde(untagged)]
enum Unconstrained {
    Typed(Store),
    Raw(Value),
}

#[derive(JsonSchema)]
struct WithUnconstrained {
    extra: Unconstrained,
}

#[derive(JsonSchema)]
#[serde(untagged)]
enum Transport {
    Network { port: u16 },
    Local { socket: String },
}

#[derive(JsonSchema)]
#[serde(tag = "mode")]
enum Mode {
    Read { path: String },
    Write { buffer: u32 },
}

#[derive(JsonSchema)]
struct FlattenedEnum {
    enabled: bool,
    #[serde(flatten)]
    backend: Backend,
}

// Two flattened enums leave `oneOf` and `anyOf` on the same object.
#[derive(JsonSchema)]
struct FlattenedEnumPair {
    #[serde(flatten)]
    backend: Backend,
    #[serde(flatten)]
    transport: Transport,
}

// A third flattened enum collides with the first, which schemars folds into `allOf`.
#[derive(JsonSchema)]
struct FlattenedEnumTriple {
    #[serde(flatten)]
    backend: Backend,
    #[serde(flatten)]
    transport: Transport,
    #[serde(flatten)]
    mode: Mode,
}

#[derive(JsonSchema)]
struct FlattenedExternal {
    #[serde(flatten)]
    backend: External,
}

#[derive(JsonSchema)]
struct FlattenedMap {
    enabled: bool,
    #[serde(flatten)]
    stores: BTreeMap<String, Store>,
}

// Flattening a typed map beside an enum moves the map into `unevaluatedProperties`.
#[derive(JsonSchema)]
struct FlattenedTypedMapEnum {
    #[serde(flatten)]
    backend: Backend,
    #[serde(flatten)]
    stores: BTreeMap<String, Store>,
}

// The same with unconstrained values leaves `unevaluatedProperties: true`.
#[derive(JsonSchema)]
struct FlattenedOpenMapEnum {
    #[serde(flatten)]
    backend: Backend,
    #[serde(flatten)]
    extra: BTreeMap<String, Value>,
}

#[derive(JsonSchema)]
struct Aliased {
    #[serde(alias = "old-host")]
    host: String,
}

#[derive(JsonSchema)]
struct Collections {
    stores: Vec<Store>,
    named: BTreeMap<String, Store>,
    optional: Option<Store>,
    pair: (Store, u16),
}

#[derive(JsonSchema)]
struct Tree {
    root: Node,
}

#[derive(JsonSchema)]
struct Node {
    name: String,
    children: Vec<Self>,
}

// A heuristic recognising an externally tagged variant by shape would misread this one.
#[derive(JsonSchema)]
#[serde(deny_unknown_fields)]
struct SingleField {
    value: u16,
}

#[derive(JsonSchema)]
#[serde(untagged)]
enum UntaggedSingleField {
    Single(SingleField),
    Path(String),
}

#[derive(JsonSchema)]
struct DeserializationNames {
    #[serde(rename(deserialize = "input", serialize = "output"))]
    field: u16,
    #[serde(skip_deserializing)]
    internal: u16,
}

// `required` names a field here, not the keyword.
#[derive(JsonSchema)]
struct KeywordNames {
    required: Store,
}

fn metadata() -> Value {
    json!({"required":["name"], "oneOf":[{"type":"object"}]})
}

#[derive(JsonSchema)]
struct Annotated {
    #[schemars(default = "metadata")]
    metadata: Value,
}

// Keywords `transform_subschemas` does not visit, reachable only through `extend`.
#[derive(JsonSchema)]
#[schemars(extend("dependentRequired" = json!({ "trigger": ["other"] })))]
#[schemars(extend("dependentSchemas" = json!({
    "trigger": { "properties": { "dependent": Store::json_schema(&mut SchemaGenerator::default()) } }
})))]
struct ExtendedKeywords {
    trigger: u8,
    other: u8,
}

// `contains`/`unevaluatedItems` and an object without a `type` reach arms schemars never emits.
#[derive(JsonSchema)]
#[schemars(extend("properties" = json!({
    "ports": {
        "type": "array",
        "contains": Store::json_schema(&mut SchemaGenerator::default()),
        "unevaluatedItems": Store::json_schema(&mut SchemaGenerator::default())
    },
    "typeless": { "properties": { "inner": Store::json_schema(&mut SchemaGenerator::default()) } }
})))]
#[expect(
    clippy::empty_structs_with_brackets,
    reason = "a unit struct would carry `type: null` instead of an object"
)]
struct UntypedShapes {}

// A root that denies unknown fields carries `additionalProperties` beside the inserted close.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
struct StrictRoot {
    host: String,
    port: u16,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
enum LogFormat {
    Full,
    Json,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
struct Telemetry {
    log_format: LogFormat,
    log_level: Option<LogFormat>,
}

#[derive(JsonSchema)]
struct OptionalEnum {
    backend: Option<Backend>,
}

#[derive(JsonSchema)]
struct Timeouts {
    request: Duration,
}

#[derive(JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Rule {
    All { rules: Vec<Self> },
    Field { name: String },
}

// `required` selects a branch inside `not` and `if` rather than constraining a value.
#[derive(JsonSchema)]
#[schemars(extend("not" = json!({ "required": ["legacy"] })))]
#[schemars(extend("if" = json!({ "required": ["tls"] })))]
#[schemars(extend("then" = json!({
    "properties": { "port": { "const": 443 } },
    "required": ["port"]
})))]
struct BranchSelectors {
    tls: bool,
    port: u16,
    legacy: Option<bool>,
}

/// Exports the schema and proves a validator accepts it as a schema document.
fn exported<C: JsonSchema>() -> Schema {
    let schema = partial_json_schema::<C>();
    jsonschema::validator_for(schema.as_value()).expect("the exported schema should compile");
    schema
}

#[test]
fn nested_struct() {
    insta::assert_json_snapshot!(exported::<Config>());
}

#[test]
fn internally_tagged_enum() {
    insta::assert_json_snapshot!(exported::<Backend>());
}

#[test]
fn internally_tagged_newtype() {
    insta::assert_json_snapshot!(exported::<InternalNewtype>());
}

#[test]
fn adjacently_tagged_enum() {
    insta::assert_json_snapshot!(exported::<Adjacent>());
}

#[test]
fn externally_tagged_enum() {
    insta::assert_json_snapshot!(exported::<External>());
}

#[test]
fn untagged_enum() {
    insta::assert_json_snapshot!(exported::<Untagged>());
}

#[test]
fn flattened_enum() {
    insta::assert_json_snapshot!(exported::<FlattenedEnum>());
}

#[test]
fn flattened_enum_pair() {
    insta::assert_json_snapshot!(exported::<FlattenedEnumPair>());
}

#[test]
fn flattened_enum_triple() {
    insta::assert_json_snapshot!(exported::<FlattenedEnumTriple>());
}

#[test]
fn flattened_external_enum() {
    insta::assert_json_snapshot!(exported::<FlattenedExternal>());
}

#[test]
fn flattened_map() {
    insta::assert_json_snapshot!(exported::<FlattenedMap>());
}

#[test]
fn collections() {
    insta::assert_json_snapshot!(exported::<Collections>());
}

#[test]
fn recursive_fields() {
    insta::assert_json_snapshot!(exported::<Tree>());
}

#[test]
fn untagged_single_field() {
    insta::assert_json_snapshot!(exported::<UntaggedSingleField>());
}

#[test]
fn deserialization_names() {
    insta::assert_json_snapshot!(exported::<DeserializationNames>());
}

#[test]
fn keyword_names() {
    insta::assert_json_snapshot!(exported::<KeywordNames>());
}

#[test]
fn default_annotation() {
    insta::assert_json_snapshot!(exported::<Annotated>());
}

#[test]
fn extended_keywords() {
    insta::assert_json_snapshot!(exported::<ExtendedKeywords>());
}

#[test]
fn branch_selectors() {
    insta::assert_json_snapshot!(exported::<BranchSelectors>());
}

#[test]
fn fieldless_enum() {
    insta::assert_json_snapshot!(exported::<Telemetry>());
}

#[test]
fn optional_enum() {
    insta::assert_json_snapshot!(exported::<OptionalEnum>());
}

#[test]
fn duration() {
    insta::assert_json_snapshot!(exported::<Timeouts>());
}

#[test]
fn flattened_typed_map_enum() {
    insta::assert_json_snapshot!(exported::<FlattenedTypedMapEnum>());
}

#[test]
fn flattened_open_map_enum() {
    insta::assert_json_snapshot!(exported::<FlattenedOpenMapEnum>());
}

#[test]
fn deserialization_alias() {
    insta::assert_json_snapshot!(exported::<Aliased>());
}

#[test]
fn unconstrained_branch() {
    insta::assert_json_snapshot!(exported::<WithUnconstrained>());
}

#[test]
fn untyped_shapes() {
    insta::assert_json_snapshot!(exported::<UntypedShapes>());
}

#[test]
fn strict_root() {
    insta::assert_json_snapshot!(exported::<StrictRoot>());
}

#[test]
fn recursive_tagged_enum() {
    insta::assert_json_snapshot!(exported::<Rule>());
}

fn validator<C: JsonSchema>() -> Validator {
    let schema = exported::<C>();
    jsonschema::validator_for(schema.as_value()).expect("the exported schema should compile")
}

fn accepts(validator: &Validator, value: &Value) {
    let errors = validator
        .iter_errors(value)
        .map(|error| error.to_string())
        .collect::<Vec<_>>();
    assert!(
        errors.is_empty(),
        "the partial configuration should validate: {value}: {errors:?}"
    );
}

#[test]
fn config_partial_values() {
    let validator = validator::<Config>();
    for value in [
        json!({}),
        json!({"store": {}}),
        json!({"store": {"port": 5432}}),
        json!({"log-level": "info"}),
        json!({"backend": {}}),
        json!({"backend": {"kind": "memory"}}),
        json!({"backend": {"capacity": 128}}),
    ] {
        accepts(&validator, &value);
    }
}

#[test]
fn flattened_enums_partial() {
    for (shape, validator, populated) in [
        (
            "one enum",
            validator::<FlattenedEnum>(),
            json!({"enabled": true, "kind": "memory", "capacity": 128}),
        ),
        (
            "two enums",
            validator::<FlattenedEnumPair>(),
            json!({"kind": "memory", "port": 8080}),
        ),
        (
            "three enums",
            validator::<FlattenedEnumTriple>(),
            json!({"kind": "memory", "socket": "/tmp/s", "mode": "Read"}),
        ),
        (
            "external enum",
            validator::<FlattenedExternal>(),
            json!({"Memory": {"capacity": 128}}),
        ),
        (
            "typed map",
            validator::<FlattenedTypedMapEnum>(),
            json!({"kind": "memory", "primary": {"port": 5432}}),
        ),
        (
            "open map",
            validator::<FlattenedOpenMapEnum>(),
            json!({"kind": "memory", "anything": [1, 2]}),
        ),
    ] {
        for value in [json!({}), populated] {
            let errors = validator
                .iter_errors(&value)
                .map(|error| error.to_string())
                .collect::<Vec<_>>();
            assert!(
                errors.is_empty(),
                "the partial file should validate against {shape}: {value}: {errors:?}"
            );
        }
    }

    let flattened = validator::<FlattenedEnum>();
    assert!(
        !flattened.is_valid(&json!({"enabled": true, "kind": "memory", "bogus": 1})),
        "the unknown key should fail beside a flattened enum"
    );

    // Flattening reopens the branches, so neither excludes the other's variant name.
    let external = validator::<FlattenedExternal>();
    accepts(&external, &json!({"Database": {}, "Memory": {}}));
}

#[test]
fn flattened_open_map_accepts_mistyped_values() {
    // Documented loss: the open map leaves the object unevaluated, and the untagged enum has a
    // variant matching whatever its siblings do not. `Loader::load` still rejects the value.
    #[derive(JsonSchema)]
    struct OpenTransport {
        #[serde(flatten)]
        transport: Transport,
        #[serde(flatten)]
        extra: BTreeMap<String, Value>,
    }

    accepts(&validator::<OpenTransport>(), &json!({"port": "oops"}));
}

#[test]
fn unconstrained_branch_accepts_any_key() {
    accepts(
        &validator::<WithUnconstrained>(),
        &json!({"extra": {"anything": 1}}),
    );
}

#[test]
fn strict_root_rejects_unknown_keys() {
    let validator = validator::<StrictRoot>();
    accepts(&validator, &json!({"host": "h"}));
    assert!(
        !validator.is_valid(&json!({"bogus": 1})),
        "the strict root should reject an unknown key"
    );
}

#[test]
fn collections_partial_entries() {
    let collections = validator::<Collections>();
    // Arrays replace rather than merge, but an element still merges with a lower layer.
    accepts(
        &collections,
        &json!({"stores": [{}], "named": {"a": {}}, "optional": null, "pair": [{}, 5432]}),
    );
    for (note, value) in [
        (
            "the map value should be closed",
            json!({"named": {"a": {"bogus": 1}}}),
        ),
        (
            "the array element should be closed",
            json!({"stores": [{"bogus": 1}]}),
        ),
        (
            "the tuple element should be closed",
            json!({"pair": [{"bogus": 1}, 1]}),
        ),
        ("the tuple should keep its arity", json!({"pair": [{}]})),
    ] {
        assert!(!collections.is_valid(&value), "{note}: {value}");
    }
}

#[test]
fn recursive_definitions_partial() {
    let tree = validator::<Tree>();
    accepts(
        &tree,
        &json!({"root": {"children": [{}, {"children": [{}]}]}}),
    );
    assert!(
        !tree.is_valid(&json!({"root": {"children": [{"bogus": 1}]}})),
        "the definition should reject an unknown key"
    );
}

#[test]
fn store_documentation() {
    let schema = exported::<Store>();
    assert_eq!(
        schema.as_value()["properties"]["host"]["description"],
        json!("Database hostname."),
        "the field documentation should reach the schema"
    );
}

#[test]
fn deserialization_alias_absent() {
    assert!(
        !validator::<Aliased>().is_valid(&json!({"old-host": "h"})),
        "the alias is not part of the schema"
    );
    accepts(&validator::<Aliased>(), &json!({"host": "h"}));
}

#[test]
fn config_unknown_keys() {
    let validator = validator::<Config>();
    for value in [
        json!({"stroe": {}}),
        json!({"store": {"prot": 5432}}),
        json!({"log_level": "info"}),
        json!({"backend": {"capcity": 128}}),
    ] {
        let error = validator
            .validate(&value)
            .expect_err("the unknown key should fail validation");
        assert_matches!(
            error.kind(),
            ValidationErrorKind::UnevaluatedProperties { .. },
            "the unknown key should be reported as unevaluated: {value}"
        );
    }
}

#[test]
fn config_mistyped_values() {
    let config = validator::<Config>();

    let port = json!({"store": {"port": "not-a-port"}});
    let error = config
        .validate(&port)
        .expect_err("the string port should fail validation");
    assert_eq!(error.instance_path().to_string(), "/store/port");
    assert_matches!(error.kind(), ValidationErrorKind::Type { .. });

    accepts(
        &config,
        &json!({"backend": {"kind": "memory", "capacity": 128}}),
    );
    let capacity = json!({"backend": {"kind": "memory", "capacity": "many"}});
    let error = config
        .validate(&capacity)
        .expect_err("the string capacity should fail validation");
    assert_matches!(
        error.kind(),
        ValidationErrorKind::AnyOf { .. },
        "no variant should accept the mistyped capacity"
    );

    let telemetry = validator::<Telemetry>();
    let format = json!({"log-format": "prety"});
    let error = telemetry
        .validate(&format)
        .expect_err("the misspelled log format should fail validation");
    assert_eq!(error.instance_path().to_string(), "/log-format");
    assert_matches!(
        error.kind(),
        ValidationErrorKind::Enum { .. },
        "the rejection should name the allowed values"
    );
}

#[test]
fn branch_selectors_negated() {
    let validator = validator::<BranchSelectors>();
    // A stripped `not` would be unsatisfiable, rejecting every file.
    accepts(&validator, &json!({}));

    let legacy = json!({"legacy": true});
    let error = validator
        .validate(&legacy)
        .expect_err("the negated branch should reject the forbidden key");
    assert_matches!(
        error.kind(),
        ValidationErrorKind::Not { .. },
        "the rejection should come from `not`, not from an unknown key"
    );
}

#[test]
fn branch_selectors_conditional() {
    let validator = validator::<BranchSelectors>();
    // A stripped `if` would always match, forcing `then` on every file.
    accepts(&validator, &json!({"port": 80}));
    accepts(&validator, &json!({"tls": true, "port": 443}));
    assert!(
        !validator.is_valid(&json!({"tls": true, "port": 80})),
        "the conditional branch should require the matching port"
    );
}

#[test]
fn load_merged_fields() {
    let partial = json!({"store":{"port":5432},"log-level":"info","backend":{"kind":"memory","capacity":128}});
    accepts(&validator::<Config>(), &partial);

    let report = Loader::new()
        .with_defaults(partial.clone())
        .load::<Config>()
        .expect_err("the missing host should fail the load");
    assert_matches!(report.current_context(), LoadError::Invalid);

    let config = Loader::new()
        .with_defaults(json!({"store":{"host":"localhost"}}))
        .with_defaults(partial)
        .load::<Config>()
        .expect("the merged configuration should load");
    assert_eq!(config.store.host, "localhost");
    assert_eq!(config.store.port, 5432);
}
