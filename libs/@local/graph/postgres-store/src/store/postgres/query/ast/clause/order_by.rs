use core::fmt;

use crate::store::postgres::query::{Expression, NonEmptyVec, Transpile};

/// The direction of a [`SortBy`]: `ASC | DESC`.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum SortDirection {
    Ascending,
    Descending,
}

impl Transpile for SortDirection {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Ascending => fmt.write_str("ASC"),
            Self::Descending => fmt.write_str("DESC"),
        }
    }
}

/// Where a [`SortBy`] places `NULL` values: `NULLS { FIRST | LAST }`.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum NullsOrder {
    First,
    Last,
}

impl Transpile for NullsOrder {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::First => fmt.write_str("NULLS FIRST"),
            Self::Last => fmt.write_str("NULLS LAST"),
        }
    }
}

/// One `ORDER BY` key: `expression [ ASC | DESC ] [ NULLS { FIRST | LAST } ]` (gram.y:
/// `sortby`).
///
/// The `USING operator` form is not representable yet.
#[derive(Debug, Clone, PartialEq, bon::Builder)]
#[builder(derive(Debug, Clone, Into))]
pub struct SortBy {
    pub expression: Expression,
    pub direction: Option<SortDirection>,
    pub nulls: Option<NullsOrder>,
}

impl<S> From<SortByBuilder<S>> for NonEmptyVec<SortBy>
where
    S: sort_by_builder::IsComplete,
{
    fn from(builder: SortByBuilder<S>) -> Self {
        Self::from(builder.build())
    }
}

impl Transpile for SortBy {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        self.expression.transpile(fmt)?;
        if let Some(direction) = self.direction {
            fmt.write_str(" ")?;
            direction.transpile(fmt)?;
        }
        if let Some(nulls) = self.nulls {
            fmt.write_str(" ")?;
            nulls.transpile(fmt)?;
        }

        Ok(())
    }
}

/// `ORDER BY expression [ ... ] [, ...]`.
#[derive(Debug, Clone, PartialEq, bon::Builder)]
#[builder(derive(Debug, Clone, Into))]
pub struct OrderByClause {
    /// The `sortby` list of the clause.
    ///
    /// Accepts a single [`SortBy`] or a ready-made [`NonEmptyVec`]; parse a [`Vec`] beforehand
    /// via `NonEmptyVec::try_from`.
    #[builder(into)]
    pub sort_by: NonEmptyVec<SortBy>,
}

impl Transpile for OrderByClause {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        fmt.write_str("ORDER BY ")?;
        for (idx, sort_by) in self.sort_by.iter().enumerate() {
            if idx > 0 {
                fmt.write_str(", ")?;
            }
            sort_by.transpile(fmt)?;
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

    fn column(path: &DataTypeQueryPath, number: usize) -> Expression {
        Expression::ColumnReference(path.terminating_column().0.aliased(Alias {
            condition_index: 1,
            chain_depth: 2,
            number,
        }))
    }

    #[test]
    fn order_one() {
        let order_by_clause = OrderByClause::builder()
            .sort_by(
                SortBy::builder()
                    .expression(column(&DataTypeQueryPath::Version, 3))
                    .direction(SortDirection::Ascending),
            )
            .build();
        assert_eq!(
            order_by_clause.transpile_to_string(),
            r#"ORDER BY "ontology_ids_1_2_3"."version" ASC"#
        );
    }

    #[test]
    fn order_multiple() {
        let order_by_clause = OrderByClause::builder()
            .sort_by(
                NonEmptyVec::try_from(vec![
                    SortBy::builder()
                        .expression(column(&DataTypeQueryPath::BaseUrl, 3))
                        .direction(SortDirection::Ascending)
                        .nulls(NullsOrder::First)
                        .build(),
                    SortBy::builder()
                        .expression(column(&DataTypeQueryPath::Version, 6))
                        .direction(SortDirection::Descending)
                        .nulls(NullsOrder::Last)
                        .build(),
                ])
                .expect("two sort keys should form a valid `ORDER BY`"),
            )
            .build();

        assert_eq!(
            trim_whitespace(&order_by_clause.transpile_to_string()),
            trim_whitespace(
                r#"ORDER BY "ontology_ids_1_2_3"."base_url" ASC NULLS FIRST,
                "ontology_ids_1_2_6"."version" DESC NULLS LAST"#
            )
        );
    }

    #[test]
    fn bare_sort_by_omits_direction() {
        let order_by_clause = OrderByClause::builder()
            .sort_by(SortBy::builder().expression(column(&DataTypeQueryPath::Version, 3)))
            .build();
        assert_eq!(
            order_by_clause.transpile_to_string(),
            r#"ORDER BY "ontology_ids_1_2_3"."version""#
        );
    }
}
