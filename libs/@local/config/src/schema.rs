use schemars::{JsonSchema, Schema, generate::SchemaSettings, transform::transform_subschemas};
use serde_json::{Map, Value};

/// Generates a JSON Schema for a partial configuration of `C`.
///
/// Object fields may be omitted at every level, including enum tags. Supplied values keep their
/// type constraints, and configuration objects reject unknown keys. A field whose schema
/// constrains nothing, such as an arbitrary JSON value, accepts any content. Map keys and values
/// keep their declared types. A deserialization alias is not part of the schema, so a file naming
/// a field by its alias is rejected.
///
/// Arrays replace one another across configuration sources rather than merging, so a tuple keeps
/// its length.
///
/// A flattened map of unconstrained values leaves the surrounding object open, and a flattened
/// untagged enum has a variant that matches whatever its siblings do not. Together they accept a
/// value of the wrong type, which [`Loader::load`](crate::Loader::load) still rejects.
///
/// The schema describes deserialization using JSON Schema draft 2020-12.
/// [`Loader::load`](crate::Loader::load) checks required fields after the configuration sources
/// have merged.
///
/// # Examples
///
/// ```
/// #[derive(schemars::JsonSchema)]
/// struct Config {
///     host: String,
///     port: u16,
/// }
///
/// let schema = hash_config::partial_json_schema::<Config>();
/// assert!(schema.get("required").is_none());
/// assert_eq!(schema.get("properties").unwrap()["port"]["type"], "integer");
/// ```
#[must_use]
pub fn partial_json_schema<C: JsonSchema>() -> Schema {
    SchemaSettings::draft2020_12()
        .for_deserialize()
        .with(|settings| {
            // An `unevaluatedProperties` inside a definition cannot see what the referring
            // schema evaluates, so a referenced variant would reject the fields flattened
            // beside it.
            settings.inline_subschemas = true;
        })
        .with_transform(make_fields_optional)
        .with_transform(|schema: &mut Schema| close_objects(schema, Position::Value))
        .into_generator()
        .into_root_schema_for::<C>()
}

fn make_fields_optional(schema: &mut Schema) {
    schema.remove("required");
    schema.remove("dependentRequired");
    relax_exclusive_branches(schema);

    // `required` selects a branch here rather than constraining a value, so removing it would
    // leave `not` unsatisfiable and `if` always true.
    let selectors = ["not", "if"].map(|keyword| (keyword, schema.remove(keyword)));

    transform_subschemas(&mut make_fields_optional, schema);
    transform_unvisited_subschemas(schema);

    for (keyword, selector) in selectors {
        if let Some(selector) = selector {
            schema.insert(keyword.to_owned(), selector);
        }
    }
}

/// Offers `oneOf` branches as `anyOf` alternatives.
///
/// A partial value carries too few fields to select one branch, which `oneOf` rejects. Flattening
/// two enums leaves both keywords on one object, where the two sets of alternatives constrain the
/// value independently; the branches then move into `allOf` rather than joining the existing list.
fn relax_exclusive_branches(schema: &mut Schema) {
    let Some(branches) = schema.remove("oneOf") else {
        return;
    };

    if schema.get("anyOf").is_none() {
        schema.insert("anyOf".to_owned(), branches);
        return;
    }

    let mut alternatives = Map::new();
    alternatives.insert("anyOf".to_owned(), branches);

    if let Some(composed) = schema
        .ensure_object()
        .entry("allOf")
        .or_insert_with(|| Value::Array(Vec::new()))
        .as_array_mut()
    {
        composed.push(Value::Object(alternatives));
    }
}

/// Recurses into the subschema keywords [`transform_subschemas`] does not visit.
fn transform_unvisited_subschemas(schema: &mut Schema) {
    for (keyword, value) in schema.as_object_mut().into_iter().flatten() {
        match keyword.as_str() {
            "unevaluatedProperties" | "unevaluatedItems" => {
                if let Ok(subschema) = value.try_into() {
                    make_fields_optional(subschema);
                }
            }
            "dependentSchemas" => {
                if let Some(children) = value.as_object_mut() {
                    for child in children.values_mut() {
                        if let Ok(subschema) = child.try_into() {
                            make_fields_optional(subschema);
                        }
                    }
                }
            }
            _ => {}
        }
    }
}

/// Whether a schema constrains nothing, so every value satisfies it.
fn accepts_any_value(value: &Value) -> bool {
    value == &Value::Bool(true) || value.as_object().is_some_and(Map::is_empty)
}

fn describes_object(schema: &Schema) -> bool {
    // One unconstrained alternative accepts every key, which closing the object would deny.
    if ["anyOf", "oneOf"]
        .into_iter()
        .filter_map(|keyword| schema.get(keyword).and_then(Value::as_array))
        .flatten()
        .any(accepts_any_value)
    {
        return false;
    }

    schema.get("type").is_some_and(|kind| {
        kind == "object"
            || kind
                .as_array()
                .is_some_and(|kinds| kinds.iter().any(|kind| kind == "object"))
    }) || ["properties", "patternProperties", "additionalProperties"]
        .into_iter()
        .any(|keyword| schema.get(keyword).is_some())
        || ["allOf", "anyOf", "oneOf"]
            .into_iter()
            .filter_map(|keyword| schema.get(keyword).and_then(Value::as_array))
            .flatten()
            .filter_map(|value| <&Schema>::try_from(value).ok())
            .any(describes_object)
}

/// Where a schema sits in the document it constrains.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Position {
    /// Constrains a value of its own: a property, a collection entry, or the document root.
    Value,
    /// Composes into the surrounding schema and is evaluated together with it.
    Composed,
}

fn close_objects(schema: &mut Schema, position: Position) {
    // An `unevaluatedProperties` already present governs the keys this would otherwise reject:
    // schemars writes `true` for a flattened open map and a schema for a flattened typed one.
    if position == Position::Value && describes_object(schema) {
        schema
            .ensure_object()
            .entry("unevaluatedProperties")
            .or_insert(Value::Bool(false));
    }

    // Composed schemas describe the same object. Close it once so flattened fields can be
    // evaluated together; nested properties and collection entries each describe a new value.
    for (keyword, value) in schema.as_object_mut().into_iter().flatten() {
        match keyword.as_str() {
            // A definition is closed like a value because inlining leaves a `$ref` only where a
            // recursion re-enters, and that is a property or a collection entry.
            "properties" | "patternProperties" | "$defs" | "definitions" => {
                if let Some(children) = value.as_object_mut() {
                    for child in children.values_mut() {
                        close_value(child, Position::Value);
                    }
                }
            }
            "dependentSchemas" => {
                if let Some(children) = value.as_object_mut() {
                    for child in children.values_mut() {
                        close_value(child, Position::Composed);
                    }
                }
            }
            "allOf" | "anyOf" | "oneOf" => close_values(value, Position::Composed),
            "prefixItems" => close_values(value, Position::Value),
            "items"
            | "additionalProperties"
            | "unevaluatedProperties"
            | "unevaluatedItems"
            | "contains" => {
                close_value(value, Position::Value);
            }
            "not" | "if" | "then" | "else" => close_value(value, Position::Composed),
            _ => {}
        }
    }
}

fn close_value(value: &mut Value, position: Position) {
    if let Ok(schema) = value.try_into() {
        close_objects(schema, position);
    }
}

fn close_values(value: &mut Value, position: Position) {
    if let Some(children) = value.as_array_mut() {
        for child in children {
            close_value(child, position);
        }
    }
}
