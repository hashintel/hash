use std::fmt::{self, Write};

use crate::store::postgres::query::{
    JoinExpression, SelectExpression, Table, Transpile, WhereExpression, WithExpression,
};

#[derive(Debug, PartialEq, Eq, Hash)]
pub struct SelectStatement<'q> {
    pub with: WithExpression<'q>,
    pub distinct: bool,
    pub selects: Vec<SelectExpression<'q>>,
    pub from: Table,
    pub joins: Vec<JoinExpression<'q>>,
    pub where_expression: WhereExpression<'q>,
}

impl Transpile for SelectStatement<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        if !self.with.is_empty() {
            self.with.transpile(fmt)?;
            fmt.write_char('\n')?;
        }

        fmt.write_str("SELECT ")?;

        if self.distinct {
            fmt.write_str("DISTINCT ")?;
        }

        for (idx, condition) in self.selects.iter().enumerate() {
            condition.transpile(fmt)?;
            if idx + 1 < self.selects.len() {
                fmt.write_str(", ")?;
            }
        }
        fmt.write_str("\nFROM ")?;
        self.from.transpile(fmt)?;

        for join in &self.joins {
            fmt.write_char('\n')?;
            join.transpile(fmt)?;
        }

        if !self.where_expression.is_empty() {
            fmt.write_char('\n')?;
            self.where_expression.transpile(fmt)?;
        }

        Ok(())
    }
}
