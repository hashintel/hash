use core::fmt::{
    Display, Formatter, Write as _, {self},
};

use hash_graph_store::filter::PathToken;
use uuid::Uuid;

use super::ColumnReference;
use crate::store::postgres::query::{
    Condition, SelectStatement, Table, Transpile, WindowStatement,
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

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Constant {
    Boolean(bool),
    String(&'static str),
    UnsignedInteger(u32),
    Uuid(Uuid),
}

impl Transpile for Constant {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Boolean(value) => fmt.write_str(if *value { "TRUE" } else { "FALSE" }),
            Self::String(value) => write!(fmt, "'{value}'"),
            Self::UnsignedInteger(value) => write!(fmt, "{value}"),
            Self::Uuid(value) => write!(fmt, "'{value}'"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum PostgresType {
    Array(Box<Self>),
    Row(Table),
    Text,
    Uuid,
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
            Self::Uuid => fmt.write_str("uuid"),
            Self::JsonPath => fmt.write_str("jsonpath"),
        }
    }
}

/// A compiled expression in Postgres.
#[derive(Debug, Clone, PartialEq)]
pub enum Expression {
    ColumnReference(ColumnReference<'static>),
    /// A parameter are transpiled as a placeholder, e.g. `$1`, in order to prevent SQL injection.
    Parameter(usize),
    /// [`Constant`]s are directly transpiled into the SQL query. Caution has to be taken to
    /// prevent SQL injection and no user input should ever be used as a [`Constant`].
    Constant(Constant),
    Function(Function),
    CosineDistance(Box<Self>, Box<Self>),
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
    /// Wraps a [`Condition`] for use in expression contexts.
    ///
    /// This allows conditions (which evaluate to boolean) to be used where expressions
    /// are expected, such as in CASE WHEN conditions.
    ///
    /// # Example SQL
    /// ```sql
    /// CASE WHEN (a = b AND c != d) THEN 'yes' ELSE 'no' END
    /// ```
    Condition(Box<Condition>),
}

impl Transpile for Expression {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::ColumnReference(column) => column.transpile(fmt),
            Self::Parameter(index) => write!(fmt, "${index}"),
            Self::Constant(constant) => constant.transpile(fmt),
            Self::Function(function) => function.transpile(fmt),
            Self::CosineDistance(lhs, rhs) => {
                lhs.transpile(fmt)?;
                fmt.write_str(" <=> ")?;
                rhs.transpile(fmt)
            }
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
            Self::Condition(condition) => {
                fmt.write_char('(')?;
                condition.transpile(fmt)?;
                fmt.write_char(')')
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
    use hash_graph_store::data_type::DataTypeQueryPath;

    use super::*;
    use crate::store::postgres::query::{
        Alias, PostgresQueryPath as _, test_helper::max_version_expression,
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
                    Expression::Constant(Constant::Boolean(true)),
                    Expression::Constant(Constant::String("yes")),
                ),
                (
                    Expression::Constant(Constant::Boolean(false)),
                    Expression::Constant(Constant::String("maybe")),
                ),
            ],
            else_result: Some(Box::new(Expression::Constant(Constant::String("no")))),
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
                Expression::Constant(Constant::Boolean(true)),
                Expression::Constant(Constant::String("yes")),
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
                    Expression::Constant(Constant::String("email/")),
                    Expression::Constant(Constant::String("phone/")),
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
                elements: vec![Expression::Constant(Constant::String("a"))],
                element_type: PostgresType::Text,
            }),
            Expression::Function(Function::ArrayLiteral {
                elements: vec![Expression::Constant(Constant::String("b"))],
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
}
