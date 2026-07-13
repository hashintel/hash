use core::fmt::{self, Write as _};

use crate::store::postgres::query::{
    Expression, FromItem, GroupByExpression, OrderByExpression, SelectExpression, Transpile,
    WhereExpression, WithExpression,
};

#[derive(Debug, Clone, PartialEq, bon::Builder)]
#[builder(derive(Debug, Clone, Into))]
pub struct SelectStatement {
    #[builder(default)]
    pub with: WithExpression,
    #[builder(default)]
    pub distinct: Vec<Expression>,
    pub selects: Vec<SelectExpression>,
    #[builder(into)]
    pub from: Option<FromItem<'static>>,
    #[builder(default)]
    pub where_expression: WhereExpression,
    #[builder(default)]
    pub order_by_expression: OrderByExpression,
    #[builder(default)]
    pub group_by_expression: GroupByExpression,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Distinctness {
    Indistinct,
    Distinct,
}

impl Transpile for SelectStatement {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        if !self.with.is_empty() {
            self.with.transpile(fmt)?;
            fmt.write_char('\n')?;
        }

        fmt.write_str("SELECT ")?;

        if !self.distinct.is_empty() {
            fmt.write_str("DISTINCT ON(")?;

            for (idx, column) in self.distinct.iter().enumerate() {
                if idx > 0 {
                    fmt.write_str(", ")?;
                }
                column.transpile(fmt)?;
            }
            fmt.write_str(") ")?;
        }

        for (idx, condition) in self.selects.iter().enumerate() {
            if idx > 0 {
                fmt.write_str(", ")?;
            }
            condition.transpile(fmt)?;
        }
        if let Some(from) = &self.from {
            fmt.write_str("\nFROM ")?;
            from.transpile(fmt)?;
        }

        if !self.where_expression.is_empty() {
            fmt.write_char('\n')?;
            self.where_expression.transpile(fmt)?;
        }

        if !self.order_by_expression.is_empty() {
            fmt.write_char('\n')?;
            self.order_by_expression.transpile(fmt)?;
        }

        if !self.group_by_expression.expressions.is_empty() {
            fmt.write_char('\n')?;
            self.group_by_expression.transpile(fmt)?;
        }

        if let Some(limit) = self.limit {
            fmt.write_char('\n')?;
            write!(fmt, "LIMIT {limit}")?;
        }

        if let Some(offset) = self.offset {
            fmt.write_char('\n')?;
            write!(fmt, "OFFSET {offset}")?;
        }

        Ok(())
    }
}
