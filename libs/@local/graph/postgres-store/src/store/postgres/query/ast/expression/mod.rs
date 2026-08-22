mod binary;
mod constant;
mod function;
mod unary;
mod variadic;
mod window;

use core::{
    fmt::{
        Display, Formatter, Write as _, {self},
    },
    ops::ControlFlow,
};

pub use self::{
    binary::{BinaryExpression, BinaryOperator},
    constant::Constant,
    function::Function,
    unary::{UnaryExpression, UnaryOperator},
    variadic::{VariadicExpression, VariadicOperator},
    window::WindowDefinition,
};
use super::{ColumnName, ColumnReference};
use crate::store::postgres::query::{SelectStatement, Transpile, postgres_type::PostgresType};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EqualityOperator {
    Equal,
    NotEqual,
}

/// A compiled expression in Postgres.
///
/// This type unifies both value expressions and boolean conditions. In SQL, conditions are
/// boolean-valued expressions — there is no fundamental distinction between a "condition" and
/// an "expression". This allows natural composition, e.g. negating any boolean expression.
#[derive(Debug, Clone, PartialEq)]
pub enum Expression {
    ColumnReference(ColumnReference<'static>),
    /// A parameter are transpiled as a placeholder, e.g. `$1`, in order to prevent SQL injection.
    Parameter(usize),
    /// [`Constant`]s are directly transpiled into the SQL query. Caution has to be taken to
    /// prevent SQL injection and no user input should ever be used as a [`Constant`].
    Constant(Constant),
    Function(Function),
    Window(Box<Self>, WindowDefinition),
    Cast(Box<Self>, PostgresType),
    /// Composite field access - extracts a named field from a composite/row type value.
    ///
    /// Transpiles to `(<expr>)."field"` in PostgreSQL. This is the SQL standard mechanism
    /// for decomposing composite types (created via `ROW(...)::type` or returned from
    /// subqueries) into individual field values.
    ///
    /// Distinct from [`ColumnReference`], which resolves a column name within a table's
    /// namespace. `FieldAccess` operates on a runtime composite *value*.
    ///
    /// Corresponds to `A_Indirection` in PostgreSQL's parse tree and
    /// `CompoundFieldAccess` in sqlparser-rs.
    ///
    /// # Example SQL
    /// ```sql
    /// (f0.c).filter
    /// (ROW(1, 'hello')::my_type).name
    /// ```
    FieldAccess {
        expr: Box<Self>,
        field: ColumnName<'static>,
    },
    /// 1-based array subscript access.
    ///
    /// Transpiles to `(<expr>)[<index>]` in PostgreSQL.
    ArrayElement {
        expr: Box<Self>,
        index: usize,
    },
    /// 1-based array slice access, both bounds inclusive.
    ///
    /// Transpiles to `(<expr>)[<lower>:<upper>]` in PostgreSQL. A slice whose bounds select no
    /// elements is the empty array.
    ArraySlice {
        expr: Box<Self>,
        lower: Box<Self>,
        upper: Box<Self>,
    },
    /// Row constructor - builds a composite row value from individual expressions.
    ///
    /// Transpiles to `ROW(e1, e2, ...)` in PostgreSQL.
    Row(Vec<Self>),
    Select(Box<SelectStatement>),
    /// Subquery existence test.
    ///
    /// Transpiles to `EXISTS (SELECT ...)`, which is true when the subquery delivers at least
    /// one row. Negate with [`not`](Self::not) for `NOT(EXISTS (...))`.
    Exists(Box<SelectStatement>),
    /// Conditional expression.
    ///
    /// Transpiles to `CASE WHEN {cond1} THEN {result1} WHEN {cond2} THEN {result2} ... ELSE
    /// {else_result} END` in PostgreSQL.
    CaseWhen {
        /// List of (condition, result) pairs.
        conditions: Vec<(Self, Self)>,
        /// Optional else result if no condition matches.
        else_result: Option<Box<Self>>,
    },

    Unary(UnaryExpression),
    Binary(BinaryExpression),
    Variadic(VariadicExpression),
    /// Wraps an expression in parentheses to enforce evaluation order.
    ///
    /// Transpiles to `(<expr>)`. Use this when composing expressions where
    /// operator precedence would otherwise produce incorrect SQL.
    Grouped(Box<Self>),

    StartsWith(Box<Self>, Box<Self>),
    EndsWith(Box<Self>, Box<Self>),
    ContainsSegment(Box<Self>, Box<Self>),
}

/// Convenience constructors for condition variants to avoid `Box::new()` boilerplate.
impl Expression {
    #[must_use]
    pub const fn all(conditions: Vec<Self>) -> Self {
        Self::Variadic(VariadicExpression {
            op: VariadicOperator::And,
            exprs: conditions,
        })
    }

    #[must_use]
    pub const fn any(conditions: Vec<Self>) -> Self {
        Self::Variadic(VariadicExpression {
            op: VariadicOperator::Or,
            exprs: conditions,
        })
    }

    /// Folds conditions into one `AND` expression without wrapping a lone condition.
    #[must_use]
    pub fn conjunction(mut conditions: Vec<Self>) -> Option<Self> {
        match conditions.len() {
            0 => None,
            1 => conditions.pop(),
            _ => Some(Self::all(conditions)),
        }
    }

    /// Folds conditions into one `OR` expression without wrapping a lone condition.
    #[must_use]
    pub fn disjunction(mut conditions: Vec<Self>) -> Option<Self> {
        match conditions.len() {
            0 => None,
            1 => conditions.pop(),
            _ => Some(Self::any(conditions)),
        }
    }

