use core::{fmt, fmt::Formatter};

use postgres_types::ToSql;

use crate::store::postgres::query::{
    Alias, AliasedTable, Column, Expression, Function, OrderByExpression, SelectExpression,
    SelectStatement, Table, Transpile, WhereExpression, WithExpression,
    expression::{GroupByExpression, PostgresType},
    rows::PostgresRow,
    statement::FromItem,
};

#[derive(Debug, PartialEq, Eq, Hash)]
pub enum InsertValueItem {
    Default,
    Values(Vec<Expression>),
    Query(Box<SelectStatement>),
}

impl Transpile for InsertValueItem {
    fn transpile(&self, fmt: &mut Formatter) -> fmt::Result {
        match self {
            Self::Default => fmt.write_str(" DEFAULT VALUES"),
            Self::Values(values) => {
                fmt.write_str(" VALUES (\n    ")?;
                for (idx, value) in values.iter().enumerate() {
                    if idx > 0 {
                        fmt.write_str(",\n    ")?;
                    }
                    value.transpile(fmt)?;
                }
                fmt.write_str("\n)")
            }
            Self::Query(query) => {
                fmt.write_str("(\n    ")?;
                query.transpile(fmt)?;
                fmt.write_str("\n)")
            }
        }
    }
}

#[derive(Debug, PartialEq, Eq, Hash)]
pub struct InsertStatement {
    pub table: Table,
    pub alias: Option<Alias>,
    pub columns: Vec<Column>,
    pub values: InsertValueItem,
}

impl Transpile for InsertStatement {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        fmt.write_str("INSERT INTO ")?;
        self.table.transpile(fmt)?;

        if let Some(alias) = self.alias {
            fmt.write_str(" AS ")?;
            AliasedTable {
                table: self.table,
                alias,
            }
            .transpile(fmt)?;
        }

        if !self.columns.is_empty() {
            fmt.write_str(" (\n    ")?;
            for (idx, column) in self.columns.iter().enumerate() {
                if idx > 0 {
                    fmt.write_str(",\n    ")?;
                }
                column.transpile(fmt)?;
            }
            fmt.write_str("\n)")?;
        }

        self.values.transpile(fmt)
    }
}

pub struct InsertStatementBuilder<'p> {
    pub statement: InsertStatement,
    pub parameters: Vec<&'p (dyn ToSql + Sync)>,
}

struct SliceWrapper<'a, T>(&'a [T]);

impl<'p> InsertStatementBuilder<'p> {
    pub fn new(table: Table) -> Self {
        Self {
            statement: InsertStatement {
                table,
                alias: None,
                columns: Vec::new(),
                values: InsertValueItem::Values(Vec::new()),
            },
            parameters: Vec::new(),
        }
    }

    pub fn compile(self) -> (String, Vec<&'p (dyn ToSql + Sync)>) {
        (self.statement.transpile_to_string(), self.parameters)
    }

    pub fn with_expression(mut self, column: impl Into<Column>, expression: Expression) -> Self {
        self.add_expression(column, expression);
        self
    }

    pub fn add_expression(
        &mut self,
        column: impl Into<Column>,
        expression: Expression,
    ) -> &mut Self {
        self.statement.columns.push(column.into());
        // TODO: Use a builder which knows `values` at compile time
        let InsertValueItem::Values(values) = &mut self.statement.values else {
            unreachable!()
        };
        values.push(expression);
        self
    }

    pub fn with_value(mut self, column: impl Into<Column>, value: &'p (impl ToSql + Sync)) -> Self {
        self.add_value(column, value);
        self
    }

    pub fn add_value(
        &mut self,
        column: impl Into<Column>,
        value: &'p (impl ToSql + Sync),
    ) -> &mut Self {
        self.parameters.push(value);
        self.add_expression(column, Expression::Parameter(self.parameters.len()))
    }

    pub fn with_row(mut self, row: &'p (impl PostgresRow + Sync)) -> Self {
        self.add_row(row);
        self
    }

    pub fn add_row(&mut self, value: &'p (impl ToSql + Sync)) -> &mut Self {
        self.parameters.push(value);
        // TODO: Use a builder which knows `values` at compile time
        let InsertValueItem::Values(values) = &mut self.statement.values else {
            unreachable!()
        };
        values.push(Expression::FieldAccess(
            Box::new(Expression::Cast(
                Box::new(Expression::Parameter(self.parameters.len())),
                PostgresType::Row(self.statement.table),
            )),
            Box::new(Expression::Asterisk),
        ));
        self
    }

    pub fn from_rows<R>(table: Table, rows: &'p Vec<R>) -> Self
    where
        R: ToSql + Sync,
    {
        Self {
            statement: InsertStatement {
                table,
                alias: None,
                columns: vec![],
                values: InsertValueItem::Query(Box::new(SelectStatement {
                    with: WithExpression::default(),
                    distinct: vec![],
                    selects: vec![SelectExpression {
                        expression: Expression::Asterisk,
                        alias: None,
                    }],
                    from: FromItem::Function(Function::Unnest(Box::new(Expression::Cast(
                        Box::new(Expression::Parameter(1)),
                        PostgresType::Array(Box::new(PostgresType::Row(table))),
                    )))),
                    joins: vec![],
                    where_expression: WhereExpression::default(),
                    order_by_expression: OrderByExpression::default(),
                    group_by_expression: GroupByExpression::default(),
                    limit: None,
                })),
            },
            parameters: vec![rows],
        }
    }
}
