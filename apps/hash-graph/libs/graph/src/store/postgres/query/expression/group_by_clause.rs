use core::fmt;

use crate::store::postgres::query::{Expression, Transpile};

#[derive(Debug, Clone, Default, PartialEq, Eq, Hash)]
pub struct GroupByExpression {
    pub expressions: Vec<Expression>,
}

impl Transpile for GroupByExpression {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        if self.expressions.is_empty() {
            return Ok(());
        }

        fmt.write_str("GROUP BY ")?;
        for (idx, column) in self.expressions.iter().enumerate() {
            if idx > 0 {
                fmt.write_str(", ")?;
            }
            column.transpile(fmt)?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        knowledge::EntityQueryPath,
        store::postgres::query::{Alias, PostgresQueryPath},
    };

    #[test]
    fn order_one() {
        let order_by_expression = GroupByExpression {
            expressions: vec![
                Expression::ColumnReference {
                    column: EntityQueryPath::OwnedById.terminating_column().0,
                    table_alias: Some(Alias {
                        condition_index: 1,
                        chain_depth: 2,
                        number: 3,
                    }),
                },
                Expression::ColumnReference {
                    column: EntityQueryPath::Uuid.terminating_column().0,
                    table_alias: Some(Alias {
                        condition_index: 4,
                        chain_depth: 5,
                        number: 6,
                    }),
                },
            ],
        };
        assert_eq!(
            order_by_expression.transpile_to_string(),
            r#"GROUP BY "entity_temporal_metadata_1_2_3"."web_id", "entity_temporal_metadata_4_5_6"."entity_uuid""#
        );
    }
}