    #[must_use]
    #[expect(clippy::should_implement_trait)]
    pub fn not(self) -> Self {
        Self::Unary(UnaryExpression {
            op: UnaryOperator::Not,
            expr: Box::new(self),
        })
    }

    #[must_use]
    pub fn equal(self, rhs: impl Into<Self>) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::Equal,
            left: Box::new(self),
            right: Box::new(rhs.into()),
        })
    }

    #[must_use]
    pub fn not_equal(self, rhs: impl Into<Self>) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::NotEqual,
            left: Box::new(self),
            right: Box::new(rhs.into()),
        })
    }

    #[must_use]
    pub fn exists(statement: SelectStatement) -> Self {
        Self::Exists(Box::new(statement))
    }

    #[must_use]
    #[expect(
        clippy::wrong_self_convention,
        reason = "the SQL predicate is named `IS NULL`, and the builder consumes its expression"
    )]
    pub fn is_null(self) -> Self {
        Self::Unary(UnaryExpression {
            op: UnaryOperator::IsNull,
            expr: Box::new(self),
        })
    }

    #[must_use]
    #[expect(
        clippy::wrong_self_convention,
        reason = "the SQL predicate is named `IS NOT NULL`, and the builder consumes its \
                  expression"
    )]
    pub fn is_not_null(self) -> Self {
        self.is_null().not()
    }

    #[must_use]
    pub fn less(self, rhs: impl Into<Self>) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::Less,
            left: Box::new(self),
            right: Box::new(rhs.into()),
        })
    }

    #[must_use]
    pub fn less_or_equal(self, rhs: impl Into<Self>) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::LessOrEqual,
            left: Box::new(self),
            right: Box::new(rhs.into()),
        })
    }

    #[must_use]
    pub fn greater(self, rhs: impl Into<Self>) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::Greater,
            left: Box::new(self),
            right: Box::new(rhs.into()),
        })
    }

    /// Creates an `expression OVER ( window_definition )` window function call.
    #[must_use]
    pub fn window(self, definition: impl Into<WindowDefinition>) -> Self {
        Self::Window(Box::new(self), definition.into())
    }

    #[must_use]
    pub fn greater_or_equal(self, rhs: impl Into<Self>) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::GreaterOrEqual,
            left: Box::new(self),
            right: Box::new(rhs.into()),
        })
    }

    #[must_use]
    pub fn r#in(self, rhs: impl Into<Self>) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::In,
            left: Box::new(self),
            right: Box::new(rhs.into()),
        })
    }

    #[must_use]
    pub fn regex_match(self, rhs: impl Into<Self>) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::RegexMatch,
            left: Box::new(self),
            right: Box::new(rhs.into()),
        })
    }

    #[must_use]
    pub fn time_interval_contains_timestamp(self, rhs: impl Into<Self>) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::TimeIntervalContainsTimestamp,
            left: Box::new(self),
            right: Box::new(rhs.into()),
        })
    }

    #[must_use]
    pub fn overlap(self, rhs: impl Into<Self>) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::Overlap,
            left: Box::new(self),
            right: Box::new(rhs.into()),
        })
    }

    #[must_use]
    pub fn array_contains(self, rhs: impl Into<Self>) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::ArrayContains,
            left: Box::new(self),
            right: Box::new(rhs.into()),
        })
    }

    /// Cosine distance between two `vector` expressions of equal dimension count.
    #[must_use]
    pub fn cosine_distance(self, rhs: impl Into<Self>) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::CosineDistance,
            left: Box::new(self),
            right: Box::new(rhs.into()),
        })
    }

    /// Hamming distance between two `bit` expressions of equal width.
    #[must_use]
    pub fn hamming_distance(lhs: Self, rhs: Self) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::HammingDistance,
            left: Box::new(lhs),
            right: Box::new(rhs),
        })
    }

    /// Reduces a vector expression to one bit per dimension.
    ///
    /// The argument is pinned to `vector`: `binary_quantize` is overloaded per vector type, so an
    /// untyped parameter fails Postgres' overload resolution.
    #[must_use]
    pub fn binary_quantize(expression: Self) -> Self {
        Self::Function(Function::BinaryQuantize(Box::new(
            expression.cast(PostgresType::Vector { dimensions: None }),
        )))
    }

    #[must_use]
    #[expect(clippy::should_implement_trait)]
    pub fn add(self, rhs: impl Into<Self>) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::Add,
            left: Box::new(self),
            right: Box::new(rhs.into()),
        })
    }

    #[must_use]
    pub fn subtract(self, rhs: impl Into<Self>) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::Subtract,
            left: Box::new(self),
            right: Box::new(rhs.into()),
        })
    }

    #[must_use]
    pub fn multiply(self, rhs: impl Into<Self>) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::Multiply,
            left: Box::new(self),
            right: Box::new(rhs.into()),
        })
    }

    #[must_use]
    pub fn divide(self, rhs: impl Into<Self>) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::Divide,
            left: Box::new(self),
            right: Box::new(rhs.into()),
        })
    }

    #[must_use]
    pub fn modulo(self, rhs: impl Into<Self>) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::Modulo,
            left: Box::new(self),
            right: Box::new(rhs.into()),
        })
    }

    #[must_use]
    pub fn bitwise_and(self, rhs: impl Into<Self>) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::BitwiseAnd,
            left: Box::new(self),
            right: Box::new(rhs.into()),
        })
    }

    #[must_use]
    pub fn bitwise_or(self, rhs: impl Into<Self>) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::BitwiseOr,
            left: Box::new(self),
            right: Box::new(rhs.into()),
        })
    }

    #[must_use]
    pub fn json_access(self, rhs: impl Into<Self>) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::JsonAccess,
            left: Box::new(self),
            right: Box::new(rhs.into()),
        })
    }

    #[must_use]
    pub fn json_access_as_text(self, rhs: impl Into<Self>) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::JsonAccessAsText,
            left: Box::new(self),
            right: Box::new(rhs.into()),
        })
    }

    #[must_use]
    pub fn json_delete(self, rhs: impl Into<Self>) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::JsonDelete,
            left: Box::new(self),
            right: Box::new(rhs.into()),
        })
    }

    #[must_use]
    pub const fn concatenate(exprs: Vec<Self>) -> Self {
        Self::Variadic(VariadicExpression {
            op: VariadicOperator::Concatenate,
            exprs,
        })
    }

    #[must_use]
    pub fn negate(self) -> Self {
        Self::Unary(UnaryExpression {
            op: UnaryOperator::Negate,
            expr: Box::new(self),
        })
    }

    #[must_use]
    pub fn bitwise_not(self) -> Self {
        Self::Unary(UnaryExpression {
            op: UnaryOperator::BitwiseNot,
            expr: Box::new(self),
        })
    }

    #[must_use]
    pub fn grouped(self) -> Self {
        Self::Grouped(Box::new(self))
    }

    #[must_use]
    pub fn coalesce(self, fallback: impl Into<Self>) -> Self {
        Self::Function(Function::Coalesce(
            Box::new(self),
            Box::new(fallback.into()),
        ))
    }

    #[must_use]
    pub fn starts_with(self, rhs: impl Into<Self>) -> Self {
        Self::StartsWith(Box::new(self), Box::new(rhs.into()))
    }

    #[must_use]
    pub fn ends_with(self, rhs: impl Into<Self>) -> Self {
        Self::EndsWith(Box::new(self), Box::new(rhs.into()))
    }

    #[must_use]
    pub fn contains_segment(self, rhs: impl Into<Self>) -> Self {
        Self::ContainsSegment(Box::new(self), Box::new(rhs.into()))
    }

    #[must_use]
    pub fn cast(self, r#type: PostgresType) -> Self {
        Self::Cast(Box::new(self), r#type)
    }

    #[must_use]
    pub fn json_scalar(self) -> Self {
        Self::Function(Function::JsonScalar(Box::new(self)))
    }

    #[must_use]
    pub fn array_element(self, index: usize) -> Self {
        Self::ArrayElement {
            expr: Box::new(self),
            index,
        }
    }
}

