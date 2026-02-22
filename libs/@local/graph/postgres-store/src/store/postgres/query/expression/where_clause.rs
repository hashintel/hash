use core::fmt;

use hash_graph_store::query::{NullOrdering, Ordering};

use crate::store::postgres::query::{Expression, Transpile, expression::conditional::Transpiler};

#[derive(Debug, Clone, Default, PartialEq)]
pub struct WhereExpression {
    pub conditions: Vec<Expression>,
    pub cursor: Vec<(
        Expression,
        Option<Expression>,
        Ordering,
        Option<NullOrdering>,
    )>,
}

impl WhereExpression {
    pub fn add_condition(&mut self, condition: Expression) {
        self.conditions.push(condition);
    }

    pub fn add_cursor(
        &mut self,
        lhs: Expression,
        rhs: Option<Expression>,
        ordering: Ordering,
        null_location: Option<NullOrdering>,
    ) {
        self.cursor.push((lhs, rhs, ordering, null_location));
    }

    #[must_use]
    pub const fn len(&self) -> usize {
        self.conditions.len()
    }

    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.conditions.is_empty()
    }
}

impl Transpile for WhereExpression {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        if self.conditions.is_empty() && self.cursor.is_empty() {
            return Ok(());
        }
        fmt.write_str("WHERE ")?;

        for (idx, condition) in self.conditions.iter().enumerate() {
            if idx > 0 {
                fmt.write_str(" AND ")?;
            }
            condition.transpile(fmt)?;
        }

