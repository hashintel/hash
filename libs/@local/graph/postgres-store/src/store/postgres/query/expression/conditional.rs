use core::fmt::{
    Display, Formatter, Write as _, {self},
};

use hash_graph_store::filter::PathToken;

use super::ColumnReference;
use crate::store::postgres::query::{
    SelectStatement, Table, Transpile, WindowStatement,
    expression::{BinaryExpression, BinaryOperator, UnaryExpression, UnaryOperator},
};

#[derive(Debug, Clone, PartialEq)]
pub enum Function {
    Min(Box<Expression>),
    Max(Box<Expression>),
    JsonExtractText(Box<Expression>),
    JsonExtractAsText(Box<Expression>, PathToken<'static>),
    JsonExtractPath(Vec<Expression>),
    JsonContains(Box<Expression>, Box<Expression>),
    JsonBuildArray(Vec<Expression>),
    JsonBuildObject(Vec<(Expression, Expression)>),
    JsonPathQueryFirst(Box<Expression>, Box<Expression>),
    /// Removes keys from a JSONB object.
    ///
    /// Transpiles to `{jsonb} - {text_array}` in PostgreSQL.
    JsonDeleteKeys(Box<Expression>, Box<Expression>),
    /// Concatenates multiple arrays into one.
    ///
    /// Transpiles to `{arr1} || {arr2} || ...` in PostgreSQL.
    ArrayConcat(Vec<Expression>),
    /// Creates an array literal with explicit type cast.
    ///
    /// Transpiles to `ARRAY[{elements}]::{type}[]` in PostgreSQL.
    ArrayLiteral {
        elements: Vec<Expression>,
        element_type: PostgresType,
    },
    Lower(Box<Expression>),
    Upper(Box<Expression>),
    Unnest(Box<Expression>),
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
            Self::Unnest(expression) => {
                fmt.write_str("UNNEST(")?;
                expression.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::JsonPathQueryFirst(target, path) => {
                fmt.write_str("jsonb_path_query_first(")?;
                target.transpile(fmt)?;
                fmt.write_str(", ")?;
                path.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::JsonDeleteKeys(jsonb, keys) => {
                fmt.write_char('(')?;
                jsonb.transpile(fmt)?;
                fmt.write_str(" - ")?;
                keys.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::ArrayConcat(arrays) => {
                fmt.write_char('(')?;
                for (i, array) in arrays.iter().enumerate() {
                    if i > 0 {
                        fmt.write_str(" || ")?;
                    }
                    array.transpile(fmt)?;
                }
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Constant {
    Boolean(bool),
    Text(&'static str),
    UnsignedInteger(u32),
    Null,
}

impl From<bool> for Constant {
    fn from(value: bool) -> Self {
        Self::Boolean(value)
    }
}

impl From<&'static str> for Constant {
    fn from(text: &'static str) -> Self {
        Self::Text(text)
    }
}

impl From<u32> for Constant {
    fn from(value: u32) -> Self {
        Self::UnsignedInteger(value)
    }
}

impl Transpile for Constant {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Boolean(value) => fmt.write_str(if *value { "TRUE" } else { "FALSE" }),
            Self::Text(value) => write!(fmt, "'{value}'"),
            Self::UnsignedInteger(number) => fmt::Display::fmt(number, fmt),
            Self::Null => fmt.write_str("NULL"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum PostgresType {
    Array(Box<Self>),
    Row(Table),
    Text,
    JsonPath,
}

impl Transpile for PostgresType {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Array(inner) => {
                inner.transpile(fmt)?;
                fmt.write_str("[]")
            }
            Self::Row(table) => table.transpile(fmt),
            Self::Text => fmt.write_str("text"),
            Self::JsonPath => fmt.write_str("jsonpath"),
        }
    }
}

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
    Window(Box<Self>, WindowStatement),
    Cast(Box<Self>, PostgresType),
    /// Row expansion - expands a composite type into its constituent columns.
    ///
    /// Transpiles to `(expression).*` in PostgreSQL, which is used to expand
    /// composite/row types into individual columns. Commonly used in INSERT
    /// statements to expand a row parameter into column values.
    ///
    /// # Example SQL
    /// ```sql
    /// INSERT INTO users VALUES (($1::users).*)
    /// ```
    RowExpansion(Box<Self>),
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

    /// Conjunction of conditions. Transpiles to `(c1) AND (c2) AND ...`.
    /// Empty list transpiles to `TRUE`.
    All(Vec<Self>),
    /// Disjunction of conditions. Transpiles to `((c1) OR (c2) OR ...)`.
    /// Empty list transpiles to `FALSE`.
    Any(Vec<Self>),

    StartsWith(Box<Self>, Box<Self>),
    EndsWith(Box<Self>, Box<Self>),
    ContainsSegment(Box<Self>, Box<Self>),
}

/// Convenience constructors for condition variants to avoid `Box::new()` boilerplate.
impl Expression {
    #[must_use]
    pub const fn all(conditions: Vec<Self>) -> Self {
        Self::All(conditions)
    }

    #[must_use]
    pub const fn any(conditions: Vec<Self>) -> Self {
        Self::Any(conditions)
    }

    #[must_use]
    pub fn not(inner: Self) -> Self {
        Self::Unary(UnaryExpression {
            op: UnaryOperator::Not,
            expr: Box::new(inner),
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
    pub fn exists(expr: Self) -> Self {
        Self::Unary(UnaryExpression {
            op: UnaryOperator::IsNull,
            expr: Box::new(expr),
        })
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
    pub fn cosine_distance(lhs: Self, rhs: Self) -> Self {
        Self::Binary(BinaryExpression {
            op: BinaryOperator::CosineDistance,
            left: Box::new(lhs),
            right: Box::new(rhs),
        })
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
}

impl Transpile for Expression {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            // --- Value expressions ---
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
            Self::RowExpansion(expression) => {
                expression.transpile(fmt)?;
                fmt.write_str(".*")
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

            // --- Boolean conditions ---
            Self::All(conditions) if conditions.is_empty() => fmt.write_str("TRUE"),
            Self::Any(conditions) if conditions.is_empty() => fmt.write_str("FALSE"),
            Self::All(conditions) => {
                for (idx, condition) in conditions.iter().enumerate() {
                    if idx > 0 {
                        fmt.write_str(" AND ")?;
                    }
                    fmt.write_char('(')?;
                    condition.transpile(fmt)?;
                    fmt.write_char(')')?;
                }
                Ok(())
            }
            Self::Any(conditions) => {
                if conditions.len() > 1 {
                    fmt.write_char('(')?;
                }
                for (idx, condition) in conditions.iter().enumerate() {
                    if idx > 0 {
                        fmt.write_str(" OR ")?;
                    }
                    fmt.write_char('(')?;
                    condition.transpile(fmt)?;
                    fmt.write_char(')')?;
                }
                if conditions.len() > 1 {
                    fmt.write_char(')')?;
                }
                Ok(())
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
        Alias, PostgresQueryPath as _, SelectCompiler, test_helper::max_version_expression,
    };

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
    fn transpile_case_when() {
        let case_expr = Expression::CaseWhen {
            conditions: vec![
                (
                    Expression::Constant(Constant::from(true)),
                    Expression::Constant(Constant::from("yes")),
                ),
                (
                    Expression::Constant(Constant::from(false)),
                    Expression::Constant(Constant::from("maybe")),
                ),
            ],
            else_result: Some(Box::new(Expression::Constant(Constant::from("no")))),
        };
        assert_eq!(
            case_expr.transpile_to_string(),
            "CASE WHEN TRUE THEN 'yes' WHEN FALSE THEN 'maybe' ELSE 'no' END"
        );
    }

    #[test]
    fn transpile_case_when_no_else() {
        let case_expr = Expression::CaseWhen {
            conditions: vec![(
                Expression::Constant(Constant::from(true)),
                Expression::Constant(Constant::from("yes")),
            )],
            else_result: None,
        };
        assert_eq!(
            case_expr.transpile_to_string(),
            "CASE WHEN TRUE THEN 'yes' END"
        );
    }

    #[test]
    fn transpile_json_delete_keys() {
        let delete_expr = Expression::Function(Function::JsonDeleteKeys(
            Box::new(Expression::Parameter(1)),
            Box::new(Expression::Function(Function::ArrayLiteral {
                elements: vec![
                    Expression::Constant(Constant::from("email/")),
                    Expression::Constant(Constant::from("phone/")),
                ],
                element_type: PostgresType::Text,
            })),
        ));
        assert_eq!(
            delete_expr.transpile_to_string(),
            "($1 - ARRAY['email/', 'phone/']::text[])"
        );
    }

    #[test]
    fn transpile_array_concat() {
        let concat_expr = Expression::Function(Function::ArrayConcat(vec![
            Expression::Function(Function::ArrayLiteral {
                elements: vec![Expression::Constant(Constant::from("a"))],
                element_type: PostgresType::Text,
            }),
            Expression::Function(Function::ArrayLiteral {
                elements: vec![Expression::Constant(Constant::from("b"))],
                element_type: PostgresType::Text,
            }),
        ]));
        assert_eq!(
            concat_expr.transpile_to_string(),
            "(ARRAY['a']::text[] || ARRAY['b']::text[])"
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

    fn test_condition<'p, 'f: 'p>(
        filter: &'f Filter<'p, DataTypeWithMetadata>,
        rendered: &'static str,
        parameters: &[&'p dyn ToSql],
    ) {
        let mut compiler = SelectCompiler::new(None, false);
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
            r#""data_types_0_1_0"."schema"->>'description' IS NULL"#,
            &[],
        );

        test_condition(
            &Filter::Not(Box::new(Filter::Exists {
                path: DataTypeQueryPath::Description,
            })),
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
