use std::fmt;

use crate::store::postgres::query::{Column, Transpile};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Ordering {
    Ascending,
    Descending,
}

#[derive(Debug, Default, PartialEq, Eq, Hash)]
pub struct OrderByExpression<'q> {
    columns: Vec<(Column<'q>, Ordering)>,
}

impl<'q> OrderByExpression<'q> {
    pub fn push(&mut self, column: Column<'q>, ordering: Ordering) {
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
            column.transpile(fmt)?;
            match ordering {
                Ordering::Ascending => write!(fmt, " ASC")?,
                Ordering::Descending => write!(fmt, " DESC")?,
            }
            if idx + 1 < self.columns.len() {
                fmt.write_str(",\n         ")?;
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
        store::postgres::query::{test_helper::trim_whitespace, Path, Table},
    };

    #[test]
    fn order_one() {
        let mut order_by_expression = OrderByExpression::default();
        order_by_expression.push(
            Column {
                table: Table {
                    name: DataTypeQueryPath::Version.terminating_table_name(),
                    alias: None,
                },
                access: DataTypeQueryPath::Version.column_access(),
            },
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
            Column {
                table: Table {
                    name: DataTypeQueryPath::BaseUri.terminating_table_name(),
                    alias: None,
                },
                access: DataTypeQueryPath::BaseUri.column_access(),
            },
            Ordering::Ascending,
        );
        order_by_expression.push(
            Column {
                table: Table {
                    name: DataTypeQueryPath::Type.terminating_table_name(),
                    alias: None,
                },
                access: DataTypeQueryPath::Type.column_access(),
            },
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