impl From<ColumnReference<'static>> for Expression {
    fn from(value: ColumnReference<'static>) -> Self {
        Self::ColumnReference(value)
    }
}

impl From<Function> for Expression {
    fn from(value: Function) -> Self {
        Self::Function(value)
    }
}

impl From<Constant> for Expression {
    fn from(value: Constant) -> Self {
        Self::Constant(value)
    }
}

/// Expression-tree traversal.
///
/// Both visitors run in pre-order (the expression itself before its children) and do not descend
/// into [`Expression::Select`] subqueries: statement-level structures own their traversal. A
/// visitor with no answer for the tables hiding inside a subquery matches on the variant and
/// breaks.
impl Expression {
    /// Calls `visitor` for this expression and every nested sub-expression, stopping at the first
    /// [`ControlFlow::Break`].
    pub fn visit<B>(&self, visitor: &mut impl FnMut(&Self) -> ControlFlow<B>) -> ControlFlow<B> {
        visitor(self)?;
        self.for_each_child(&mut |child| child.visit(visitor))
    }

    /// Calls `visitor` mutably for this expression and every nested sub-expression, stopping at
    /// the first [`ControlFlow::Break`].
    pub fn visit_mut<B>(
        &mut self,
        visitor: &mut impl FnMut(&mut Self) -> ControlFlow<B>,
    ) -> ControlFlow<B> {
        visitor(self)?;
        self.for_each_child_mut(&mut |child| child.visit_mut(visitor))
    }

    fn for_each_child<B>(
        &self,
        visitor: &mut impl FnMut(&Self) -> ControlFlow<B>,
    ) -> ControlFlow<B> {
        match self {
            Self::ColumnReference(_)
            | Self::Parameter(_)
            | Self::Constant(_)
            | Self::Select(_)
            | Self::Exists(_) => ControlFlow::Continue(()),
            Self::Function(function) => function.for_each_child(visitor),
            Self::ArraySlice { expr, lower, upper } => {
                visitor(expr)?;
                visitor(lower)?;
                visitor(upper)
            }
            Self::Window(expr, window) => {
                visitor(expr)?;
                for partition in &*window.partition_by {
                    visitor(partition)?;
                }
                ControlFlow::Continue(())
            }
            Self::Cast(expr, _)
            | Self::FieldAccess { expr, .. }
            | Self::ArrayElement { expr, .. }
            | Self::Grouped(expr) => visitor(expr),
            Self::Row(exprs) => {
                for expr in exprs {
                    visitor(expr)?;
                }
                ControlFlow::Continue(())
            }
            Self::CaseWhen {
                conditions,
                else_result,
            } => {
                for (condition, result) in conditions {
                    visitor(condition)?;
                    visitor(result)?;
                }
                if let Some(else_result) = else_result {
                    visitor(else_result)?;
                }
                ControlFlow::Continue(())
            }
            Self::Unary(unary) => visitor(&unary.expr),
            Self::Binary(binary) => {
                visitor(&binary.left)?;
                visitor(&binary.right)
            }
            Self::Variadic(variadic) => {
                for expr in &variadic.exprs {
                    visitor(expr)?;
                }
                ControlFlow::Continue(())
            }
            Self::StartsWith(lhs, rhs)
            | Self::EndsWith(lhs, rhs)
            | Self::ContainsSegment(lhs, rhs) => {
                visitor(lhs)?;
                visitor(rhs)
            }
        }
    }

