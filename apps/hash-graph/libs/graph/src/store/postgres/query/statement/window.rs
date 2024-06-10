use core::fmt;

use crate::store::postgres::query::{Expression, Transpile};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct WindowStatement {
    partition: Vec<Expression>,
}

impl WindowStatement {
    pub fn partition_by(expression: Expression) -> Self {
        Self {
            partition: vec![expression],
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
