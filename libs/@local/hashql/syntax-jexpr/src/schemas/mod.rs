//! JSON Schemas for J-Expr documents.
//!
//! [`Expr`] describes the documents that [`Parser::parse_expr_in`] reads, such as a HashQL query,
//! and [`Value`] the documents that [`Parser::parse_value_in`] reads. Use with `#[schemars(with =
//! "...")]` to document the schema of a field that holds the JSON text of a document to be parsed
//! by the parser.
//!
//! # Limitations
//!
//! The schemas describe the JSON structure of J-Expr. A document that matches its schema can still
//! fail to parse.
//!
//! - **Strings.** The parser checks the HashQL syntax inside paths, type annotations, field names,
//!   and argument labels.
//! - **Repeated keys.** The parser rejects repeated constructor keys. Schema validation sees the
//!   parsed object, not the repeated keys in the source.
//! - **Nesting.** The schema allows for arbitrarily nested JSON, but the parser enforces a nesting
//!   depth limit.
//!
//! Note that the schema only tries to model J-Expr documents, not HashQL as a language, a valid
//! J-Expr document is not necessarily a valid HashQL program.
//!
//! # Example
//!
//! ```
//! use serde_json::value::RawValue;
//!
//! #[derive(schemars::JsonSchema)]
//! struct Request {
//!     #[schemars(with = "hashql_syntax_jexpr::schemas::Expr")]
//!     query: Box<RawValue>,
//!     #[schemars(with = "Vec<hashql_syntax_jexpr::schemas::Value>")]
//!     inputs: Vec<Box<RawValue>>,
//! }
//!
//! let schema = schemars::schema_for!(Request);
//! let definitions = &schema.as_value()["$defs"];
//! assert!(definitions["JExpr"].is_object() && definitions["JExprValue"].is_object());
//! ```
//!
//! [`Parser::parse_expr_in`]: crate::Parser::parse_expr_in
//! [`Parser::parse_value_in`]: crate::Parser::parse_value_in
//! [`ParserOptions::nesting_limit`]: crate::ParserOptions::nesting_limit

use alloc::borrow::Cow;

use schemars::{JsonSchema, Schema, SchemaGenerator, json_schema};
use serde_json::Map;

/// Returns the schema of an object whose only required key is `key`, holding `body`.
fn constructor(
    title: &str,
    description: &str,
    key: &str,
    body: Schema,
    annotation: Option<&Schema>,
) -> Schema {
    let mut properties = Map::new();
    properties.insert(key.to_owned(), body.into());
    if let Some(annotation) = annotation {
        properties.insert("#type".to_owned(), annotation.clone().into());
    }

    json_schema!({
        "title": title,
        "description": description,
        "type": "object",
        "properties": properties,
        "required": [key],
        "additionalProperties": false,
    })
}

/// Returns the schemas of the `#literal`, `#struct`, `#tuple`, `#list` and `#dict` objects, in
/// that order, whose items are `item`.
///
/// Each object admits the `#type` key with the schema `annotation` if there is one.
fn constructors(item: &Schema, annotation: Option<&Schema>) -> [Schema; 5] {
    let sequence = json_schema!({
        "type": "array",
        "items": item,
    });

    [
        constructor(
            "Literal",
            "A primitive value. A number with a fraction or an exponent is a float and any other \
             number an integer, which JSON parsing does not preserve.",
            "#literal",
            json_schema!({ "type": ["null", "boolean", "number", "string"] }),
            annotation,
        ),
        constructor(
            "Struct",
            "Fields by name. A name is an identifier. Caveat: the schema is broader than the \
             value J-Expr allows.",
            "#struct",
            json_schema!({
                "type": "object",
                "additionalProperties": item,
            }),
            annotation,
        ),
        constructor(
            "Tuple",
            "A fixed number of elements in order.",
            "#tuple",
            sequence.clone(),
            annotation,
        ),
        constructor(
            "List",
            "Any number of elements in order.",
            "#list",
            sequence,
            annotation,
        ),
        constructor(
            "Dict",
            "Entries mapping keys to values, as an object keyed by string or as an array of \
             `[key, value]` pairs.",
            "#dict",
            json_schema!({
                "oneOf": [
                    {
                        "type": "object",
                        "additionalProperties": item,
                    },
                    {
                        "type": "array",
                        "items": {
                            "type": "array",
                            "items": item,
                            "minItems": 2,
                            "maxItems": 2,
                        },
                    },
                ],
            }),
            annotation,
        ),
    ]
}

