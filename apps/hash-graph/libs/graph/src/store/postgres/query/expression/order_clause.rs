use std::fmt;

use crate::store::{
    postgres::query::{AliasedColumn, Transpile},
    NullOrdering, Ordering,
};

#[derive(Debug, Default, PartialEq, Eq, Hash)]
pub struct OrderByExpression {
    columns: Vec<(AliasedColumn, Ordering, Option<NullOrdering>)>,
}

impl OrderByExpression {
    pub fn push(&mut self, column: AliasedColumn, ordering: Ordering, nulls: Option<NullOrdering>) {
        self.columns.push((column, ordering, nulls));
    }

    pub fn insert_front(
        &mut self,
        column: AliasedColumn,
        ordering: Ordering,
        nulls: Option<NullOrdering>,
    ) {
        self.columns.insert(0, (column, ordering, nulls));
    }

    pub fn is_empty(&self) -> bool {
        self.columns.is_empty()
    }
}

impl Transpile for OrderByExpression {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        if self.columns.is_empty() {
            return Ok(());
        }

        fmt.write_str("ORDER BY ")?;
        for (idx, (column, ordering, nulls)) in self.columns.iter().enumerate() {
            if idx > 0 {
                fmt.write_str(", ")?;
            }
            column.transpile(fmt)?;
            match ordering {
                Ordering::Ascending => write!(fmt, " ASC")?,
                Ordering::Descending => write!(fmt, " DESC")?,
            }
            if let Some(nulls) = nulls {
                match nulls {
                    NullOrdering::First => write!(fmt, " NULLS FIRST")?,
                    NullOrdering::Last => write!(fmt, " NULLS LAST")?,
                }
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
            None,
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
            DataTypeQueryPath::BaseUrl
                .terminating_column()
                .aliased(Alias {
                    condition_index: 1,
                    chain_depth: 2,
                    number: 3,
                }),
            Ordering::Ascending,
            Some(NullOrdering::First),
        );
        order_by_expression.push(
            DataTypeQueryPath::Type.terminating_column().aliased(Alias {
                condition_index: 4,
                chain_depth: 5,
                number: 6,
            }),
            Ordering::Descending,
            Some(NullOrdering::Last),
        );

        assert_eq!(
            trim_whitespace(order_by_expression.transpile_to_string()),
            trim_whitespace(
                r#"ORDER BY "ontology_ids_1_2_3"."base_url" ASC NULLS FIRST,
                "data_types_4_5_6"."schema"->>'type' DESC NULLS LAST"#
            )
        );
    }
}
