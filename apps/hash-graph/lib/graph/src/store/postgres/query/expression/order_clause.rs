use std::fmt;

use crate::store::postgres::query::{AliasedColumn, Transpile};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Ordering {
    Ascending,
    Descending,
}

#[derive(Debug, Default, PartialEq, Eq, Hash)]
pub struct OrderByExpression<'p> {
    columns: Vec<(AliasedColumn<'p>, Ordering)>,
}

impl<'p> OrderByExpression<'p> {
    pub fn push(&mut self, column: AliasedColumn<'p>, ordering: Ordering) {
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
        store::postgres::query::{test_helper::trim_whitespace, Alias, PostgresQueryPath},
    };

    #[test]
    fn order_one() {
        let mut order_by_expression = OrderByExpression::default();
        order_by_expression.push(
            DataTypeQueryPath::Version
                .terminating_column()
                .aliased(Alias {
                    condition_index: 1,
                    chain_depth: 2,
                    number: 3,
                }),
            Ordering::Ascending,
        );
        assert_eq!(
            order_by_expression.transpile_to_string(),
            r#"ORDER BY "ontology_ids_1_2_3"."version" ASC"#
        );
    }

    #[test]
    fn order_multiple() {
        let mut order_by_expression = OrderByExpression::default();
        order_by_expression.push(
            DataTypeQueryPath::BaseUri
                .terminating_column()
                .aliased(Alias {
                    condition_index: 1,
                    chain_depth: 2,
                    number: 3,
                }),
            Ordering::Ascending,
        );
        order_by_expression.push(
            DataTypeQueryPath::Type.terminating_column().aliased(Alias {
                condition_index: 4,
                chain_depth: 5,
                number: 6,
            }),
            Ordering::Descending,
        );

        assert_eq!(
            trim_whitespace(order_by_expression.transpile_to_string()),
            trim_whitespace(
                r#"ORDER BY "ontology_ids_1_2_3"."base_uri" ASC,
                "data_types_4_5_6"."schema"->>'type' DESC"#
            )
        );
    }
}
