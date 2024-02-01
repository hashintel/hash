use std::fmt::{self, Display, Formatter, Write};

use crate::store::postgres::query::{AliasedColumn, Transpile, WindowStatement};

#[derive(Debug, PartialEq, Eq, Hash)]
pub enum Function {
    Min(Box<Expression>),
    Max(Box<Expression>),
    JsonExtractText(Box<Expression>),
    JsonExtractPath(Vec<Expression>),
    JsonContains(Box<Expression>, Box<Expression>),
    JsonBuildArray(Vec<Expression>),
    JsonBuildObject(Vec<(Expression, Expression)>),
    Lower(Box<Expression>),
    Upper(Box<Expression>),
    Now,
}

impl Transpile for Function {
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
        }
    }
}

#[derive(Debug, PartialEq, Eq, Hash)]
pub enum Constant {
    Boolean(bool),
    String(&'static str),
    UnsignedInteger(u32),
}

impl Transpile for Constant {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Boolean(value) => fmt.write_str(if *value { "TRUE" } else { "FALSE" }),
            Self::String(value) => write!(fmt, "'{value}'"),
            Self::UnsignedInteger(value) => write!(fmt, "{value}"),
        }
    }
}

/// A compiled expression in Postgres.
#[derive(Debug, PartialEq, Eq, Hash)]
pub enum Expression {
    Asterisk,
    Column(AliasedColumn),
    /// A parameter are transpiled as a placeholder, e.g. `$1`, in order to prevent SQL injection.
    Parameter(usize),
    /// [`Constant`]s are directly transpiled into the SQL query. Caution has to be taken to
    /// prevent SQL injection and no user input should ever be used as a [`Constant`].
    Constant(Constant),
    Function(Function),
    CosineDistance(Box<Self>, Box<Self>),
    Window(Box<Self>, WindowStatement),
}

impl Transpile for Expression {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Asterisk => fmt.write_char('*'),
            Self::Column(column) => column.transpile(fmt),
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
        }
    }
}

pub struct Transpiler<'t, T>(pub &'t T);
impl<'t, T> Display for Transpiler<'t, T>
where
    T: Transpile,
{
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        self.0.transpile(f)
    }
}

impl Transpile for Option<Expression> {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Some(value) => value.transpile(fmt),
            None => fmt.write_str("NULL"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        ontology::DataTypeQueryPath,
        store::postgres::query::{test_helper::max_version_expression, Alias, PostgresQueryPath},
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
            Expression::Function(Function::Min(Box::new(Expression::Column(
                DataTypeQueryPath::Version
                    .terminating_column()
                    .aliased(Alias {
                        condition_index: 1,
                        chain_depth: 2,
                        number: 3
                    })
            ))))
            .transpile_to_string(),
            r#"MIN("ontology_ids_1_2_3"."version")"#
        );
    }
}
