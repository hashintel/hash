use core::{
    fmt::{self, Write as _},
    ops::ControlFlow,
};

use hash_graph_store::filter::PathToken;

use crate::store::postgres::query::{Expression, OrderByClause, PostgresType, Transpile};

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
    /// Reduces a vector to one bit per dimension, set when the component is positive.
    ///
    /// Transpiles to `binary_quantize(<expr>)` in PostgreSQL. The result is comparable with
    /// [`BinaryOperator::HammingDistance`] against a `bit` column of the same width.
    ///
    /// [`BinaryOperator::HammingDistance`]: super::BinaryOperator::HammingDistance
    BinaryQuantize(Box<Expression>),
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
    /// Transpiles to `array_agg(<expr>)`, or `array_agg(<expr> ORDER BY ...)` when an ordering
    /// is present. The ordering fixes the array's element order, which is otherwise
    /// unspecified.
    ArrayAgg {
        expression: Box<Expression>,
        order_by: Option<OrderByClause>,
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

/// Direct-child traversal for [`Expression::visit`] and [`Expression::visit_mut`].
///
/// [`Expression::visit`]: super::Expression::visit
/// [`Expression::visit_mut`]: super::Expression::visit_mut
impl Function {
    pub(super) fn for_each_child<B>(
        &self,
        visitor: &mut impl FnMut(&Expression) -> ControlFlow<B>,
    ) -> ControlFlow<B> {
        match self {
            Self::Min(expr)
            | Self::Max(expr)
            | Self::JsonAgg(expr)
            | Self::JsonExtractText(expr)
            | Self::JsonExtractAsText(expr, _)
            | Self::JsonExtract(expr, _)
            | Self::JsonTypeof(expr)
            | Self::JsonScalar(expr)
            | Self::JsonArrayElements(expr)
            | Self::JsonArrayElementsText(expr)
            | Self::JsonEach(expr)
            | Self::ToJson(expr)
            | Self::Lower(expr)
            | Self::Upper(expr)
            | Self::LowerInc(expr)
            | Self::UpperInc(expr)
            | Self::LowerInf(expr)
            | Self::UpperInf(expr)
            | Self::ExtractEpochMs(expr)
            | Self::BinaryQuantize(expr)
            | Self::L2Normalize(expr)
            | Self::Ln(expr)
            | Self::Md5(expr)
            | Self::Btrim(expr)
            | Self::CharLength(expr)
            | Self::Subvector { vector: expr, .. } => visitor(expr),
            Self::JsonContains(lhs, rhs)
            | Self::JsonPathQueryFirst(lhs, rhs)
            | Self::JsonPathQueryArray(lhs, rhs)
            | Self::Coalesce(lhs, rhs)
            | Self::JsonObjectAgg {
                key: lhs,
                value: rhs,
            }
            | Self::Substring {
                string: lhs,
                start: rhs,
            } => {
                visitor(lhs)?;
                visitor(rhs)
            }
            Self::RegexpReplace {
                string,
                pattern,
                replacement,
            } => {
                visitor(string)?;
                visitor(pattern)?;
                visitor(replacement)
            }
            Self::JsonExtractPath(exprs)
            | Self::JsonBuildArray(exprs)
            | Self::Unnest(exprs)
            | Self::ArrayLiteral {
                elements: exprs, ..
            } => {
                for expr in exprs {
                    visitor(expr)?;
                }
                ControlFlow::Continue(())
            }
            Self::ConcatWs {
                separator,
                expressions,
            } => {
                visitor(separator)?;
                for expr in expressions {
                    visitor(expr)?;
                }
                ControlFlow::Continue(())
            }
            Self::JsonBuildObject(pairs) => {
                for (key, value) in pairs {
                    visitor(key)?;
                    visitor(value)?;
                }
                ControlFlow::Continue(())
            }
            Self::ArrayAgg {
                expression,
                order_by,
            } => {
                visitor(expression)?;
                if let Some(order_by) = order_by {
                    for sort_by in &*order_by.sort_by {
                        visitor(&sort_by.expression)?;
                    }
                }
                ControlFlow::Continue(())
            }
            Self::Count(expr) => {
                if let Some(expr) = expr {
                    visitor(expr)?;
                }
                ControlFlow::Continue(())
            }
            Self::Now | Self::RowNumber => ControlFlow::Continue(()),
        }
    }

    pub(super) fn for_each_child_mut<B>(
        &mut self,
        visitor: &mut impl FnMut(&mut Expression) -> ControlFlow<B>,
    ) -> ControlFlow<B> {
        match self {
            Self::Min(expr)
            | Self::Max(expr)
            | Self::JsonAgg(expr)
            | Self::JsonExtractText(expr)
            | Self::JsonExtractAsText(expr, _)
            | Self::JsonExtract(expr, _)
            | Self::JsonTypeof(expr)
            | Self::JsonScalar(expr)
            | Self::JsonArrayElements(expr)
            | Self::JsonArrayElementsText(expr)
            | Self::JsonEach(expr)
            | Self::ToJson(expr)
            | Self::Lower(expr)
            | Self::Upper(expr)
            | Self::LowerInc(expr)
            | Self::UpperInc(expr)
            | Self::LowerInf(expr)
            | Self::UpperInf(expr)
            | Self::ExtractEpochMs(expr)
            | Self::BinaryQuantize(expr)
            | Self::L2Normalize(expr)
            | Self::Ln(expr)
            | Self::Md5(expr)
            | Self::Btrim(expr)
            | Self::CharLength(expr)
            | Self::Subvector { vector: expr, .. } => visitor(expr),
            Self::JsonContains(lhs, rhs)
            | Self::JsonPathQueryFirst(lhs, rhs)
            | Self::JsonPathQueryArray(lhs, rhs)
            | Self::Coalesce(lhs, rhs)
            | Self::JsonObjectAgg {
                key: lhs,
                value: rhs,
            }
            | Self::Substring {
                string: lhs,
                start: rhs,
            } => {
                visitor(lhs)?;
                visitor(rhs)
            }
            Self::RegexpReplace {
                string,
                pattern,
                replacement,
            } => {
                visitor(string)?;
                visitor(pattern)?;
                visitor(replacement)
            }
            Self::JsonExtractPath(exprs)
            | Self::JsonBuildArray(exprs)
            | Self::Unnest(exprs)
            | Self::ArrayLiteral {
                elements: exprs, ..
            } => {
                for expr in exprs {
                    visitor(expr)?;
                }
                ControlFlow::Continue(())
            }
            Self::ConcatWs {
                separator,
                expressions,
            } => {
                visitor(separator)?;
                for expr in expressions {
                    visitor(expr)?;
                }
                ControlFlow::Continue(())
            }
            Self::JsonBuildObject(pairs) => {
                for (key, value) in pairs {
                    visitor(key)?;
                    visitor(value)?;
                }
                ControlFlow::Continue(())
            }
            Self::ArrayAgg {
                expression,
                order_by,
            } => {
                visitor(expression)?;
                if let Some(order_by) = order_by {
                    for sort_by in &mut *order_by.sort_by {
                        visitor(&mut sort_by.expression)?;
                    }
                }
                ControlFlow::Continue(())
            }
            Self::Count(expr) => {
                if let Some(expr) = expr {
                    visitor(expr)?;
                }
                ControlFlow::Continue(())
            }
            Self::Now | Self::RowNumber => ControlFlow::Continue(()),
        }
    }
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
            Self::BinaryQuantize(expression) => {
                fmt.write_str("binary_quantize(")?;
                expression.transpile(fmt)?;
                fmt.write_char(')')
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
                if let Some(order_by) = order_by {
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
