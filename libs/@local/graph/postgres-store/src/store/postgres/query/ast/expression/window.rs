use core::fmt;

use crate::store::postgres::query::{Expression, NonEmptyVec, Transpile};

/// A `window_definition` of an `OVER` clause.
///
/// Covers `PARTITION BY expression [, ...]` only; `existing_window_name`, the window-level
/// `ORDER BY` list, `frame_clause`, the statement-level `WINDOW` clause, `OVER window_name`,
/// and the empty definition (`OVER ()`) are not representable yet.
#[derive(Debug, Clone, PartialEq, bon::Builder)]
#[builder(derive(Debug, Clone, Into))]
pub struct WindowDefinition {
    /// The `PARTITION BY` expression list.
    ///
    /// Accepts a single [`Expression`] or a ready-made [`NonEmptyVec`]; parse a [`Vec`]
    /// beforehand via `NonEmptyVec::try_from`.
    #[builder(into)]
    pub partition_by: NonEmptyVec<Expression>,
}

impl Transpile for WindowDefinition {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        fmt.write_str("PARTITION BY ")?;
        for (idx, expression) in self.partition_by.iter().enumerate() {
            if idx > 0 {
                fmt.write_str(", ")?;
            }
            expression.transpile(fmt)?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use hash_graph_store::data_type::DataTypeQueryPath;

    use super::*;
    use crate::store::postgres::query::{Alias, PostgresQueryPath as _};

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
}