    fn for_each_child_mut<B>(
        &mut self,
        visitor: &mut impl FnMut(&mut Self) -> ControlFlow<B>,
    ) -> ControlFlow<B> {
        match self {
            Self::ColumnReference(_)
            | Self::Parameter(_)
            | Self::Constant(_)
            | Self::Select(_)
            | Self::Exists(_) => ControlFlow::Continue(()),
            Self::Function(function) => function.for_each_child_mut(visitor),
            Self::ArraySlice { expr, lower, upper } => {
                visitor(expr)?;
                visitor(lower)?;
                visitor(upper)
            }
            Self::Window(expr, window) => {
                visitor(expr)?;
                for partition in &mut *window.partition_by {
                    visitor(partition)?;
                }
                ControlFlow::Continue(())
            }
            Self::Cast(expr, _)
            | Self::FieldAccess { expr, .. }
            | Self::ArrayElement { expr, .. }
            | Self::Grouped(expr) => visitor(expr),
            Self::Row(exprs) => {
                for expr in exprs {
                    visitor(expr)?;
                }
                ControlFlow::Continue(())
            }
            Self::CaseWhen {
                conditions,
                else_result,
            } => {
                for (condition, result) in conditions {
                    visitor(condition)?;
                    visitor(result)?;
                }
                if let Some(else_result) = else_result {
                    visitor(else_result)?;
                }
                ControlFlow::Continue(())
            }
            Self::Unary(unary) => visitor(&mut unary.expr),
            Self::Binary(binary) => {
                visitor(&mut binary.left)?;
                visitor(&mut binary.right)
            }
            Self::Variadic(variadic) => {
                for expr in &mut variadic.exprs {
                    visitor(expr)?;
                }
                ControlFlow::Continue(())
            }
            Self::StartsWith(lhs, rhs)
            | Self::EndsWith(lhs, rhs)
            | Self::ContainsSegment(lhs, rhs) => {
                visitor(lhs)?;
                visitor(rhs)
            }
        }
    }
}

impl Transpile for Expression {
    #[expect(
        clippy::too_many_lines,
        reason = "Pattern match for all Expression variants"
    )]
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            // --- Value expressions ---
            Self::FieldAccess { expr, field } => {
                fmt.write_char('(')?;
                expr.transpile(fmt)?;
                fmt.write_str(").")?;
                field.transpile(fmt)
            }
            Self::ArrayElement { expr, index } => {
                fmt.write_char('(')?;
                expr.transpile(fmt)?;
                write!(fmt, ")[{index}]")
            }
            Self::ArraySlice { expr, lower, upper } => {
                fmt.write_char('(')?;
                expr.transpile(fmt)?;
                fmt.write_str(")[")?;
                lower.transpile(fmt)?;
                fmt.write_char(':')?;
                upper.transpile(fmt)?;
                fmt.write_char(']')
            }
            Self::ColumnReference(column) => column.transpile(fmt),
            Self::Parameter(index) => write!(fmt, "${index}"),
            Self::Constant(constant) => constant.transpile(fmt),
            Self::Function(function) => function.transpile(fmt),
            Self::Window(expression, window) => {
                expression.transpile(fmt)?;
                fmt.write_str(" OVER (")?;
                window.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::Cast(expression, cast_type) => {
                fmt.write_char('(')?;
                expression.transpile(fmt)?;
                fmt.write_str("::")?;
                cast_type.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::Row(exprs) => {
                fmt.write_str("ROW(")?;
                for (i, expr) in exprs.iter().enumerate() {
                    if i > 0 {
                        fmt.write_str(", ")?;
                    }
                    expr.transpile(fmt)?;
                }
                fmt.write_char(')')
            }
            Self::Select(select) => select.transpile(fmt),
            Self::Exists(select) => {
                fmt.write_str("EXISTS (")?;
                select.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::CaseWhen {
                conditions,
                else_result,
            } => {
                fmt.write_str("CASE")?;
                for (condition, result) in conditions {
                    fmt.write_str(" WHEN ")?;
                    condition.transpile(fmt)?;
                    fmt.write_str(" THEN ")?;
                    result.transpile(fmt)?;
                }
                if let Some(else_expr) = else_result {
                    fmt.write_str(" ELSE ")?;
                    else_expr.transpile(fmt)?;
                }
                fmt.write_str(" END")
            }

            Self::Unary(unary) => unary.transpile(fmt),
            Self::Binary(binary) => binary.transpile(fmt),
            Self::Variadic(variadic) => variadic.transpile(fmt),
            Self::Grouped(inner) => {
                fmt.write_char('(')?;
                inner.transpile(fmt)?;
                fmt.write_char(')')
            }

            Self::StartsWith(lhs, rhs) => {
                fmt.write_str("starts_with(")?;
                lhs.transpile(fmt)?;
                fmt.write_str(", ")?;
                rhs.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::EndsWith(lhs, rhs) => {
                fmt.write_str("right(")?;
                lhs.transpile(fmt)?;
                fmt.write_str(", length(")?;
                rhs.transpile(fmt)?;
                fmt.write_str(")) = ")?;
                rhs.transpile(fmt)
            }
            Self::ContainsSegment(lhs, rhs) => {
                fmt.write_str("strpos(")?;
                lhs.transpile(fmt)?;
                fmt.write_str(", ")?;
                rhs.transpile(fmt)?;
                fmt.write_str(") > 0")
            }
        }
    }
}

pub struct Transpiler<'t, T>(pub &'t T);
impl<T> Display for Transpiler<'_, T>
where
    T: Transpile,
{
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        self.0.transpile(fmt)
    }
}