        let mut outer_statements = Vec::new();
        for current in (0..self.cursor.len()).rev() {
            let mut inner_statements = Vec::new();
            for (idx, (lhs, rhs, ordering, null)) in self.cursor.iter().enumerate() {
                if idx == current {
                    if let Some(rhs) = rhs {
                        let statement = format!(
                            "{} {} {}",
                            Transpiler(lhs),
                            match ordering {
                                Ordering::Ascending => '>',
                                Ordering::Descending => '<',
                            },
                            Transpiler(rhs),
                        );

                        match null {
                            None | Some(NullOrdering::First) => {
                                inner_statements.push(statement);
                            }
                            Some(NullOrdering::Last) => {
                                // If the ordering is ascending, we need to check if the lhs is null
                                // as nulls are sorted last.
                                inner_statements.push(format!(
                                    "({} OR {} IS NULL)",
                                    statement,
                                    Transpiler(lhs)
                                ));
                            }
                        }
                    } else {
                        match null {
                            None | Some(NullOrdering::First) => {
                                inner_statements.push(format!("{} IS NOT NULL", Transpiler(lhs)));
                            }
                            Some(NullOrdering::Last) => {
                                // If the cursor is `null` and the ordering is ascending, we need to
                                // skip this condition
                                inner_statements.clear();
                                break;
                            }
                        }
                    }

                    break;
                }

                if let Some(rhs) = rhs {
                    inner_statements.push(format!("{} = {}", Transpiler(lhs), Transpiler(rhs)));
                } else {
                    inner_statements.push(format!("{} IS NULL", Transpiler(lhs)));
                }
            }
            if !inner_statements.is_empty() {
                outer_statements.push(inner_statements.join(" AND "));
            }
        }
        if !outer_statements.is_empty() {
            write!(fmt, " AND (\n    {}\n)", outer_statements.join("\n OR "))?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use alloc::borrow::Cow;

    use hash_codec::numeric::Real;
    use hash_graph_store::{
        data_type::DataTypeQueryPath,
        filter::{Filter, FilterExpression, Parameter},
        subgraph::temporal_axes::QueryTemporalAxesUnresolved,
    };
    use type_system::ontology::DataTypeWithMetadata;

    use super::*;
    use crate::store::postgres::query::{SelectCompiler, test_helper::trim_whitespace};

    #[test]
    #[expect(clippy::too_many_lines)]
    fn transpile_where_expression() {
        let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
        let mut compiler = SelectCompiler::<DataTypeWithMetadata>::new(Some(&temporal_axes), false);
        let mut where_clause = WhereExpression::default();
        assert_eq!(where_clause.transpile_to_string(), "");

        let filter_a = Filter::Equal(
            FilterExpression::Path {
                path: DataTypeQueryPath::Version,
            },
            FilterExpression::Parameter {
                parameter: Parameter::Text(Cow::Borrowed("latest")),
                convert: None,
            },
        );
        where_clause.add_condition(
            compiler
                .compile_filter(&filter_a)
                .expect("Failed to compile filter"),
        );

        assert_eq!(
            where_clause.transpile_to_string(),
            r#"WHERE "ontology_ids_0_1_0"."version" = "ontology_ids_0_1_0"."latest_version""#
        );

        let filter_b = Filter::All(vec![
            Filter::Equal(
                FilterExpression::Path {
                    path: DataTypeQueryPath::BaseUrl,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Text(Cow::Borrowed(
                        "https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                    )),
                    convert: None,
                },
            ),
            Filter::Equal(
                FilterExpression::Path {
                    path: DataTypeQueryPath::Version,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Decimal(Real::from_natural(1, 1)),
                    convert: None,
                },
            ),
        ]);
        where_clause.add_condition(
            compiler
                .compile_filter(&filter_b)
                .expect("Failed to compile filter"),
        );

        assert_eq!(
            trim_whitespace(&where_clause.transpile_to_string()),
            trim_whitespace(
                r#"
                WHERE "ontology_ids_0_1_0"."version" = "ontology_ids_0_1_0"."latest_version"
                  AND ("ontology_ids_0_1_0"."base_url" = $2) AND ("ontology_ids_0_1_0"."version" = $3)"#
            )
        );

        let filter_c = Filter::Not(Box::new(Filter::Exists {
            path: DataTypeQueryPath::Description,
        }));
        where_clause.add_condition(
            compiler
                .compile_filter(&filter_c)
                .expect("Failed to compile filter"),
        );

        assert_eq!(
            trim_whitespace(&where_clause.transpile_to_string()),
            trim_whitespace(
                r#"
                WHERE "ontology_ids_0_1_0"."version" = "ontology_ids_0_1_0"."latest_version"
                  AND ("ontology_ids_0_1_0"."base_url" = $2) AND ("ontology_ids_0_1_0"."version" = $3)
                  AND "data_types_0_1_0"."schema"->>'description' IS NOT NULL"#
            )
        );

        let filter_d = Filter::Any(vec![
            Filter::Equal(
                FilterExpression::Path {
                    path: DataTypeQueryPath::Title,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Text(Cow::Borrowed("some title")),
                    convert: None,
                },
            ),
            Filter::Equal(
                FilterExpression::Path {
                    path: DataTypeQueryPath::Description,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Text(Cow::Borrowed("some description")),
                    convert: None,
                },
            ),
        ]);
        where_clause.add_condition(
            compiler
                .compile_filter(&filter_d)
                .expect("Failed to compile filter"),
        );

        assert_eq!(
            trim_whitespace(&where_clause.transpile_to_string()),
            trim_whitespace(
                r#"
                WHERE "ontology_ids_0_1_0"."version" = "ontology_ids_0_1_0"."latest_version"
                  AND ("ontology_ids_0_1_0"."base_url" = $2) AND ("ontology_ids_0_1_0"."version" = $3)
                  AND "data_types_0_1_0"."schema"->>'description' IS NOT NULL
                  AND (("data_types_0_1_0"."schema"->>'title' = $4) OR ("data_types_0_1_0"."schema"->>'description' = $5))"#
            )
        );

        let parameters = compiler
            .compile()
            .1
            .iter()
            .map(|parameter| format!("{parameter:?}"))
            .collect::<Vec<_>>();

        assert_eq!(
            parameters,
            &[
                format!("{:?}", temporal_axes.pinned_timestamp()).as_str(),
                "\"https://blockprotocol.org/@blockprotocol/types/data-type/text/\"",
                format!("{:?}", Real::from_natural(1, 1)).as_str(),
                "\"some title\"",
                "\"some description\""
            ]
        );
    }
}
