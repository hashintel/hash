use std::{fmt, fmt::Write};

use crate::store::postgres::query::{Expression, Transpile};

/// A [`Filter`], which can be transpiled.
///
/// [`Filter`]: crate::store::query::Filter
#[derive(Debug, PartialEq, Eq, Hash)]
pub enum Condition<'p> {
    All(Vec<Self>),
    Any(Vec<Self>),
    Not(Box<Self>),
    Equal(Option<Expression<'p>>, Option<Expression<'p>>),
    NotEqual(Option<Expression<'p>>, Option<Expression<'p>>),
    TimeIntervalContainsTimestamp(Expression<'p>, Expression<'p>),
    Overlap(Expression<'p>, Expression<'p>),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EqualityOperator {
    Equal,
    NotEqual,
}

impl Transpile for Condition<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Condition::All(conditions) if conditions.is_empty() => fmt.write_str("TRUE"),
            Condition::Any(conditions) if conditions.is_empty() => fmt.write_str("FALSE"),
            Condition::All(conditions) => {
                for (idx, condition) in conditions.iter().enumerate() {
                    if idx > 0 {
                        fmt.write_str(" AND ")?;
                    }
                    fmt.write_char('(')?;
                    condition.transpile(fmt)?;
                    fmt.write_char(')')?;
                }
                Ok(())
            }
            Condition::Any(conditions) => {
                if conditions.len() > 1 {
                    fmt.write_char('(')?;
                }
                for (idx, condition) in conditions.iter().enumerate() {
                    if idx > 0 {
                        fmt.write_str(" OR ")?;
                    }
                    fmt.write_char('(')?;
                    condition.transpile(fmt)?;
                    fmt.write_char(')')?;
                }
                if conditions.len() > 1 {
                    fmt.write_char(')')?;
                }
                Ok(())
            }
            Condition::Not(condition) => {
                fmt.write_str("NOT(")?;
                condition.transpile(fmt)?;
                fmt.write_char(')')
            }
            Condition::Equal(value, None) | Condition::Equal(None, value) => {
                value.transpile(fmt)?;
                fmt.write_str(" IS NULL")
            }
            Condition::Equal(lhs, rhs) => {
                lhs.transpile(fmt)?;
                fmt.write_str(" = ")?;
                rhs.transpile(fmt)
            }
            Condition::NotEqual(value, None) | Condition::NotEqual(None, value) => {
                value.transpile(fmt)?;
                fmt.write_str(" IS NOT NULL")
            }
            Condition::NotEqual(lhs, rhs) => {
                lhs.transpile(fmt)?;
                fmt.write_str(" != ")?;
                rhs.transpile(fmt)
            }
            Condition::TimeIntervalContainsTimestamp(lhs, rhs) => {
                lhs.transpile(fmt)?;
                fmt.write_str(" @> ")?;
                rhs.transpile(fmt)?;
                fmt.write_str("::TIMESTAMPTZ")
            }
            Condition::Overlap(lhs, rhs) => {
                lhs.transpile(fmt)?;
                fmt.write_str(" && ")?;
                rhs.transpile(fmt)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::borrow::Cow;

    use postgres_types::ToSql;

    use crate::{
        identifier::time::UnresolvedTemporalAxes,
        ontology::{DataTypeQueryPath, DataTypeWithMetadata},
        store::{
            postgres::query::{SelectCompiler, Transpile},
            query::{Filter, FilterExpression, Parameter},
        },
    };

    fn test_condition<'p, 'f: 'p>(
        filter: &'f Filter<'p, DataTypeWithMetadata>,
        rendered: &'static str,
        parameters: &[&'p dyn ToSql],
    ) {
        let time_projection = UnresolvedTemporalAxes::default().resolve();
        let mut compiler = SelectCompiler::new(&time_projection);
        let condition = compiler.compile_filter(filter);

        assert_eq!(condition.transpile_to_string(), rendered);

        let parameter_list = parameters
            .iter()
            .map(|parameter| format!("{parameter:?}"))
            .collect::<Vec<_>>();
        let expected_parameters = compiler
            .compile()
            .1
            .iter()
            .map(|parameter| format!("{parameter:?}"))
            .collect::<Vec<_>>();

        assert_eq!(parameter_list, expected_parameters);
    }

    #[test]
    fn transpile_empty_condition() {
        test_condition(&Filter::All(vec![]), "TRUE", &[]);
        test_condition(&Filter::Any(vec![]), "FALSE", &[]);
    }

    #[test]
    fn transpile_null_condition() {
        test_condition(
            &Filter::Equal(
                Some(FilterExpression::Path(DataTypeQueryPath::Description)),
                None,
            ),
            r#""data_types_0_0_0"."schema"->>'description' IS NULL"#,
            &[],
        );

        test_condition(
            &Filter::Equal(
                None,
                Some(FilterExpression::Path(DataTypeQueryPath::Description)),
            ),
            r#""data_types_0_0_0"."schema"->>'description' IS NULL"#,
            &[],
        );

        test_condition(&Filter::Equal(None, None), "NULL IS NULL", &[]);

        test_condition(
            &Filter::NotEqual(
                Some(FilterExpression::Path(DataTypeQueryPath::Description)),
                None,
            ),
            r#""data_types_0_0_0"."schema"->>'description' IS NOT NULL"#,
            &[],
        );

        test_condition(
            &Filter::NotEqual(
                None,
                Some(FilterExpression::Path(DataTypeQueryPath::Description)),
            ),
            r#""data_types_0_0_0"."schema"->>'description' IS NOT NULL"#,
            &[],
        );

        test_condition(&Filter::NotEqual(None, None), "NULL IS NOT NULL", &[]);
    }

    #[test]
    fn transpile_all_condition() {
        test_condition(
            &Filter::All(vec![Filter::Equal(
                Some(FilterExpression::Path(DataTypeQueryPath::VersionedUri)),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                )))),
            )]),
            r#"("data_types_0_0_0"."schema"->>'$id' = $1)"#,
            &[&"https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1"],
        );

        test_condition(
            &Filter::All(vec![
                Filter::Equal(
                    Some(FilterExpression::Path(DataTypeQueryPath::BaseUri)),
                    Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                        "https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                    )))),
                ),
                Filter::Equal(
                    Some(FilterExpression::Path(DataTypeQueryPath::Version)),
                    Some(FilterExpression::Parameter(Parameter::Number(1.0))),
                ),
            ]),
            r#"("ontology_id_with_metadata_0_1_0"."base_uri" = $1) AND ("ontology_id_with_metadata_0_1_0"."version" = $2)"#,
            &[
                &"https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                &1.0,
            ],
        );
    }

    #[test]
    fn transpile_any_condition() {
        test_condition(
            &Filter::Any(vec![Filter::Equal(
                Some(FilterExpression::Path(DataTypeQueryPath::VersionedUri)),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                )))),
            )]),
            r#"("data_types_0_0_0"."schema"->>'$id' = $1)"#,
            &[&"https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1"],
        );

        test_condition(
            &Filter::Any(vec![
                Filter::Equal(
                    Some(FilterExpression::Path(DataTypeQueryPath::BaseUri)),
                    Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                        "https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                    )))),
                ),
                Filter::Equal(
                    Some(FilterExpression::Path(DataTypeQueryPath::Version)),
                    Some(FilterExpression::Parameter(Parameter::Number(1.0))),
                ),
            ]),
            r#"(("ontology_id_with_metadata_0_1_0"."base_uri" = $1) OR ("ontology_id_with_metadata_0_1_0"."version" = $2))"#,
            &[
                &"https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                &1.0,
            ],
        );
    }

    #[test]
    fn transpile_not_condition() {
        test_condition(
            &Filter::Not(Box::new(Filter::Equal(
                Some(FilterExpression::Path(DataTypeQueryPath::VersionedUri)),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                )))),
            ))),
            r#"NOT("data_types_0_0_0"."schema"->>'$id' = $1)"#,
            &[&"https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1"],
        );
    }

    #[test]
    fn render_without_parameters() {
        test_condition(
            &Filter::Any(vec![Filter::Equal(
                Some(FilterExpression::Path(DataTypeQueryPath::Description)),
                Some(FilterExpression::Path(DataTypeQueryPath::Title)),
            )]),
            r#"("data_types_0_0_0"."schema"->>'description' = "data_types_0_0_0"."schema"->>'title')"#,
            &[],
        );
    }
}
