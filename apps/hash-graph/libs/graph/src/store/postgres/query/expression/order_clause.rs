use core::fmt;

use crate::store::{
    NullOrdering, Ordering,
    postgres::query::{Expression, Transpile},
};

#[derive(Debug, Clone, Default, PartialEq, Eq, Hash)]
pub struct OrderByExpression {
    columns: Vec<(Expression, Ordering, Option<NullOrdering>)>,
}

impl OrderByExpression {
    pub fn push(
        &mut self,
        expression: Expression,
        ordering: Ordering,
        nulls: Option<NullOrdering>,
    ) {
        self.columns.push((expression, ordering, nulls));
    }

    pub fn insert_front(
        &mut self,
        expression: Expression,
        ordering: Ordering,
        nulls: Option<NullOrdering>,
    ) {
        self.columns.insert(0, (expression, ordering, nulls));
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
    use hash_graph_store::data_type::DataTypeQueryPath;

    use super::*;
    use crate::store::postgres::query::{
        Alias, PostgresQueryPath as _, test_helper::trim_whitespace,
    };

    #[test]
    fn order_one() {
        let mut order_by_expression = OrderByExpression::default();
        order_by_expression.push(
            Expression::ColumnReference {
                column: DataTypeQueryPath::Version.terminating_column().0,
                table_alias: Some(Alias {
                    condition_index: 1,
                    chain_depth: 2,
                    number: 3,
                }),
            },
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
            Expression::ColumnReference {
                column: DataTypeQueryPath::BaseUrl.terminating_column().0,
                table_alias: Some(Alias {
                    condition_index: 1,
                    chain_depth: 2,
                    number: 3,
                }),
            },
            Ordering::Ascending,
            Some(NullOrdering::First),
        );
        order_by_expression.push(
            Expression::ColumnReference {
                column: DataTypeQueryPath::Version.terminating_column().0,
                table_alias: Some(Alias {
                    condition_index: 4,
                    chain_depth: 5,
                    number: 6,
                }),
            },
            Ordering::Descending,
            Some(NullOrdering::Last),
        );

        assert_eq!(
            trim_whitespace(order_by_expression.transpile_to_string()),
            trim_whitespace(
                r#"ORDER BY "ontology_ids_1_2_3"."base_url" ASC NULLS FIRST,
                "ontology_ids_4_5_6"."version" DESC NULLS LAST"#
            )
        );
    }
}
