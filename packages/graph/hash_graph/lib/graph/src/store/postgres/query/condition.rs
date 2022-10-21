use std::{fmt, fmt::Write};

use postgres_types::ToSql;

use crate::store::{
    postgres::query::{Expression, PostgresQueryRecord, TableAlias, Transpile},
    query::Filter,
};

/// A [`Filter`], which can be transpiled.
#[derive(Debug, PartialEq, Eq, Hash)]
pub enum Condition<'q> {
    All(Vec<Self>),
    Any(Vec<Self>),
    Not(Box<Self>),
    Equal(Option<Expression<'q>>, Option<Expression<'q>>),
    NotEqual(Option<Expression<'q>>, Option<Expression<'q>>),
}

impl<'q> Condition<'q> {
    /// Compiles a [`Filter`] to a `Condition`.
    ///
    /// In addition to the provided [`Filter`], a list of parameters needs to be passed, which will
    /// be populated from [`FilterExpression::Parameter`]. Also, [`TableAlias`] is used to populate
    /// `alias` inside of [`Expression::Column`].
    ///
    /// [`FilterExpression::Parameter`]: crate::store::query::FilterExpression
    pub fn from_filter<'f: 'q, T: PostgresQueryRecord<'q>>(
        filter: &'f Filter<'q, T>,
        parameters: &mut Vec<&'f dyn ToSql>,
        alias: Option<TableAlias>,
    ) -> Self {
        match filter {
            Filter::All(filters) => Self::All(
                filters
                    .iter()
                    .map(|filter| Self::from_filter(filter, parameters, alias))
                    .collect(),
            ),
            Filter::Any(filters) => Self::Any(
                filters
                    .iter()
                    .map(|filter| Self::from_filter(filter, parameters, alias))
                    .collect(),
            ),
            Filter::Not(filter) => {
                Self::Not(Box::new(Self::from_filter(filter, parameters, alias)))
            }
            Filter::Equal(lhs, rhs) => Self::Equal(
                lhs.as_ref()
                    .map(|value| Expression::from_filter_value(value, parameters, alias)),
                rhs.as_ref()
                    .map(|value| Expression::from_filter_value(value, parameters, alias)),
            ),
            Filter::NotEqual(lhs, rhs) => Self::NotEqual(
                lhs.as_ref()
                    .map(|value| Expression::from_filter_value(value, parameters, alias)),
                rhs.as_ref()
                    .map(|value| Expression::from_filter_value(value, parameters, alias)),
            ),
        }
    }
}

impl Transpile for Condition<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Condition::All(conditions) if conditions.is_empty() => fmt.write_str("TRUE"),
            Condition::Any(conditions) if conditions.is_empty() => fmt.write_str("FALSE"),
            Condition::All(conditions) => {
                for (idx, condition) in conditions.iter().enumerate() {
                    fmt.write_char('(')?;
                    condition.transpile(fmt)?;
                    fmt.write_char(')')?;
                    if idx + 1 < conditions.len() {
                        fmt.write_str(" AND ")?;
                    }
                }
                Ok(())
            }
            Condition::Any(conditions) => {
                if conditions.len() > 1 {
                    fmt.write_char('(')?;
                }
                for (idx, condition) in conditions.iter().enumerate() {
                    fmt.write_char('(')?;
                    condition.transpile(fmt)?;
                    fmt.write_char(')')?;
                    if idx + 1 < conditions.len() {
                        fmt.write_str(" OR ")?;
                    }
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
        }
    }
}

#[cfg(test)]
mod tests {
    use std::borrow::Cow;

    use type_system::DataType;

    use super::*;
    use crate::{
        ontology::DataTypeQueryPath,
        store::{
            postgres::query::test_helper::transpile,
            query::{FilterExpression, Parameter},
        },
    };

    fn test_condition<'q, 'f: 'q>(
        filter: &'f Filter<'q, DataType>,
        rendered: &'static str,
        parameters: &[&'q dyn ToSql],
    ) {
        let mut parameter_list = Vec::new();
        let condition = Condition::from_filter(filter, &mut parameter_list, None);

        assert_eq!(transpile(&condition), rendered);

        let parameter_list = parameter_list
            .into_iter()
            .map(|parameter| format!("{parameter:?}"))
            .collect::<Vec<_>>();
        let expected_parameters = parameters
            .iter()
            .map(|parameter| format!("{parameter:?}"))
            .collect::<Vec<_>>();
        assert_eq!(parameter_list, expected_parameters);
    }

    #[test]
    fn render_empty_condition() {
        test_condition(&Filter::All(vec![]), "TRUE", &[]);
        test_condition(&Filter::Any(vec![]), "FALSE", &[]);
    }

    #[test]
    fn render_null_condition() {
        test_condition(
            &Filter::Equal(
                Some(FilterExpression::Path(DataTypeQueryPath::Description)),
                None,
            ),
            r#""data_types"."schema"->>'description' IS NULL"#,
            &[],
        );

        test_condition(
            &Filter::Equal(
                None,
                Some(FilterExpression::Path(DataTypeQueryPath::Description)),
            ),
            r#""data_types"."schema"->>'description' IS NULL"#,
            &[],
        );

        test_condition(&Filter::Equal(None, None), "NULL IS NULL", &[]);

        test_condition(
            &Filter::NotEqual(
                Some(FilterExpression::Path(DataTypeQueryPath::Description)),
                None,
            ),
            r#""data_types"."schema"->>'description' IS NOT NULL"#,
            &[],
        );

        test_condition(
            &Filter::NotEqual(
                None,
                Some(FilterExpression::Path(DataTypeQueryPath::Description)),
            ),
            r#""data_types"."schema"->>'description' IS NOT NULL"#,
            &[],
        );

        test_condition(&Filter::NotEqual(None, None), "NULL IS NOT NULL", &[]);
    }

    #[test]
    fn render_all_condition() {
        test_condition(
            &Filter::All(vec![Filter::Equal(
                Some(FilterExpression::Path(DataTypeQueryPath::VersionedUri)),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                )))),
            )]),
            r#"("data_types"."schema"->>'$id' = $1)"#,
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
            r#"("type_ids"."base_uri" = $1) AND ("type_ids"."version" = $2)"#,
            &[
                &"https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                &1.0,
            ],
        );
    }

    #[test]
    fn render_any_condition() {
        test_condition(
            &Filter::Any(vec![Filter::Equal(
                Some(FilterExpression::Path(DataTypeQueryPath::VersionedUri)),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                )))),
            )]),
            r#"("data_types"."schema"->>'$id' = $1)"#,
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
            r#"(("type_ids"."base_uri" = $1) OR ("type_ids"."version" = $2))"#,
            &[
                &"https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                &1.0,
            ],
        );
    }

    #[test]
    fn render_not_condition() {
        test_condition(
            &Filter::Not(Box::new(Filter::Equal(
                Some(FilterExpression::Path(DataTypeQueryPath::VersionedUri)),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                )))),
            ))),
            r#"NOT("data_types"."schema"->>'$id' = $1)"#,
            &[&"https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1"],
        );
    }

    #[test]
    fn render_without_parameters() {
        test_condition(
            &Filter::Any(vec![Filter::Equal(
                Some(FilterExpression::Path(DataTypeQueryPath::Custom(
                    Cow::Borrowed("left"),
                ))),
                Some(FilterExpression::Path(DataTypeQueryPath::Custom(
                    Cow::Borrowed("right"),
                ))),
            )]),
            r#"("data_types"."schema"->>'left' = "data_types"."schema"->>'right')"#,
            &[],
        );
    }
}
