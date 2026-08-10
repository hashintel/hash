use core::fmt::{self, Write as _};

use hash_graph_store::query::{NullOrdering, Ordering};

use crate::store::postgres::query::{Expression, OrderByExpression, Transpile};

/// The `PARTITION BY` and `ORDER BY` clauses inside a window's `OVER (...)`.
///
/// Either clause may stand alone: `row_number() OVER (ORDER BY ...)` partitions nothing, and
/// `MAX(...) OVER (PARTITION BY ...)` orders nothing.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct WindowStatement {
    partition: Vec<Expression>,
    order: OrderByExpression,
}

impl WindowStatement {
    /// Creates a window partitioned by `expression`, without an ordering.
    #[must_use]
    pub fn partition_by(expression: impl Into<Expression>) -> Self {
        Self {
            partition: vec![expression.into()],
            order: OrderByExpression::default(),
        }
    }

    /// Creates a window ordered by `expression`, without a partition.
    #[must_use]
    pub fn order_by(
        expression: impl Into<Expression>,
        ordering: Ordering,
        nulls: Option<NullOrdering>,
    ) -> Self {
        let mut order = OrderByExpression::default();
        order.push(expression.into(), ordering, nulls);

        Self {
            partition: Vec::new(),
            order,
        }
    }

    /// Appends one more partition key to the window.
    #[must_use]
    pub fn then_partition_by(mut self, expression: impl Into<Expression>) -> Self {
        self.partition.push(expression.into());
        self
    }

    /// Appends one more ordering key to the window.
    #[must_use]
    pub fn then_order_by(
        mut self,
        expression: impl Into<Expression>,
        ordering: Ordering,
        nulls: Option<NullOrdering>,
    ) -> Self {
        self.order.push(expression.into(), ordering, nulls);
        self
    }
}

impl Transpile for WindowStatement {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        if !self.partition.is_empty() {
            fmt.write_str("PARTITION BY ")?;
            for (idx, partition) in self.partition.iter().enumerate() {
                partition.transpile(fmt)?;
                if idx + 1 < self.partition.len() {
                    fmt.write_str(", ")?;
                }
            }
        }

        if !self.order.is_empty() {
            if !self.partition.is_empty() {
                fmt.write_char(' ')?;
            }
            self.order.transpile(fmt)?;
        }

        Ok(())
    }
}
