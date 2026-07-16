use core::fmt::{self, Write as _};

use hash_graph_store::filter::PathToken;

use crate::store::postgres::query::{Expression, PostgresType, Transpile};

#[derive(Debug, Clone, PartialEq)]
pub enum Function {
    Min(Box<Expression>),
    Max(Box<Expression>),
    JsonAgg(Box<Expression>),
    JsonExtractText(Box<Expression>),
    JsonExtractAsText(Box<Expression>, PathToken<'static>),
    JsonExtractPath(Vec<Expression>),
    JsonContains(Box<Expression>, Box<Expression>),
    JsonScalar(Box<Expression>),
    JsonBuildArray(Vec<Expression>),
    JsonBuildObject(Vec<(Expression, Expression)>),
    JsonPathQueryFirst(Box<Expression>, Box<Expression>),
    /// Creates an array literal with explicit type cast.
    ///
    /// Transpiles to `ARRAY[{elements}]::{type}[]` in PostgreSQL.
    ArrayLiteral {
        elements: Vec<Expression>,
        element_type: PostgresType,
    },
    /// Converts any SQL value to jsonb.
    ///
    /// Transpiles to `to_jsonb(<expr>)` in PostgreSQL. Passes through jsonb
    /// values unchanged; wraps text, uuid, integer, boolean, etc. as jsonb
    /// scalars.
    ToJson(Box<Expression>),
    /// Returns the first non-NULL argument.
    ///
    /// Transpiles to `COALESCE(expr, fallback)`.
    Coalesce(Box<Expression>, Box<Expression>),
    Lower(Box<Expression>),
    Upper(Box<Expression>),
    LowerInc(Box<Expression>),
    UpperInc(Box<Expression>),
    LowerInf(Box<Expression>),
    UpperInf(Box<Expression>),
    /// Extracts the epoch as milliseconds since Unix epoch from a timestamp expression.
    ///
    /// Transpiles to `(extract(epoch from <expr>) * 1000)::int8` in PostgreSQL.
    ExtractEpochMs(Box<Expression>),
    Unnest(Vec<Expression>),
    Now,
}

impl Transpile for Function {
    #[expect(
        clippy::too_many_lines,
        reason = "Match-based transpile implementation"
    )]
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Min(expression) => {
                fmt.write_str("MIN(")?;
                expression.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::Max(expression) => {
                fmt.write_str("MAX(")?;
                expression.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::JsonAgg(expression) => {
                fmt.write_str("jsonb_agg(")?;
                expression.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::JsonScalar(expression) => {
                fmt.write_str("json_scalar(")?;
                expression.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::JsonExtractPath(paths) => {
                fmt.write_str("jsonb_extract_path(")?;
                for (i, expression) in paths.iter().enumerate() {
                    if i > 0 {
                        fmt.write_str(", ")?;
                    }
                    expression.transpile(fmt)?;
                }
                fmt.write_char(')')
            }
            Self::JsonExtractText(expression) => {
                fmt.write_str("((")?;
                expression.transpile(fmt)?;
                fmt.write_str(") #>> '{}'::text[])")
            }
            Self::JsonExtractAsText(expression, key) => {
                expression.transpile(fmt)?;
                match key {
                    PathToken::Field(field) => write!(fmt, "->>'{field}'"),
                    PathToken::Index(index) => write!(fmt, "->>{index}"),
                }
            }
            Self::JsonContains(json, value) => {
                fmt.write_str("jsonb_contains(")?;
                json.transpile(fmt)?;
                fmt.write_str(", ")?;
                value.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::JsonBuildArray(expressions) => {
                fmt.write_str("jsonb_build_array(")?;
                for (i, expression) in expressions.iter().enumerate() {
                    if i > 0 {
                        fmt.write_str(", ")?;
                    }
                    expression.transpile(fmt)?;
                }
                fmt.write_char(')')
            }
            Self::JsonBuildObject(pairs) => {
                fmt.write_str("jsonb_build_object(")?;
                for (i, (key, value)) in pairs.iter().enumerate() {
                    if i > 0 {
                        fmt.write_str(", ")?;
                    }
                    key.transpile(fmt)?;
                    fmt.write_str(", ")?;
                    value.transpile(fmt)?;
                }
                fmt.write_char(')')
            }
            Self::Now => fmt.write_str("now()"),
            Self::ToJson(expression) => {
                fmt.write_str("to_jsonb(")?;
                expression.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::Coalesce(expression, fallback) => {
                fmt.write_str("COALESCE(")?;
                expression.transpile(fmt)?;
                fmt.write_str(", ")?;
                fallback.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::Lower(expression) => {
                fmt.write_str("lower(")?;
                expression.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::Upper(expression) => {
                fmt.write_str("upper(")?;
                expression.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::LowerInc(expression) => {
                fmt.write_str("lower_inc(")?;
                expression.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::UpperInc(expression) => {
                fmt.write_str("upper_inc(")?;
                expression.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::LowerInf(expression) => {
                fmt.write_str("lower_inf(")?;
                expression.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::UpperInf(expression) => {
                fmt.write_str("upper_inf(")?;
                expression.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::ExtractEpochMs(expression) => {
                fmt.write_str("(extract(epoch from ")?;
                expression.transpile(fmt)?;
                fmt.write_str(") * 1000)::int8")
            }
            Self::Unnest(expression) => {
                fmt.write_str("UNNEST(")?;

                for (index, element) in expression.iter().enumerate() {
                    if index > 0 {
                        fmt.write_str(", ")?;
                    }

                    element.transpile(fmt)?;
                }

                fmt.write_char(')')
            }
            Self::JsonPathQueryFirst(target, path) => {
                fmt.write_str("jsonb_path_query_first(")?;
                target.transpile(fmt)?;
                fmt.write_str(", ")?;
                path.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::ArrayLiteral {
                elements,
                element_type,
            } => {
                fmt.write_str("ARRAY[")?;
                for (i, element) in elements.iter().enumerate() {
                    if i > 0 {
                        fmt.write_str(", ")?;
                    }
                    element.transpile(fmt)?;
                }
                fmt.write_str("]::")?;
                element_type.transpile(fmt)?;
                fmt.write_str("[]")
            }
        }
    }
}
