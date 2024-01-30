use std::fmt;

use crate::store::{
    postgres::query::{expression::conditional::Transpiler, Condition, Expression, Transpile},
    Ordering,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Nullability {
    LhsNullable,
    NotNullable,
}

#[derive(Debug, Default, PartialEq, Eq, Hash)]
pub struct WhereExpression {
    conditions: Vec<Condition>,
    cursor: Vec<(Expression, Option<Expression>, Ordering, Nullability)>,
}

impl WhereExpression {
    pub fn add_condition(&mut self, condition: Condition) {
        self.conditions.push(condition);
    }

    pub fn add_cursor(
        &mut self,
        lhs: Expression,
        rhs: Option<Expression>,
        ordering: Ordering,
        nullability: Nullability,
    ) {
        self.cursor.push((lhs, rhs, ordering, nullability));
    }

    pub fn len(&self) -> usize {
        self.conditions.len()
    }

    pub fn is_empty(&self) -> bool {
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
                                Ordering::AscendingNullsLast => '>',
                                Ordering::DescendingNullsFirst => '<',
                            },
                            Transpiler(rhs),
                        );

                        if *null == Nullability::LhsNullable
                            && *ordering == Ordering::AscendingNullsLast
                        {
                            // If the ordering is ascending, we need to check if the lhs is null as
                            // nulls are sorted last.
                            inner_statements.push(format!(
                                "({} OR {} IS NULL)",
                                statement,
                                Transpiler(lhs)
                            ));
                        } else {
                            inner_statements.push(statement);
                        }
                    } else {
                        match ordering {
                            Ordering::AscendingNullsLast => {
                                // If the cursor is `null` and the ordering is ascending, we need to
                                // skip this condition
                                inner_statements.clear();
                                break;
                            }
                            Ordering::DescendingNullsFirst => {
                                inner_statements.push(format!("{} IS NOT NULL", Transpiler(lhs)));
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
    use std::borrow::Cow;

    use graph_types::ontology::DataTypeWithMetadata;

    use super::*;
    use crate::{
        ontology::DataTypeQueryPath,
        store::{
            postgres::query::{test_helper::trim_whitespace, SelectCompiler},
            query::{Filter, FilterExpression, Parameter},
        },
        subgraph::temporal_axes::QueryTemporalAxesUnresolved,
    };

    #[test]
    fn transpile_where_expression() {
        let temporal_axes = QueryTemporalAxesUnresolved::default().resolve();
        let mut compiler = SelectCompiler::<DataTypeWithMetadata>::new(Some(&temporal_axes), false);
        let mut where_clause = WhereExpression::default();
        assert_eq!(where_clause.transpile_to_string(), "");

        let filter_a = Filter::Equal(
            Some(FilterExpression::Path(DataTypeQueryPath::Version)),
            Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                "latest",
            )))),
        );
        where_clause.add_condition(compiler.compile_filter(&filter_a));

        assert_eq!(
            where_clause.transpile_to_string(),
            r#"WHERE "ontology_ids_0_1_0"."version" = "ontology_ids_0_1_0"."latest_version""#
        );

        let filter_b = Filter::All(vec![
            Filter::Equal(
                Some(FilterExpression::Path(DataTypeQueryPath::BaseUrl)),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                )))),
            ),
            Filter::Equal(
                Some(FilterExpression::Path(DataTypeQueryPath::Version)),
                Some(FilterExpression::Parameter(Parameter::I32(1))),
            ),
        ]);
        where_clause.add_condition(compiler.compile_filter(&filter_b));

        assert_eq!(
            trim_whitespace(where_clause.transpile_to_string()),
            trim_whitespace(
                r#"
                WHERE "ontology_ids_0_1_0"."version" = "ontology_ids_0_1_0"."latest_version"
                  AND ("ontology_ids_0_1_0"."base_url" = $2) AND ("ontology_ids_0_1_0"."version" = $3)"#
            )
        );

        let filter_c = Filter::NotEqual(
            Some(FilterExpression::Path(DataTypeQueryPath::Description)),
            None,
        );
        where_clause.add_condition(compiler.compile_filter(&filter_c));

        assert_eq!(
            trim_whitespace(where_clause.transpile_to_string()),
            trim_whitespace(
                r#"
                WHERE "ontology_ids_0_1_0"."version" = "ontology_ids_0_1_0"."latest_version"
                  AND ("ontology_ids_0_1_0"."base_url" = $2) AND ("ontology_ids_0_1_0"."version" = $3)
                  AND "data_types_0_1_0"."schema"->>'description' IS NOT NULL"#
            )
        );

        let filter_d = Filter::Any(vec![
            Filter::Equal(
                Some(FilterExpression::Path(DataTypeQueryPath::Title)),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    "some title",
                )))),
            ),
            Filter::Equal(
                Some(FilterExpression::Path(DataTypeQueryPath::Description)),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    "some description",
                )))),
            ),
        ]);
        where_clause.add_condition(compiler.compile_filter(&filter_d));

        assert_eq!(
            trim_whitespace(where_clause.transpile_to_string()),
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
                "1",
                "\"some title\"",
                "\"some description\""
            ]
        );
    }
}
