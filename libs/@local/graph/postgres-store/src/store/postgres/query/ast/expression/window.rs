use core::fmt::{self, Write as _};

use crate::store::postgres::query::{Expression, NonEmptyVec, OrderByClause, Transpile};

/// A `window_definition` of an `OVER` clause.
///
/// Covers `PARTITION BY expression [, ...]`, the window-level `ORDER BY` list, and the empty
/// definition (`OVER ()`); `existing_window_name`, `frame_clause`, the statement-level `WINDOW`
/// clause, and `OVER window_name` are not representable yet.
#[derive(Debug, Clone, PartialEq, bon::Builder)]
#[builder(derive(Debug, Clone, Into))]
pub struct WindowDefinition {
    /// The `PARTITION BY` expression list.
    ///
    /// Accepts a single [`Expression`] or a ready-made [`NonEmptyVec`]; parse a [`Vec`]
    /// beforehand via `NonEmptyVec::try_from`.
    #[builder(into)]
    pub partition_by: Option<NonEmptyVec<Expression>>,
    /// The window-level `ORDER BY` list, ordering rows within each partition.
    #[builder(into)]
    pub order_by: Option<OrderByClause>,
}

impl Transpile for WindowDefinition {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        if let Some(partition_by) = &self.partition_by {
            fmt.write_str("PARTITION BY ")?;
            for (idx, expression) in partition_by.iter().enumerate() {
                if idx > 0 {
                    fmt.write_str(", ")?;
                }
                expression.transpile(fmt)?;
            }
            if self.order_by.is_some() {
                fmt.write_char(' ')?;
            }
        }

        if let Some(order_by) = &self.order_by {
            order_by.transpile(fmt)?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use hash_graph_store::data_type::DataTypeQueryPath;

    use super::*;
    use crate::store::postgres::query::{Alias, PostgresQueryPath as _, SortBy, SortDirection};

    fn column(path: &DataTypeQueryPath) -> Expression {
        Expression::ColumnReference(path.terminating_column().0.aliased(Alias {
            condition_index: 0,
            chain_depth: 0,
            number: 0,
        }))
    }

    #[test]
    fn transpile_partition_by_list() {
        let window_definition = WindowDefinition::builder()
            .partition_by(
                NonEmptyVec::try_from(vec![
                    column(&DataTypeQueryPath::BaseUrl),
                    column(&DataTypeQueryPath::Version),
                ])
                .expect("two expressions should form a valid `PARTITION BY`"),
            )
            .build();

        assert_eq!(
            window_definition.transpile_to_string(),
            r#"PARTITION BY "ontology_ids_0_0_0"."base_url", "ontology_ids_0_0_0"."version""#
        );
    }

    #[test]
    fn transpile_order_by_only() {
        let window_definition = WindowDefinition::builder()
            .order_by(
                OrderByClause::builder().sort_by(
                    SortBy::builder()
                        .expression(column(&DataTypeQueryPath::Version))
                        .direction(SortDirection::Ascending),
                ),
            )
            .build();

        assert_eq!(
            window_definition.transpile_to_string(),
            r#"ORDER BY "ontology_ids_0_0_0"."version" ASC"#
        );
    }

    #[test]
    fn transpile_partition_by_with_order_by() {
        let window_definition = WindowDefinition::builder()
            .partition_by(column(&DataTypeQueryPath::BaseUrl))
            .order_by(
                OrderByClause::builder().sort_by(
                    SortBy::builder()
                        .expression(column(&DataTypeQueryPath::Version))
                        .direction(SortDirection::Descending),
                ),
            )
            .build();

        assert_eq!(
            window_definition.transpile_to_string(),
            r#"PARTITION BY "ontology_ids_0_0_0"."base_url" ORDER BY "ontology_ids_0_0_0"."version" DESC"#
        );
    }
}
