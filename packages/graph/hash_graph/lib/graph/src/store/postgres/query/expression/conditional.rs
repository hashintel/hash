use std::fmt::{self, Write};

use crate::store::postgres::query::{AliasedColumn, Transpile, WindowStatement};

#[derive(Debug, PartialEq, Eq, Hash)]
pub enum Function<'q> {
    Min(Expression<'q>),
    Max(Expression<'q>),
}

impl Transpile for Function<'_> {
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
        }
    }
}

#[derive(Debug, PartialEq, Eq, Hash)]
pub enum Constant {
    Boolean(bool),
}

impl Transpile for Constant {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Boolean(value) => fmt.write_str(if *value { "TRUE" } else { "FALSE" }),
        }
    }
}

/// A compiled expression in Postgres.
#[derive(Debug, PartialEq, Eq, Hash)]
pub enum Expression<'q> {
    Asterisk,
    Column(AliasedColumn<'q>),
    /// A parameter are transpiled as a placeholder, e.g. `$1`, in order to prevent SQL injection.
    Parameter(usize),
    /// [`Constant`]s are directly transpiled into the SQL query. Caution has to be taken to
    /// prevent SQL injection and no user input should ever be used as a [`Constant`].
    Constant(Constant),
    Function(Box<Function<'q>>),
    Window(Box<Self>, WindowStatement<'q>),
}

impl Transpile for Expression<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Asterisk => fmt.write_char('*'),
            Self::Column(column) => column.transpile(fmt),
            Self::Parameter(index) => write!(fmt, "${index}"),
            Self::Constant(constant) => constant.transpile(fmt),
            Self::Function(function) => function.transpile(fmt),
            Self::Window(expression, window) => {
                expression.transpile(fmt)?;
                fmt.write_str(" OVER (")?;
                window.transpile(fmt)?;
                fmt.write_char(')')
            }
        }
    }
}

impl Transpile for Option<Expression<'_>> {
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
        store::postgres::query::{test_helper::max_version_expression, Alias, Path},
    };

    #[test]
    fn transpile_window_expression() {
        assert_eq!(
            max_version_expression().transpile_to_string(),
            r#"MAX("type_ids_0_0_0"."version") OVER (PARTITION BY "type_ids_0_0_0"."base_uri")"#
        );
    }

    #[test]
    fn transpile_function_expression() {
        assert_eq!(
            Expression::Function(Box::new(Function::Min(Expression::Column(
                DataTypeQueryPath::Version
                    .terminating_column()
                    .aliased(Alias {
                        condition_index: 1,
                        chain_depth: 2,
                        number: 3
                    })
            ))))
            .transpile_to_string(),
            r#"MIN("type_ids_1_2_3"."version")"#
        );
    }
}