#[cfg(test)]
mod tests {
    use alloc::borrow::Cow;

    use hash_codec::numeric::Real;
    use hash_graph_store::{
        data_type::DataTypeQueryPath,
        filter::{Filter, FilterExpression, Parameter, PathToken},
    };
    use postgres_types::ToSql;
    use type_system::ontology::DataTypeWithMetadata;

    use super::*;
    use crate::store::postgres::query::{
        Alias, FromItem, Identifier, NonEmptyVec, OrderByClause, PostgresQueryPath as _,
        SelectCompiler, SelectExpression, SimpleSelect, SortBy, SortDirection, Table,
        test_helper::max_version_expression,
    };

    #[test]
    fn conjunction_folds_without_wrapping_lone_conditions() {
        assert_eq!(Expression::conjunction(vec![]), None);
        assert_eq!(Expression::disjunction(vec![]), None);

        let condition = Expression::Parameter(1);
        assert_eq!(
            Expression::conjunction(vec![condition.clone()]),
            Some(condition.clone())
        );
        assert_eq!(
            Expression::disjunction(vec![condition.clone()])
                .expect("a lone condition should fold to itself")
                .transpile_to_string(),
            "$1"
        );

        assert_eq!(
            Expression::conjunction(vec![condition.clone(), Expression::Parameter(2)])
                .expect("two conditions should fold to an `AND` expression")
                .transpile_to_string(),
            "($1) AND ($2)"
        );
        assert_eq!(
            Expression::disjunction(vec![condition, Expression::Parameter(2)])
                .expect("two conditions should fold to an `OR` expression")
                .transpile_to_string(),
            "(($1) OR ($2))"
        );
    }

    #[test]
    fn transpile_window_expression() {
        assert_eq!(
            max_version_expression().transpile_to_string(),
            r#"MAX("ontology_ids_0_0_0"."version") OVER (PARTITION BY "ontology_ids_0_0_0"."base_url")"#
        );
    }

    #[test]
    fn transpile_function_expression() {
        assert_eq!(
            Expression::Function(Function::Min(Box::new(Expression::ColumnReference(
                DataTypeQueryPath::Version
                    .terminating_column()
                    .0
                    .aliased(Alias {
                        condition_index: 1,
                        chain_depth: 2,
                        number: 3,
                    })
            ),)))
            .transpile_to_string(),
            r#"MIN("ontology_ids_1_2_3"."version")"#
        );
    }

    #[test]
    fn transpile_json_null_constant() {
        assert_eq!(
            Expression::Constant(Constant::JsonNull).transpile_to_string(),
            "'null'::jsonb"
        );
    }

    #[test]
    fn transpile_row_number_over_partition() {
        assert_eq!(
            Expression::Window(
                Box::new(Expression::from(Function::RowNumber)),
                WindowDefinition::builder()
                    .partition_by(Expression::Parameter(1))
                    .build(),
            )
            .transpile_to_string(),
            "row_number() OVER (PARTITION BY $1)"
        );
    }

    #[test]
    fn transpile_array_agg_with_ordering() {
        assert_eq!(
            Expression::from(Function::ArrayAgg {
                expression: Box::new(Expression::Parameter(1)),
                order_by: Some(
                    OrderByClause::builder()
                        .sort_by(
                            SortBy::builder()
                                .expression(Expression::Parameter(1))
                                .direction(SortDirection::Ascending),
                        )
                        .build(),
                ),
            })
            .transpile_to_string(),
            "array_agg($1 ORDER BY $1 ASC)"
        );
    }

    #[test]
    fn transpile_array_agg_without_ordering() {
        assert_eq!(
            Expression::from(Function::ArrayAgg {
                expression: Box::new(Expression::Parameter(1)),
                order_by: None,
            })
            .transpile_to_string(),
            "array_agg($1)"
        );
    }

    #[test]
    fn transpile_normalized_subvector_cast() {
        assert_eq!(
            Expression::from(Function::L2Normalize(Box::new(Expression::from(
                Function::Subvector {
                    vector: Box::new(Expression::Parameter(1)),
                    start: 1,
                    count: 512,
                }
            ))))
            .cast(PostgresType::Vector {
                dimensions: Some(512),
            })
            .transpile_to_string(),
            "(l2_normalize(subvector($1, 1, 512))::vector(512))"
        );
    }

    #[test]
    fn transpile_json_array_elements() {
        assert_eq!(
            Expression::from(Function::JsonArrayElements(Box::new(
                Expression::Parameter(1)
            )))
            .transpile_to_string(),
            "jsonb_array_elements($1)"
        );
        assert_eq!(
            Expression::from(Function::JsonArrayElementsText(Box::new(
                Expression::Parameter(1)
            )))
            .transpile_to_string(),
            "jsonb_array_elements_text($1)"
        );
    }