/// JSON Schema of a J-Expr expression, the document [`Parser::parse_expr_in`] reads.
///
/// A string is a path, an array is a call whose first element is the callee, and an object
/// constructs a value. A call argument can also be an object with a single key `:label`, which
/// labels the argument.
///
/// The schema is named `JExpr`.
///
/// [`Parser::parse_expr_in`]: crate::Parser::parse_expr_in
pub struct Expr(!);

impl JsonSchema for Expr {
    fn schema_name() -> Cow<'static, str> {
        Cow::Borrowed("JExpr")
    }

    fn schema_id() -> Cow<'static, str> {
        Cow::Borrowed(concat!(module_path!(), "::Expr"))
    }

    fn json_schema(generator: &mut SchemaGenerator) -> Schema {
        let expr = generator.subschema_for::<Self>();
        let annotation = json_schema!({
            "description": "The type of the constructed value in HashQL type syntax, such as `List<Integer>`. Caveat: the schema is broader than the value J-Expr allows.",
            "type": "string",
        });
        let [literal, r#struct, tuple, list, dict] = constructors(&expr, Some(&annotation));

        // Excluding a labeled argument from the callee's position takes `prefixItems`, which a
        // draft 7 generator rewrites into the array form of `items`. JSON Schema 2020-12 has no
        // array form, and aide places draft 7 schemas in an OpenAPI 3.1 document, which reads
        // them as 2020-12.
        json_schema!({
            "title": "J-Expr expression",
            "description": "A HashQL expression in J-Expr syntax. A string is a path, an array is a call and an object constructs a value. An expression that matches this schema can still fail to parse.",
            "oneOf": [
                {
                    "title": "Path",
                    "description": "A path in HashQL syntax, such as `x`, `entity.metadata` or `::core::math::add`.",
                    "type": "string",
                },
                {
                    "title": "Call",
                    "description": "The callee, followed by the arguments. A string argument `\":label\"` passes the variable `label` as the argument labeled `label`.",
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "oneOf": [
                            expr,
                            {
                                "title": "Labeled argument",
                                "description": "An argument under a single key, `:` followed by the label. Caveat: the schema is broader than the value J-Expr allows.",
                                "type": "object",
                                "propertyNames": { "pattern": "^:" },
                                "additionalProperties": expr,
                                "minProperties": 1,
                                "maxProperties": 1,
                            },
                        ],
                    },
                },
                literal,
                r#struct,
                tuple,
                list,
                dict,
            ],
            "examples": [
                ["==", {"#literal": 2}, {"#literal": 3}],
            ],
        })
    }
}

/// JSON Schema of a J-Expr value, the document [`Parser::parse_value_in`] reads.
///
/// A constructor object whose items are constructor objects at every depth, none of them with a
/// `#type` annotation. Without paths and calls, every value is also an expression.
///
/// The schema is named `JExprValue`.
///
/// [`Parser::parse_value_in`]: crate::Parser::parse_value_in
pub struct Value(!);

impl JsonSchema for Value {
    fn schema_name() -> Cow<'static, str> {
        Cow::Borrowed("JExprValue")
    }

    fn schema_id() -> Cow<'static, str> {
        Cow::Borrowed(concat!(module_path!(), "::Value"))
    }

    fn json_schema(generator: &mut SchemaGenerator) -> Schema {
        let value = generator.subschema_for::<Self>();
        let [literal, r#struct, tuple, list, dict] = constructors(&value, None);

        json_schema!({
            "title": "J-Expr value",
            "description": "A HashQL value in J-Expr syntax: a constructor object, whose items \
                            are values. A value has no paths, calls or `#type` annotations.",
            "oneOf": [literal, r#struct, tuple, list, dict],
            "examples": [
                {
                    "#struct": {
                        "name": { "#literal": "Alice" },
                        "tags": { "#list": [{ "#literal": "admin" }] },
                    },
                },
            ],
        })
    }
}
