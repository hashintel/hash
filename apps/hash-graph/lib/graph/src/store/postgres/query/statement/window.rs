use std::fmt;

use crate::store::postgres::query::{AliasedColumn, Expression, Transpile};

#[derive(Debug, PartialEq, Eq, Hash)]
pub struct WindowStatement {
    partition: Vec<Expression>,
}

impl WindowStatement {
    pub fn partition_by(column: AliasedColumn) -> Self {
        Self {
            partition: vec![Expression::Column(column)],
        }
    }
}

impl Transpile for WindowStatement {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        fmt.write_str("PARTITION BY ")?;
        for (idx, partition) in self.partition.iter().enumerate() {
            partition.transpile(fmt)?;
            if idx + 1 < self.partition.len() {
                fmt.write_str(", ")?;
            }
        }

        Ok(())
    }
}