    #[test]
    fn transpile_json_typeof() {
        assert_eq!(
            Expression::from(Function::JsonTypeof(Box::new(Expression::Parameter(1))))
                .transpile_to_string(),
            "jsonb_typeof($1)"
        );
    }

    #[test]
    fn transpile_json_path_query_array() {
        assert_eq!(
            Expression::from(Function::JsonPathQueryArray(
                Box::new(Expression::Parameter(1)),
                Box::new(Expression::Parameter(2)),
            ))
            .transpile_to_string(),
            "jsonb_path_query_array($1, $2)"
        );
    }

    #[test]
    fn transpile_json_object_agg() {
        assert_eq!(
            Expression::from(Function::JsonObjectAgg {
                key: Box::new(Expression::Parameter(1)),
                value: Box::new(Expression::Parameter(2)),
            })
            .transpile_to_string(),
            "jsonb_object_agg($1, $2)"
        );
    }

    #[test]
    fn transpile_count_forms() {
        assert_eq!(
            Expression::Window(
                Box::new(Expression::from(Function::Count(None))),
                WindowDefinition::builder()
                    .partition_by(
                        NonEmptyVec::try_from(vec![
                            Expression::Parameter(1),
                            Expression::Parameter(2),
                        ])
                        .expect("the partition list is non-empty"),
                    )
                    .build(),
            )
            .transpile_to_string(),
            "count(*) OVER (PARTITION BY $1, $2)"
        );
        assert_eq!(
            Expression::from(Function::Count(Some(Box::new(Expression::Parameter(1)))))
                .transpile_to_string(),
            "count($1)"
        );
    }

    #[test]
    fn transpile_text_functions() {
        assert_eq!(
            Expression::from(Function::Ln(Box::new(Expression::Parameter(1))))
                .transpile_to_string(),
            "ln($1)"
        );
        assert_eq!(
            Expression::from(Function::Md5(Box::new(Expression::Parameter(1))))
                .transpile_to_string(),
            "md5($1)"
        );
        assert_eq!(
            Expression::from(Function::CharLength(Box::new(Expression::from(
                Function::Btrim(Box::new(Expression::Parameter(1)))
            ))))
            .transpile_to_string(),
            "char_length(btrim($1))"
        );
        assert_eq!(
            Expression::from(Function::ConcatWs {
                separator: Box::new(Expression::Parameter(1)),
                expressions: vec![Expression::Parameter(2), Expression::Parameter(3)],
            })
            .transpile_to_string(),
            "concat_ws($1, $2, $3)"
        );
        assert_eq!(
            Expression::from(Function::Substring {
                string: Box::new(Expression::Parameter(1)),
                start: Box::new(Expression::add(
                    Expression::Parameter(2),
                    Expression::Constant(Constant::U32(1)),
                )),
            })
            .transpile_to_string(),
            "substring($1 FROM $2 + 1)"
        );
        assert_eq!(
            Expression::from(Function::RegexpReplace {
                string: Box::new(Expression::Parameter(1)),
                pattern: Box::new(Expression::Parameter(2)),
                replacement: Box::new(Expression::Parameter(3)),
            })
            .transpile_to_string(),
            "regexp_replace($1, $2, $3)"
        );
    }

    #[test]
    fn transpile_regex_match() {
        assert_eq!(
            Expression::regex_match(Expression::Parameter(1), Expression::Parameter(2))
                .transpile_to_string(),
            "$1 ~ $2"
        );
    }

    #[test]
    fn transpile_array_slice() {
        assert_eq!(
            Expression::ArraySlice {
                expr: Box::new(Expression::Parameter(1)),
                lower: Box::new(Expression::Constant(Constant::U32(1))),
                upper: Box::new(Expression::Parameter(2)),
            }
            .transpile_to_string(),
            "($1)[1:$2]"
        );
    }

    #[test]
    fn transpile_json_extract_keeps_jsonb() {
        assert_eq!(
            Expression::from(Function::JsonExtract(
                Box::new(Expression::Parameter(1)),
                PathToken::Field(Cow::Borrowed("allOf")),
            ))
            .transpile_to_string(),
            "$1->'allOf'"
        );
    }

    #[test]
    fn transpile_exists_and_its_negation() {
        let statement = || {
            SelectStatement::from(
                SimpleSelect::builder()
                    .selects(vec![SelectExpression::Asterisk(None)])
                    .from(FromItem::table(Table::OntologyIds).build())
                    .build(),
            )
        };

        assert_eq!(
            Expression::exists(statement()).transpile_to_string(),
            "EXISTS (SELECT *\nFROM \"ontology_ids\")"
        );
        assert_eq!(
            Expression::exists(statement()).not().transpile_to_string(),
            "NOT(EXISTS (SELECT *\nFROM \"ontology_ids\"))"
        );
    }

    #[test]
    fn transpile_case_when() {
        let case_expr = Expression::CaseWhen {
            conditions: vec![
                (
                    Expression::Constant(Constant::from(true)),
                    Expression::Constant(Constant::from(1_u32)),
                ),
                (
                    Expression::Constant(Constant::from(false)),
                    Expression::Constant(Constant::from(2_u32)),
                ),
            ],
            else_result: Some(Box::new(Expression::Constant(Constant::from(3_u32)))),
        };
        assert_eq!(
            case_expr.transpile_to_string(),
            "CASE WHEN TRUE THEN 1 WHEN FALSE THEN 2 ELSE 3 END"
        );
    }

