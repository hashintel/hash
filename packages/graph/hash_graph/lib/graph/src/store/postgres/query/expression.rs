use std::{fmt, fmt::Write};

use postgres_types::ToSql;

use crate::store::{
    postgres::query::{
        Column, Path, PostgresQueryRecord, Table, TableAlias, Transpile, WindowStatement,
    },
    query::{FilterExpression, Parameter},
};

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

/// A compiled expression in Postgres.
#[derive(Debug, PartialEq, Eq, Hash)]
pub enum Expression<'q> {
    Column(Column<'q>),
    Parameter(usize),
    Function(Box<Function<'q>>),
    Window(Box<Self>, WindowStatement<'q>),
}

impl<'q> Expression<'q> {
    pub fn from_filter_value<'f: 'q, T: PostgresQueryRecord<'q>>(
        value: &'f FilterExpression<'q, T>,
        parameters: &mut Vec<&'f dyn ToSql>,
        alias: Option<TableAlias>,
    ) -> Self {
        match value {
            FilterExpression::Path(path) => Self::Column(Column {
                table: Table {
                    name: path.terminating_table_name(),
                    alias,
                },
                access: path.column_access(),
            }),
            FilterExpression::Parameter(parameter) => {
                match parameter {
                    Parameter::Number(number) => parameters.push(number),
                    Parameter::Text(text) => parameters.push(text),
                    Parameter::Boolean(bool) => parameters.push(bool),
                }
                // Indices in Postgres are 1-based
                Self::Parameter(parameters.len())
            }
        }
    }
}

impl Transpile for Expression<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Column(column) => column.transpile(fmt),
            Self::Parameter(index) => write!(fmt, "${index}"),
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
    use crate::store::postgres::query::{test_helper::transpile, DataTypeQueryField, Field};

    #[test]
    fn render_window_expression() {
        assert_eq!(
            transpile(&Expression::Window(
                Box::new(Expression::Function(Box::new(Function::Max(
                    Expression::Column(Column {
                        table: Table {
                            name: DataTypeQueryField::Version.table_name(),
                            alias: None,
                        },
                        access: DataTypeQueryField::Version.column_access(),
                    })
                )))),
                WindowStatement::partition_by(Column {
                    table: Table {
                        name: DataTypeQueryField::BaseUri.table_name(),
                        alias: None,
                    },
                    access: DataTypeQueryField::BaseUri.column_access(),
                })
            )),
            r#"MAX("type_ids"."version") OVER (PARTITION BY "type_ids"."base_uri")"#
        );
    }

    #[test]
    fn render_function_expression() {
        assert_eq!(
            transpile(&Expression::Function(Box::new(Function::Min(
                Expression::Column(Column {
                    table: Table {
                        name: DataTypeQueryField::Version.table_name(),
                        alias: None,
                    },
                    access: DataTypeQueryField::Version.column_access(),
                })
            )))),
            r#"MIN("type_ids"."version")"#
        );
    }
}
