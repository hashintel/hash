use core::{
    fmt::{self, Write as _},
    ops::ControlFlow,
};

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
    /// Reduces a vector to one bit per dimension, set when the component is positive.
    ///
    /// Transpiles to `binary_quantize(<expr>)` in PostgreSQL. The result is comparable with
    /// [`BinaryOperator::HammingDistance`] against a `bit` column of the same width.
    ///
    /// [`BinaryOperator::HammingDistance`]: super::BinaryOperator::HammingDistance
    BinaryQuantize(Box<Expression>),
    Unnest(Vec<Expression>),
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
            | Self::JsonScalar(expr)
            | Self::ToJson(expr)
            | Self::Lower(expr)
            | Self::Upper(expr)
            | Self::LowerInc(expr)
            | Self::UpperInc(expr)
            | Self::LowerInf(expr)
            | Self::UpperInf(expr)
            | Self::ExtractEpochMs(expr)
            | Self::BinaryQuantize(expr) => visitor(expr),
            Self::JsonContains(lhs, rhs)
            | Self::JsonPathQueryFirst(lhs, rhs)
            | Self::Coalesce(lhs, rhs) => {
                visitor(lhs)?;
                visitor(rhs)
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
            Self::JsonBuildObject(pairs) => {
                for (key, value) in pairs {
                    visitor(key)?;
                    visitor(value)?;
                }
                ControlFlow::Continue(())
            }
            Self::Now => ControlFlow::Continue(()),
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
            | Self::JsonScalar(expr)
            | Self::ToJson(expr)
            | Self::Lower(expr)
            | Self::Upper(expr)
            | Self::LowerInc(expr)
            | Self::UpperInc(expr)
            | Self::LowerInf(expr)
            | Self::UpperInf(expr)
            | Self::ExtractEpochMs(expr)
            | Self::BinaryQuantize(expr) => visitor(expr),
            Self::JsonContains(lhs, rhs)
            | Self::JsonPathQueryFirst(lhs, rhs)
            | Self::Coalesce(lhs, rhs) => {
                visitor(lhs)?;
                visitor(rhs)
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
            Self::JsonBuildObject(pairs) => {
                for (key, value) in pairs {
                    visitor(key)?;
                    visitor(value)?;
                }
                ControlFlow::Continue(())
            }
            Self::Now => ControlFlow::Continue(()),
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