    #[test]
    fn transpile_case_when_no_else() {
        let case_expr = Expression::CaseWhen {
            conditions: vec![(
                Expression::Constant(Constant::from(true)),
                Expression::Constant(Constant::from(1_u32)),
            )],
            else_result: None,
        };
        assert_eq!(case_expr.transpile_to_string(), "CASE WHEN TRUE THEN 1 END");
    }

    #[test]
    fn transpile_subtract() {
        let subtract_expr = Expression::subtract(
            Expression::Parameter(1),
            Expression::Function(Function::ArrayLiteral {
                elements: vec![Expression::Parameter(2), Expression::Parameter(3)],
                element_type: PostgresType::Text,
            }),
        );
        assert_eq!(
            subtract_expr.transpile_to_string(),
            "$1 - ARRAY[$2, $3]::text[]"
        );
    }

    #[test]
    fn transpile_concatenate() {
        let concat_expr = Expression::concatenate(vec![
            Expression::Function(Function::ArrayLiteral {
                elements: vec![Expression::Parameter(1)],
                element_type: PostgresType::Text,
            }),
            Expression::Function(Function::ArrayLiteral {
                elements: vec![Expression::Parameter(2)],
                element_type: PostgresType::Text,
            }),
        ]);
        assert_eq!(
            concat_expr.transpile_to_string(),
            "(ARRAY[$1]::text[] || ARRAY[$2]::text[])"
        );
    }

    #[test]
    fn transpile_empty_array() {
        let empty_array = Expression::Function(Function::ArrayLiteral {
            elements: vec![],
            element_type: PostgresType::Text,
        });
        assert_eq!(empty_array.transpile_to_string(), "ARRAY[]::text[]");
    }

    #[test]
    fn transpile_null_constant() {
        assert_eq!(
            Expression::Constant(Constant::Null).transpile_to_string(),
            "NULL"
        );
    }

    #[test]
    fn transpile_u128_constant() {
        assert_eq!(
            Expression::Constant(Constant::U128(0xFFFF_FFFF_FFFF_FFFF_FFFF_FFFF_FFFF_FFFF))
                .transpile_to_string(),
            "340282366920938463463374607431768211455"
        );
    }

    #[test]
    fn transpile_json_agg() {
        assert_eq!(
            Expression::Function(Function::JsonAgg(Box::new(Expression::Parameter(1))))
                .transpile_to_string(),
            "jsonb_agg($1)"
        );
    }

    #[test]
    fn transpile_unnest_multiple() {
        assert_eq!(
            Expression::Function(Function::Unnest(vec![
                Expression::Parameter(1),
                Expression::Parameter(2),
                Expression::Parameter(3),
            ]))
            .transpile_to_string(),
            "UNNEST($1, $2, $3)"
        );
    }

    #[test]
    fn transpile_field_access() {
        assert_eq!(
            Expression::FieldAccess {
                expr: Box::new(Expression::Parameter(1)),
                field: ColumnName::from(Identifier::from("filter")),
            }
            .transpile_to_string(),
            r#"($1)."filter""#
        );
    }

    #[test]
    fn transpile_is_not_false() {
        assert_eq!(
            Expression::Unary(UnaryExpression {
                op: UnaryOperator::IsNotFalse,
                expr: Box::new(Expression::Parameter(1)),
            })
            .transpile_to_string(),
            "$1 IS NOT FALSE"
        );
    }

    #[test]
    fn transpile_cast_types() {
        assert_eq!(
            Expression::Parameter(1)
                .cast(PostgresType::JsonB)
                .transpile_to_string(),
            "($1::jsonb)"
        );
        assert_eq!(
            Expression::Parameter(1)
                .cast(PostgresType::Numeric)
                .transpile_to_string(),
            "($1::numeric)"
        );
        assert_eq!(
            Expression::Parameter(1)
                .cast(PostgresType::Int4)
                .transpile_to_string(),
            "($1::int4)"
        );
        assert_eq!(
            Expression::Parameter(1)
                .cast(PostgresType::Int8)
                .transpile_to_string(),
            "($1::int8)"
        );
    }

    fn test_condition<'p, 'f: 'p>(
        filter: &'f Filter<'p, DataTypeWithMetadata>,
        rendered: &'static str,
        parameters: &[&'p dyn ToSql],
    ) {
        let mut compiler = SelectCompiler::with_asterisk(None, false);
        let condition = compiler
            .compile_filter(filter)
            .expect("failed to compile filter");

        assert_eq!(condition.transpile_to_string(), rendered);

        let parameter_list = parameters
            .iter()
            .map(|parameter| format!("{parameter:?}"))
            .collect::<Vec<_>>();
        let expected_parameters = compiler
            .compile()
            .1
            .map(|parameter| format!("{parameter:?}"))
            .collect::<Vec<_>>();

        assert_eq!(parameter_list, expected_parameters);
    }

    #[test]
    fn transpile_row_constructor() {
        assert_eq!(Expression::Row(vec![]).transpile_to_string(), "ROW()");
        assert_eq!(
            Expression::Row(vec![Expression::Parameter(1)]).transpile_to_string(),
            "ROW($1)"
        );
        assert_eq!(
            Expression::Row(vec![
                Expression::Parameter(1),
                Expression::Constant(Constant::from(42_u32)),
            ])
            .transpile_to_string(),
            "ROW($1, 42)"
        );
    }

