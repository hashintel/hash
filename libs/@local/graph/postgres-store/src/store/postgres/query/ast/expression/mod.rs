mod binary;
mod constant;
mod function;
mod unary;
mod variadic;
mod window;

use core::fmt::{
    Display, Formatter, Write as _, {self},
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
    /// Row constructor - builds a composite row value from individual expressions.
    ///
    /// Transpiles to `ROW(e1, e2, ...)` in PostgreSQL.
    Row(Vec<Self>),
    Select(Box<SelectStatement>),
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
    pub fn equal(lhs: Self, rhs: Self) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::Equal,
            left: Box::new(lhs),
            right: Box::new(rhs),
        })
    }

    #[must_use]
    pub fn not_equal(lhs: Self, rhs: Self) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::NotEqual,
            left: Box::new(lhs),
            right: Box::new(rhs),
        })
    }

    #[must_use]
    pub fn is_null(expr: Self) -> Self {
        Self::Unary(UnaryExpression {
            op: UnaryOperator::IsNull,
            expr: Box::new(expr),
        })
    }

    #[must_use]
    pub fn is_not_null(expr: Self) -> Self {
        Self::is_null(expr).not()
    }

    #[must_use]
    pub fn less(lhs: Self, rhs: Self) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::Less,
            left: Box::new(lhs),
            right: Box::new(rhs),
        })
    }

    #[must_use]
    pub fn less_or_equal(lhs: Self, rhs: Self) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::LessOrEqual,
            left: Box::new(lhs),
            right: Box::new(rhs),
        })
    }

    #[must_use]
    pub fn greater(lhs: Self, rhs: Self) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::Greater,
            left: Box::new(lhs),
            right: Box::new(rhs),
        })
    }

    /// Creates an `expression OVER ( window_definition )` window function call.
    #[must_use]
    pub fn window(expression: Self, definition: impl Into<WindowDefinition>) -> Self {
        Self::Window(Box::new(expression), definition.into())
    }

    #[must_use]
    pub fn greater_or_equal(lhs: Self, rhs: Self) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::GreaterOrEqual,
            left: Box::new(lhs),
            right: Box::new(rhs),
        })
    }

    #[must_use]
    pub fn r#in(lhs: Self, rhs: Self) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::In,
            left: Box::new(lhs),
            right: Box::new(rhs),
        })
    }

    #[must_use]
    pub fn time_interval_contains_timestamp(lhs: Self, rhs: Self) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::TimeIntervalContainsTimestamp,
            left: Box::new(lhs),
            right: Box::new(rhs),
        })
    }

    #[must_use]
    pub fn overlap(lhs: Self, rhs: Self) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::Overlap,
            left: Box::new(lhs),
            right: Box::new(rhs),
        })
    }

    #[must_use]
    pub fn array_contains(lhs: Self, rhs: Self) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::ArrayContains,
            left: Box::new(lhs),
            right: Box::new(rhs),
        })
    }

    #[must_use]
    pub fn cosine_distance(lhs: Self, rhs: Self) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::CosineDistance,
            left: Box::new(lhs),
            right: Box::new(rhs),
        })
    }

    #[must_use]
    #[expect(clippy::should_implement_trait)]
    pub fn add(lhs: Self, rhs: Self) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::Add,
            left: Box::new(lhs),
            right: Box::new(rhs),
        })
    }

    #[must_use]
    pub fn subtract(lhs: Self, rhs: Self) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::Subtract,
            left: Box::new(lhs),
            right: Box::new(rhs),
        })
    }

    #[must_use]
    pub fn multiply(lhs: Self, rhs: Self) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::Multiply,
            left: Box::new(lhs),
            right: Box::new(rhs),
        })
    }

    #[must_use]
    pub fn divide(lhs: Self, rhs: Self) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::Divide,
            left: Box::new(lhs),
            right: Box::new(rhs),
        })
    }

    #[must_use]
    pub fn modulo(lhs: Self, rhs: Self) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::Modulo,
            left: Box::new(lhs),
            right: Box::new(rhs),
        })
    }

    #[must_use]
    pub fn bitwise_and(lhs: Self, rhs: Self) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::BitwiseAnd,
            left: Box::new(lhs),
            right: Box::new(rhs),
        })
    }

    #[must_use]
    pub fn bitwise_or(lhs: Self, rhs: Self) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::BitwiseOr,
            left: Box::new(lhs),
            right: Box::new(rhs),
        })
    }

    #[must_use]
    pub fn json_access(lhs: Self, rhs: Self) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::JsonAccess,
            left: Box::new(lhs),
            right: Box::new(rhs),
        })
    }

    #[must_use]
    pub fn json_access_as_text(lhs: Self, rhs: Self) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::JsonAccessAsText,
            left: Box::new(lhs),
            right: Box::new(rhs),
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
    pub fn negate(inner: Self) -> Self {
        Self::Unary(UnaryExpression {
            op: UnaryOperator::Negate,
            expr: Box::new(inner),
        })
    }

    #[must_use]
    pub fn bitwise_not(inner: Self) -> Self {
        Self::Unary(UnaryExpression {
            op: UnaryOperator::BitwiseNot,
            expr: Box::new(inner),
        })
    }

    #[must_use]
    pub fn grouped(self) -> Self {
        Self::Grouped(Box::new(self))
    }

    #[must_use]
    pub fn coalesce(self, fallback: Self) -> Self {
        Self::Function(Function::Coalesce(Box::new(self), Box::new(fallback)))
    }

    #[must_use]
    pub fn starts_with(lhs: Self, rhs: Self) -> Self {
        Self::StartsWith(Box::new(lhs), Box::new(rhs))
    }

    #[must_use]
    pub fn ends_with(lhs: Self, rhs: Self) -> Self {
        Self::EndsWith(Box::new(lhs), Box::new(rhs))
    }

    #[must_use]
    pub fn contains_segment(lhs: Self, rhs: Self) -> Self {
        Self::ContainsSegment(Box::new(lhs), Box::new(rhs))
    }

    #[must_use]
    pub fn cast(self, r#type: PostgresType) -> Self {
        Self::Cast(Box::new(self), r#type)
    }

    #[must_use]
    pub fn json_scalar(self) -> Self {
        Self::Function(Function::JsonScalar(Box::new(self)))
    }
}

impl Transpile for Expression {
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
        filter::{Filter, FilterExpression, Parameter},
    };
    use postgres_types::ToSql;
    use type_system::ontology::DataTypeWithMetadata;

    use super::*;
    use crate::store::postgres::query::{
        Alias, Identifier, PostgresQueryPath as _, SelectCompiler,
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
            .iter()
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
            r#"("data_types_0_1_0"."schema"->>'$id' = $1)"#,
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
            r#"("data_types_0_1_0"."schema"->>'$id' = $1)"#,
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
            r#"("data_types_0_1_0"."schema"->>'description' = "data_types_0_1_0"."schema"->>'title')"#,
            &[],
        );
    }
}
