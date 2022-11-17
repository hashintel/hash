use std::fmt;

use crate::store::postgres::query::{AliasedColumn, Transpile};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Ordering {
    Ascending,
    Descending,
}

#[derive(Debug, Default, PartialEq, Eq, Hash)]
pub struct OrderByExpression<'q> {
    columns: Vec<(AliasedColumn<'q>, Ordering)>,
}

impl<'q> OrderByExpression<'q> {
    pub fn push(&mut self, column: AliasedColumn<'q>, ordering: Ordering) {
        self.columns.push((column, ordering));
    }

    pub fn is_empty(&self) -> bool {
        self.columns.is_empty()
    }
}

impl Transpile for OrderByExpression<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        if self.columns.is_empty() {
            return Ok(());
        }

        fmt.write_str("ORDER BY ")?;
        for (idx, (column, ordering)) in self.columns.iter().enumerate() {
            if idx > 0 {
                fmt.write_str(", ")?;
            }
            column.transpile(fmt)?;
            match ordering {
                Ordering::Ascending => write!(fmt, " ASC")?,
                Ordering::Descending => write!(fmt, " DESC")?,
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        ontology::DataTypeQueryPath,
        store::postgres::query::{test_helper::trim_whitespace, Path},
    };

    #[test]
    fn order_one() {
        let mut order_by_expression = OrderByExpression::default();
        order_by_expression.push(
            DataTypeQueryPath::Version
                .terminating_column()
                .aliased(None),
            Ordering::Ascending,
        );
        assert_eq!(
            order_by_expression.transpile_to_string(),
            r#"ORDER BY "type_ids"."version" ASC"#
        );
    }

    #[test]
    fn order_multiple() {
        let mut order_by_expression = OrderByExpression::default();
        order_by_expression.push(
            DataTypeQueryPath::BaseUri
                .terminating_column()
                .aliased(None),
            Ordering::Ascending,
        );
        order_by_expression.push(
            DataTypeQueryPath::Type.terminating_column().aliased(None),
            Ordering::Descending,
        );

        assert_eq!(
            trim_whitespace(order_by_expression.transpile_to_string()),
            trim_whitespace(
                r#"ORDER BY "type_ids"."base_uri" ASC,
                "data_types"."schema"->>'type' DESC"#
            )
        );
    }
}
