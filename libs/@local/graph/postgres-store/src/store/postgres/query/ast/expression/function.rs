use core::fmt::{self, Write as _};

use hash_graph_store::filter::PathToken;

use crate::store::postgres::query::{Expression, OrderByExpression, PostgresType, Transpile};

#[derive(Debug, Clone, PartialEq)]
pub enum Function {
    Min(Box<Expression>),
    Max(Box<Expression>),
    JsonAgg(Box<Expression>),
    JsonExtractText(Box<Expression>),
    JsonExtractAsText(Box<Expression>, PathToken<'static>),
    /// Extracts a JSON field or array element, keeping the `jsonb` type.
    ///
    /// Transpiles to `<expr>->'field'` or `<expr>->index`. The text-returning counterpart is
    /// [`JsonExtractAsText`](Self::JsonExtractAsText).
    JsonExtract(Box<Expression>, PathToken<'static>),
    JsonExtractPath(Vec<Expression>),
    JsonContains(Box<Expression>, Box<Expression>),
    /// The type of a `jsonb` value, as text.
    ///
    /// Transpiles to `jsonb_typeof(<expr>)`, one of `object`, `array`, `string`, `number`,
    /// `boolean`, and `null`.
    JsonTypeof(Box<Expression>),
    JsonScalar(Box<Expression>),
    JsonBuildArray(Vec<Expression>),
    JsonBuildObject(Vec<(Expression, Expression)>),
    JsonPathQueryFirst(Box<Expression>, Box<Expression>),
    /// Every match of a JSON path inside a `jsonb` value, as a `jsonb` array.
    ///
    /// Transpiles to `jsonb_path_query_array(<target>, <path>)`.
    JsonPathQueryArray(Box<Expression>, Box<Expression>),
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
    /// The `row_number` window function: the 1-based position of the row within its window.
    ///
    /// Transpiles to `row_number()`. Wrap the resulting expression in [`Expression::Window`] to
    /// supply the `OVER (...)` clause the function requires.
    ///
    /// [`Expression::Window`]: crate::store::postgres::query::Expression::Window
    RowNumber,
    /// Aggregates the expression's values into an array.
    ///
    /// Transpiles to `array_agg(<expr>)`, or `array_agg(<expr> ORDER BY ...)` when the ordering
    /// is non-empty. The ordering fixes the array's element order, which is otherwise
    /// unspecified.
    ArrayAgg {
        expression: Box<Expression>,
        order_by: OrderByExpression,
    },
    /// Aggregates key-value pairs into one `jsonb` object.
    ///
    /// Transpiles to `jsonb_object_agg(<key>, <value>)`. Aggregating zero rows reads SQL
    /// `NULL`, so restricting the aggregated set is the surrounding statement's WHERE clause's
    /// job.
    JsonObjectAgg {
        key: Box<Expression>,
        value: Box<Expression>,
    },
    /// Expands a `jsonb` array into one row per element.
    ///
    /// Transpiles to `jsonb_array_elements(<expr>)`, a set-returning function that belongs in a
    /// FROM item.
    JsonArrayElements(Box<Expression>),
    /// Expands a `jsonb` array into one row per element, each element as text.
    ///
    /// Transpiles to `jsonb_array_elements_text(<expr>)`, a set-returning function that belongs
    /// in a FROM item.
    JsonArrayElementsText(Box<Expression>),
    /// Counts rows or non-NULL values.
    ///
    /// Transpiles to `count(*)` when the argument is `None` and `count(<expr>)` otherwise.
    Count(Option<Box<Expression>>),
    /// The natural logarithm.
    ///
    /// Transpiles to `ln(<expr>)`.
    Ln(Box<Expression>),
    /// The MD5 hash of a text value, as a hex string.
    ///
    /// Transpiles to `md5(<expr>)`.
    Md5(Box<Expression>),
    /// Trims whitespace from both ends of a text value.
    ///
    /// Transpiles to `btrim(<expr>)`.
    Btrim(Box<Expression>),
    /// The character count of a text value.
    ///
    /// Transpiles to `char_length(<expr>)`.
    CharLength(Box<Expression>),
    /// Concatenates values with a separator, skipping NULLs.
    ///
    /// Transpiles to `concat_ws(<separator>, <expr>, ...)`.
    ConcatWs {
        separator: Box<Expression>,
        expressions: Vec<Expression>,
    },
    /// The substring starting at a 1-based character position.
    ///
    /// Transpiles to `substring(<string> FROM <start>)`.
    Substring {
        string: Box<Expression>,
        start: Box<Expression>,
    },
    /// Replaces every match of a POSIX regular expression.
    ///
    /// Transpiles to `regexp_replace(<string>, <pattern>, <replacement>)`.
    RegexpReplace {
        string: Box<Expression>,
        pattern: Box<Expression>,
        replacement: Box<Expression>,
    },
    /// Expands a `jsonb` object into one row per key-value pair.
    ///
    /// Transpiles to `jsonb_each(<expr>)`, a set-returning function that belongs in a FROM item.
    JsonEach(Box<Expression>),
    /// `pgvector`: rescales a vector to unit l2 norm.
    ///
    /// Transpiles to `l2_normalize(<expr>)`.
    L2Normalize(Box<Expression>),
    /// `pgvector`: extracts `count` components of `vector`, starting at the 1-based `start`.
    ///
    /// Transpiles to `subvector(<expr>, <start>, <count>)`.
    Subvector {
        vector: Box<Expression>,
        start: usize,
        count: usize,
    },
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
            Self::JsonExtract(expression, key) => {
                expression.transpile(fmt)?;
                match key {
                    PathToken::Field(field) => write!(fmt, "->'{field}'"),
                    PathToken::Index(index) => write!(fmt, "->{index}"),
                }
            }
            Self::JsonContains(json, value) => {
                fmt.write_str("jsonb_contains(")?;
                json.transpile(fmt)?;
                fmt.write_str(", ")?;
                value.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::JsonTypeof(expression) => {
                fmt.write_str("jsonb_typeof(")?;
                expression.transpile(fmt)?;
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
            Self::RowNumber => fmt.write_str("row_number()"),
            Self::ArrayAgg {
                expression,
                order_by,
            } => {
                fmt.write_str("array_agg(")?;
                expression.transpile(fmt)?;
                if !order_by.is_empty() {
                    fmt.write_char(' ')?;
                    order_by.transpile(fmt)?;
                }
                fmt.write_char(')')
            }
            Self::JsonArrayElements(expression) => {
                fmt.write_str("jsonb_array_elements(")?;
                expression.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::JsonArrayElementsText(expression) => {
                fmt.write_str("jsonb_array_elements_text(")?;
                expression.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::Count(None) => fmt.write_str("count(*)"),
            Self::Count(Some(expression)) => {
                fmt.write_str("count(")?;
                expression.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::Ln(expression) => {
                fmt.write_str("ln(")?;
                expression.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::Md5(expression) => {
                fmt.write_str("md5(")?;
                expression.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::Btrim(expression) => {
                fmt.write_str("btrim(")?;
                expression.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::CharLength(expression) => {
                fmt.write_str("char_length(")?;
                expression.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::ConcatWs {
                separator,
                expressions,
            } => {
                fmt.write_str("concat_ws(")?;
                separator.transpile(fmt)?;
                for expression in expressions {
                    fmt.write_str(", ")?;
                    expression.transpile(fmt)?;
                }
                fmt.write_char(')')
            }
            Self::Substring { string, start } => {
                fmt.write_str("substring(")?;
                string.transpile(fmt)?;
                fmt.write_str(" FROM ")?;
                start.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::RegexpReplace {
                string,
                pattern,
                replacement,
            } => {
                fmt.write_str("regexp_replace(")?;
                string.transpile(fmt)?;
                fmt.write_str(", ")?;
                pattern.transpile(fmt)?;
                fmt.write_str(", ")?;
                replacement.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::JsonEach(expression) => {
                fmt.write_str("jsonb_each(")?;
                expression.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::L2Normalize(expression) => {
                fmt.write_str("l2_normalize(")?;
                expression.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::Subvector {
                vector,
                start,
                count,
            } => {
                fmt.write_str("subvector(")?;
                vector.transpile(fmt)?;
                write!(fmt, ", {start}, {count})")
            }
            Self::JsonPathQueryFirst(target, path) => {
                fmt.write_str("jsonb_path_query_first(")?;
                target.transpile(fmt)?;
                fmt.write_str(", ")?;
                path.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::JsonPathQueryArray(target, path) => {
                fmt.write_str("jsonb_path_query_array(")?;
                target.transpile(fmt)?;
                fmt.write_str(", ")?;
                path.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::JsonObjectAgg { key, value } => {
                fmt.write_str("jsonb_object_agg(")?;
                key.transpile(fmt)?;
                fmt.write_str(", ")?;
                value.transpile(fmt)?;
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
