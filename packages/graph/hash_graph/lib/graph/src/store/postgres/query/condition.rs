use std::{fmt, fmt::Write};

use postgres_types::ToSql;

use crate::store::{
    postgres::query::{
        database::{Column, Table, TableAlias},
        Path, Transpile,
    },
    query::{Filter, FilterValue, Parameter, QueryRecord},
};

/// A [`Filter`] compiled to postgres.
pub enum Condition<'q> {
    All(Vec<Self>),
    Any(Vec<Self>),
    Not(Box<Self>),
    Equal(Option<ConditionValue<'q>>, Option<ConditionValue<'q>>),
    NotEqual(Option<ConditionValue<'q>>, Option<ConditionValue<'q>>),
}

impl<'q> Condition<'q> {
    /// Compiles a [`Filter`] to a `Condition`.
    ///
    /// In addition to the provided [`Filter`], a list of parameters needs to be passed, which will
    /// be populated from [`FilterValue::Parameter`]. Also, [`TableAlias`] is used to populate
    /// [`Table::alias`] inside of [`ConditionValue::Column`].
    pub fn from_filter<'f: 'q, T: QueryRecord<Path<'q>: Path>>(
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
                    .map(|value| ConditionValue::from_filter_value(value, parameters, alias)),
                rhs.as_ref()
                    .map(|value| ConditionValue::from_filter_value(value, parameters, alias)),
            ),
            Filter::NotEqual(lhs, rhs) => Self::NotEqual(
                lhs.as_ref()
                    .map(|value| ConditionValue::from_filter_value(value, parameters, alias)),
                rhs.as_ref()
                    .map(|value| ConditionValue::from_filter_value(value, parameters, alias)),
            ),
        }
    }
}

impl Transpile for Condition<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Condition::All(conditions) if conditions.is_empty() => fmt.write_str("true"),
            Condition::Any(conditions) if conditions.is_empty() => fmt.write_str("false"),
            Condition::All(conditions) | Condition::Any(conditions) => {
                for (idx, condition) in conditions.iter().enumerate() {
                    fmt.write_char('(')?;
                    condition.transpile(fmt)?;
                    fmt.write_char(')')?;
                    if idx + 1 < conditions.len() {
                        if matches!(self, Condition::All(_)) {
                            fmt.write_str(" AND ")?;
                        } else {
                            fmt.write_str(" OR ")?;
                        }
                    }
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

/// A [`FilterValue`] compiled to postgres.
pub enum ConditionValue<'q> {
    Column(Column<'q>),
    Parameter(usize),
}

impl Transpile for ConditionValue<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Column(column) => column.transpile(fmt),
            Self::Parameter(index) => write!(fmt, "${index}"),
        }
    }
}

impl<'q> ConditionValue<'q> {
    pub fn from_filter_value<'f: 'q, T: QueryRecord<Path<'q>: Path>>(
        value: &'f FilterValue<'q, T>,
        parameters: &mut Vec<&'f dyn ToSql>,
        alias: Option<TableAlias>,
    ) -> Self {
        match value {
            FilterValue::Path(path) => Self::Column(Column {
                table: Table {
                    name: path.table_name(),
                    alias,
                },
                access: path.column_access(),
            }),
            FilterValue::Parameter(parameter) => match parameter {
                Parameter::Number(number) => {
                    parameters.push(number);
                    Self::Parameter(parameters.len())
                }
                Parameter::Text(text) => {
                    parameters.push(text);
                    Self::Parameter(parameters.len())
                }
                Parameter::Boolean(bool) => {
                    parameters.push(bool);
                    Self::Parameter(parameters.len())
                }
            },
        }
    }
}

impl Transpile for Option<ConditionValue<'_>> {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Some(value) => value.transpile(fmt),
            None => fmt.write_str("NULL"),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::borrow::Cow;

    use type_system::DataType;

    use super::*;
    use crate::{ontology::DataTypeQueryPath, store::postgres::query::test_helper::transpile};

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
        let filter = Filter::All(vec![]);
        test_condition(&filter, "true", &[]);

        let filter = Filter::Any(vec![]);
        test_condition(&filter, "false", &[]);
    }

    #[test]
    fn render_null_condition() {
        test_condition(
            &Filter::Equal(
                Some(FilterValue::Path(DataTypeQueryPath::Description)),
                None,
            ),
            r#""data_types"."schema"->>'description' IS NULL"#,
            &[],
        );

        test_condition(
            &Filter::Equal(
                None,
                Some(FilterValue::Path(DataTypeQueryPath::Description)),
            ),
            r#""data_types"."schema"->>'description' IS NULL"#,
            &[],
        );

        test_condition(&Filter::Equal(None, None), "NULL IS NULL", &[]);

        test_condition(
            &Filter::NotEqual(
                Some(FilterValue::Path(DataTypeQueryPath::Description)),
                None,
            ),
            r#""data_types"."schema"->>'description' IS NOT NULL"#,
            &[],
        );

        test_condition(
            &Filter::NotEqual(
                None,
                Some(FilterValue::Path(DataTypeQueryPath::Description)),
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
                Some(FilterValue::Path(DataTypeQueryPath::VersionedUri)),
                Some(FilterValue::Parameter(Parameter::Text(Cow::Borrowed(
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                )))),
            )]),
            r#"("data_types"."schema"->>'$id' = $1)"#,
            &[&"https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1"],
        );

        test_condition(
            &Filter::All(vec![
                Filter::Equal(
                    Some(FilterValue::Path(DataTypeQueryPath::BaseUri)),
                    Some(FilterValue::Parameter(Parameter::Text(Cow::Borrowed(
                        "https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                    )))),
                ),
                Filter::Equal(
                    Some(FilterValue::Path(DataTypeQueryPath::Version)),
                    Some(FilterValue::Parameter(Parameter::Number(1.0))),
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
                Some(FilterValue::Path(DataTypeQueryPath::VersionedUri)),
                Some(FilterValue::Parameter(Parameter::Text(Cow::Borrowed(
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                )))),
            )]),
            r#"("data_types"."schema"->>'$id' = $1)"#,
            &[&"https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1"],
        );

        test_condition(
            &Filter::Any(vec![
                Filter::Equal(
                    Some(FilterValue::Path(DataTypeQueryPath::BaseUri)),
                    Some(FilterValue::Parameter(Parameter::Text(Cow::Borrowed(
                        "https://blockprotocol.org/@blockprotocol/types/data-type/text/",
                    )))),
                ),
                Filter::Equal(
                    Some(FilterValue::Path(DataTypeQueryPath::Version)),
                    Some(FilterValue::Parameter(Parameter::Number(1.0))),
                ),
            ]),
            r#"("type_ids"."base_uri" = $1) OR ("type_ids"."version" = $2)"#,
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
                Some(FilterValue::Path(DataTypeQueryPath::VersionedUri)),
                Some(FilterValue::Parameter(Parameter::Text(Cow::Borrowed(
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                )))),
            ))),
            r#"NOT("data_types"."schema"->>'$id' = $1)"#,
            &[&"https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1"],
        );
    }
}
