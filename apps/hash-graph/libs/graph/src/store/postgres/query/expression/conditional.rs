use core::fmt::{
    Display, Formatter, Write, {self},
};

use crate::store::{
    postgres::query::{
        table::DatabaseColumn, Alias, AliasedTable, Column, SelectStatement, Table, Transpile,
        WindowStatement,
    },
    query::PathToken,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
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
    Lower(Box<Expression>),
    Upper(Box<Expression>),
    Unnest(Box<Expression>),
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
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
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

/// A compiled expression in Postgres.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Expression {
    Asterisk,
    Column(Column),
    ColumnReference {
        column: Column,
        table_alias: Option<Alias>,
    },
    TableReference {
        table: Table,
        alias: Option<Alias>,
    },
    /// A parameter are transpiled as a placeholder, e.g. `$1`, in order to prevent SQL injection.
    Parameter(usize),
    /// [`Constant`]s are directly transpiled into the SQL query. Caution has to be taken to
    /// prevent SQL injection and no user input should ever be used as a [`Constant`].
    Constant(Constant),
    Function(Function),
    CosineDistance(Box<Self>, Box<Self>),
    Window(Box<Self>, WindowStatement),
    Cast(Box<Self>, PostgresType),
    FieldAccess(Box<Self>, Box<Self>),
    Select(Box<SelectStatement>),
}

impl Transpile for Expression {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Asterisk => fmt.write_char('*'),
            Self::Column(column) => column.transpile(fmt),
            Self::ColumnReference {
                column,
                table_alias,
            } => {
                let table = column.table();
                if let Some(alias) = *table_alias {
                    AliasedTable { table, alias }.transpile(fmt)?;
                } else {
                    table.transpile(fmt)?;
                }
                write!(fmt, r#"."{}""#, column.as_str())
            }
            Self::TableReference { table, alias } => {
                if let Some(alias) = *alias {
                    AliasedTable {
                        table: *table,
                        alias,
                    }
                    .transpile(fmt)
                } else {
                    table.transpile(fmt)
                }
            }
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
            Self::FieldAccess(expression, subscript) => {
                expression.transpile(fmt)?;
                fmt.write_str(".")?;
                subscript.transpile(fmt)
            }
            Self::Select(select) => select.transpile(fmt),
        }
    }
}

pub struct Transpiler<'t, T>(pub &'t T);
impl<'t, T> Display for Transpiler<'t, T>
where
    T: Transpile,
{
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        self.0.transpile(fmt)
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
            Expression::Function(Function::Min(Box::new(Expression::ColumnReference {
                column: DataTypeQueryPath::Version.terminating_column().0,
                table_alias: Some(Alias {
                    condition_index: 1,
                    chain_depth: 2,
                    number: 3
                })
            })))
            .transpile_to_string(),
            r#"MIN("ontology_ids_1_2_3"."version")"#
        );
    }
}