    #[test]
    fn transpile_empty_condition() {
        test_condition(&Filter::All(vec![]), "TRUE", &[]);
        test_condition(&Filter::Any(vec![]), "FALSE", &[]);
    }

    #[test]
    fn transpile_exists_condition() {
        test_condition(
            &Filter::Exists {
                path: DataTypeQueryPath::Description,
            },
            r#""data_types_0_1_0"."schema"->>'description' IS NOT NULL"#,
            &[],
        );

        test_condition(
            &Filter::Not(Box::new(Filter::Exists {
                path: DataTypeQueryPath::Description,
            })),
            r#""data_types_0_1_0"."schema"->>'description' IS NULL"#,
            &[],
        );

        // Double negation (e.g. `Not(IsRemote)`, where `IsRemote` is itself `Not(Exists)`):
        // three nested `Not`s over `IsNull` must still resolve to `IS NOT NULL`.
        test_condition(
            &Filter::Not(Box::new(Filter::Not(Box::new(Filter::Exists {
                path: DataTypeQueryPath::Description,
            })))),
            r#""data_types_0_1_0"."schema"->>'description' IS NOT NULL"#,
            &[],
        );
    }

    #[test]
    fn transpile_all_condition() {
        test_condition(
            &Filter::All(vec![Filter::Equal(
                FilterExpression::Path {
                    path: DataTypeQueryPath::VersionedUrl,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Text(Cow::Borrowed(
                        "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    )),
                    convert: None,
                },
            )]),
            r#""data_types_0_1_0"."schema"->>'$id' = $1"#,
            &[&"https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1"],
        );

        test_condition(
            &Filter::All(vec![
                Filter::Equal(
                    FilterExpression::Path {
                        path: DataTypeQueryPath::BaseUrl,
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::Text(Cow::Borrowed(
                            "https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                        )),
                        convert: None,
                    },
                ),
                Filter::Equal(
                    FilterExpression::Path {
                        path: DataTypeQueryPath::Version,
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::Decimal(Real::from_natural(1, 1)),
                        convert: None,
                    },
                ),
            ]),
            r#"("ontology_ids_0_1_0"."base_url" = $1) AND ("ontology_ids_0_1_0"."version" = $2)"#,
            &[
                &"https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                &Real::from_natural(1, 1),
            ],
        );
    }

    #[test]
    fn transpile_any_condition() {
        test_condition(
            &Filter::Any(vec![Filter::Equal(
                FilterExpression::Path {
                    path: DataTypeQueryPath::VersionedUrl,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Text(Cow::Borrowed(
                        "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    )),
                    convert: None,
                },
            )]),
            r#""data_types_0_1_0"."schema"->>'$id' = $1"#,
            &[&"https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1"],
        );

        test_condition(
            &Filter::Any(vec![
                Filter::Equal(
                    FilterExpression::Path {
                        path: DataTypeQueryPath::BaseUrl,
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::Text(Cow::Borrowed(
                            "https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                        )),
                        convert: None,
                    },
                ),
                Filter::Equal(
                    FilterExpression::Path {
                        path: DataTypeQueryPath::Version,
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::Decimal(Real::from_natural(1, 1)),
                        convert: None,
                    },
                ),
            ]),
            r#"(("ontology_ids_0_1_0"."base_url" = $1) OR ("ontology_ids_0_1_0"."version" = $2))"#,
            &[
                &"https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                &Real::from_natural(1, 1),
            ],
        );
    }

    #[test]
    fn transpile_not_condition() {
        test_condition(
            &Filter::Not(Box::new(Filter::Equal(
                FilterExpression::Path {
                    path: DataTypeQueryPath::VersionedUrl,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Text(Cow::Borrowed(
                        "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    )),
                    convert: None,
                },
            ))),
            r#"NOT("data_types_0_1_0"."schema"->>'$id' = $1)"#,
            &[&"https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1"],
        );
    }

    #[test]
    fn transpile_starts_with_condition() {
        test_condition(
            &Filter::StartsWith(
                FilterExpression::Path {
                    path: DataTypeQueryPath::Title,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Text(Cow::Borrowed("foo")),
                    convert: None,
                },
            ),
            r#"starts_with("data_types_0_1_0"."schema"->>'title', $1)"#,
            &[&"foo"],
        );
    }

    #[test]
    fn transpile_ends_with_condition() {
        test_condition(
            &Filter::EndsWith(
                FilterExpression::Path {
                    path: DataTypeQueryPath::Title,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Text(Cow::Borrowed("bar")),
                    convert: None,
                },
            ),
            r#"right("data_types_0_1_0"."schema"->>'title', length($1)) = $1"#,
            &[&"bar"],
        );
    }

    #[test]
    fn transpile_contains_segment_condition() {
        test_condition(
            &Filter::ContainsSegment(
                FilterExpression::Path {
                    path: DataTypeQueryPath::Title,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Text(Cow::Borrowed("baz")),
                    convert: None,
                },
            ),
            r#"strpos("data_types_0_1_0"."schema"->>'title', $1) > 0"#,
            &[&"baz"],
        );
    }

    #[test]
    fn render_without_parameters() {
        test_condition(
            &Filter::Any(vec![Filter::Equal(
                FilterExpression::Path {
                    path: DataTypeQueryPath::Description,
                },
                FilterExpression::Path {
                    path: DataTypeQueryPath::Title,
                },
            )]),
            r#""data_types_0_1_0"."schema"->>'description' = "data_types_0_1_0"."schema"->>'title'"#,
            &[],
        );
    }
}
