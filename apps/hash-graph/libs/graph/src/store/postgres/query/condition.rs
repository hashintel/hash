use std::{fmt, fmt::Write};

use crate::store::postgres::query::{Expression, Transpile};

/// A [`Filter`], which can be transpiled.
///
/// [`Filter`]: crate::store::query::Filter
#[derive(Debug, PartialEq, Eq, Hash)]
pub enum Condition {
    All(Vec<Self>),
    Any(Vec<Self>),
    Not(Box<Self>),
    Equal(Option<Expression>, Option<Expression>),
    NotEqual(Option<Expression>, Option<Expression>),
    Less(Expression, Expression),
    LessOrEqual(Expression, Expression),
    Greater(Expression, Expression),
    GreaterOrEqual(Expression, Expression),
    CosineDistance(Expression, Expression, Expression),
    In(Expression, Expression),
    TimeIntervalContainsTimestamp(Expression, Expression),
    Overlap(Expression, Expression),
    StartsWith(Expression, Expression),
    EndsWith(Expression, Expression),
    ContainsSegment(Expression, Expression),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EqualityOperator {
    Equal,
    NotEqual,
}

impl Transpile for Condition {
    #[expect(clippy::too_many_lines)]
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::All(conditions) if conditions.is_empty() => fmt.write_str("TRUE"),
            Self::Any(conditions) if conditions.is_empty() => fmt.write_str("FALSE"),
            Self::All(conditions) => {
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
            Self::Any(conditions) => {
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
            Self::Not(condition) => {
                fmt.write_str("NOT(")?;
                condition.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::Equal(value, None) | Self::Equal(None, value) => {
                value.transpile(fmt)?;
                fmt.write_str(" IS NULL")
            }
            Self::Equal(lhs, rhs) => {
                lhs.transpile(fmt)?;
                fmt.write_str(" = ")?;
                rhs.transpile(fmt)
            }
            Self::NotEqual(value, None) | Self::NotEqual(None, value) => {
                value.transpile(fmt)?;
                fmt.write_str(" IS NOT NULL")
            }
            Self::NotEqual(lhs, rhs) => {
                lhs.transpile(fmt)?;
                fmt.write_str(" != ")?;
                rhs.transpile(fmt)
            }
            Self::CosineDistance(lhs, rhs, max) => {
                fmt.write_char('(')?;
                lhs.transpile(fmt)?;
                fmt.write_str(" <=> ")?;
                rhs.transpile(fmt)?;
                fmt.write_str(" <= ")?;
                max.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::Less(lhs, rhs) => {
                lhs.transpile(fmt)?;
                fmt.write_str(" < ")?;
                rhs.transpile(fmt)
            }
            Self::LessOrEqual(lhs, rhs) => {
                lhs.transpile(fmt)?;
                fmt.write_str(" <= ")?;
                rhs.transpile(fmt)
            }
            Self::Greater(lhs, rhs) => {
                lhs.transpile(fmt)?;
                fmt.write_str(" > ")?;
                rhs.transpile(fmt)
            }
            Self::GreaterOrEqual(lhs, rhs) => {
                lhs.transpile(fmt)?;
                fmt.write_str(" >= ")?;
                rhs.transpile(fmt)
            }
            Self::In(lhs, rhs) => {
                lhs.transpile(fmt)?;
                fmt.write_str(" = ANY(")?;
                rhs.transpile(fmt)?;
                fmt.write_char(')')
            }
            Self::TimeIntervalContainsTimestamp(lhs, rhs) => {
                lhs.transpile(fmt)?;
                fmt.write_str(" @> ")?;
                rhs.transpile(fmt)?;
                fmt.write_str("::TIMESTAMPTZ")
            }
            Self::Overlap(lhs, rhs) => {
                lhs.transpile(fmt)?;
                fmt.write_str(" && ")?;
                rhs.transpile(fmt)
            }
            Self::StartsWith(lhs, rhs) => {
                lhs.transpile(fmt)?;
                fmt.write_str(" LIKE ")?;
                rhs.transpile(fmt)?;
                fmt.write_str(" || '%'")
            }
            Self::EndsWith(lhs, rhs) => {
                lhs.transpile(fmt)?;
                fmt.write_str(" LIKE '%' || ")?;
                rhs.transpile(fmt)
            }
            Self::ContainsSegment(lhs, rhs) => {
                lhs.transpile(fmt)?;
                fmt.write_str(" LIKE '%' || ")?;
                rhs.transpile(fmt)?;
                fmt.write_str(" || '%'")
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::borrow::Cow;

    use graph_types::ontology::DataTypeWithMetadata;
    use postgres_types::ToSql;

    use crate::{
        ontology::DataTypeQueryPath,
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
        let mut compiler = SelectCompiler::new(None, false);
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
            r#""data_types_0_1_0"."schema"->>'description' IS NULL"#,
            &[],
        );

        test_condition(
            &Filter::Equal(
                None,
                Some(FilterExpression::Path(DataTypeQueryPath::Description)),
            ),
            r#""data_types_0_1_0"."schema"->>'description' IS NULL"#,
            &[],
        );

        test_condition(&Filter::Equal(None, None), "NULL IS NULL", &[]);

        test_condition(
            &Filter::NotEqual(
                Some(FilterExpression::Path(DataTypeQueryPath::Description)),
                None,
            ),
            r#""data_types_0_1_0"."schema"->>'description' IS NOT NULL"#,
            &[],
        );

        test_condition(
            &Filter::NotEqual(
                None,
                Some(FilterExpression::Path(DataTypeQueryPath::Description)),
            ),
            r#""data_types_0_1_0"."schema"->>'description' IS NOT NULL"#,
            &[],
        );

        test_condition(&Filter::NotEqual(None, None), "NULL IS NOT NULL", &[]);
    }

    #[test]
    fn transpile_all_condition() {
        test_condition(
            &Filter::All(vec![Filter::Equal(
                Some(FilterExpression::Path(DataTypeQueryPath::VersionedUrl)),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                )))),
            )]),
            r#"("data_types_0_1_0"."schema"->>'$id' = $1)"#,
            &[&"https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1"],
        );

        test_condition(
            &Filter::All(vec![
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
            ]),
            r#"("ontology_ids_0_1_0"."base_url" = $1) AND ("ontology_ids_0_1_0"."version" = $2)"#,
            &[
                &"https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                &1,
            ],
        );
    }

    #[test]
    fn transpile_any_condition() {
        test_condition(
            &Filter::Any(vec![Filter::Equal(
                Some(FilterExpression::Path(DataTypeQueryPath::VersionedUrl)),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                )))),
            )]),
            r#"("data_types_0_1_0"."schema"->>'$id' = $1)"#,
            &[&"https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1"],
        );

        test_condition(
            &Filter::Any(vec![
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
            ]),
            r#"(("ontology_ids_0_1_0"."base_url" = $1) OR ("ontology_ids_0_1_0"."version" = $2))"#,
            &[
                &"https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                &1,
            ],
        );
    }

    #[test]
    fn transpile_not_condition() {
        test_condition(
            &Filter::Not(Box::new(Filter::Equal(
                Some(FilterExpression::Path(DataTypeQueryPath::VersionedUrl)),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                )))),
            ))),
            r#"NOT("data_types_0_1_0"."schema"->>'$id' = $1)"#,
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
            r#"("data_types_0_1_0"."schema"->>'description' = "data_types_0_1_0"."schema"->>'title')"#,
            &[],
        );
    }
}
