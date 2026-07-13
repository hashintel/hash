use core::fmt;

use crate::store::postgres::query::{Expression, Transpile};

#[derive(Debug, Clone, Default, PartialEq)]
pub struct GroupByClause {
    pub expressions: Vec<Expression>,
}

impl Transpile for GroupByClause {
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
    use hash_graph_store::entity::EntityQueryPath;

    use super::*;
    use crate::store::postgres::query::{Alias, PostgresQueryPath as _};

    #[test]
    fn order_one() {
        let order_by_clause = GroupByClause {
            expressions: vec![
                Expression::ColumnReference(EntityQueryPath::WebId.terminating_column().0.aliased(
                    Alias {
                        condition_index: 1,
                        chain_depth: 2,
                        number: 3,
                    },
                )),
                Expression::ColumnReference(EntityQueryPath::Uuid.terminating_column().0.aliased(
                    Alias {
                        condition_index: 4,
                        chain_depth: 5,
                        number: 6,
                    },
                )),
            ],
        };
        assert_eq!(
            order_by_clause.transpile_to_string(),
            r#"GROUP BY "entity_temporal_metadata_1_2_3"."web_id", "entity_temporal_metadata_4_5_6"."entity_uuid""#
        );
    }
}
