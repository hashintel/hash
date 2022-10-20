use std::fmt;

use crate::store::postgres::query::{Condition, Transpile};

#[derive(Debug, Default, PartialEq, Eq, Hash)]
pub struct WhereExpression<'q> {
    conditions: Vec<Condition<'q>>,
}

impl<'q> WhereExpression<'q> {
    pub fn add_condition(&mut self, condition: Condition<'q>) {
        self.conditions.push(condition);
    }

    pub fn len(&self) -> usize {
        self.conditions.len()
    }

    pub fn is_empty(&self) -> bool {
        self.conditions.is_empty()
    }
}

impl Transpile for WhereExpression<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        if self.conditions.is_empty() {
            return Ok(());
        }

        fmt.write_str("WHERE ")?;
        for (idx, condition) in self.conditions.iter().enumerate() {
            condition.transpile(fmt)?;
            if idx + 1 < self.conditions.len() {
                fmt.write_str("\n  AND ")?;
            }
        }

        Ok(())
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
            postgres::query::test_helper::{transpile, trim_whitespace},
            query::{Filter, FilterExpression, Parameter},
        },
    };

    #[test]
    fn render_where_expression() {
        let mut parameters = Vec::new();
        let mut where_clause = WhereExpression::default();
        assert_eq!(transpile(&where_clause), "");

        let filter_a = Filter::<DataType>::Equal(
            Some(FilterExpression::Path(DataTypeQueryPath::Version)),
            Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                "latest",
            )))),
        );
        where_clause.add_condition(Condition::from_filter(&filter_a, &mut parameters, None));

        assert_eq!(
            transpile(&where_clause),
            r#"WHERE "type_ids"."version" = $1"#
        );

        let filter_b = Filter::<DataType>::All(vec![
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
        ]);
        where_clause.add_condition(Condition::from_filter(&filter_b, &mut parameters, None));

        assert_eq!(
            trim_whitespace(transpile(&where_clause)),
            trim_whitespace(
                r#"
                WHERE "type_ids"."version" = $1
                  AND ("type_ids"."base_uri" = $2) AND ("type_ids"."version" = $3)"#
            )
        );

        let filter_c = Filter::<DataType>::NotEqual(
            Some(FilterExpression::Path(DataTypeQueryPath::Description)),
            None,
        );
        where_clause.add_condition(Condition::from_filter(&filter_c, &mut parameters, None));

        assert_eq!(
            trim_whitespace(transpile(&where_clause)),
            trim_whitespace(
                r#"
                WHERE "type_ids"."version" = $1
                  AND ("type_ids"."base_uri" = $2) AND ("type_ids"."version" = $3)
                  AND "data_types"."schema"->>'description' IS NOT NULL"#
            )
        );

        let filter_d = Filter::<DataType>::Any(vec![
            Filter::Equal(
                Some(FilterExpression::Path(DataTypeQueryPath::Custom(
                    Cow::Borrowed("value"),
                ))),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    "something",
                )))),
            ),
            Filter::Equal(
                Some(FilterExpression::Path(DataTypeQueryPath::Custom(
                    Cow::Borrowed("value"),
                ))),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    "something_else",
                )))),
            ),
        ]);
        where_clause.add_condition(Condition::from_filter(&filter_d, &mut parameters, None));
        assert_eq!(
            trim_whitespace(transpile(&where_clause)),
            trim_whitespace(
                r#"
                WHERE "type_ids"."version" = $1
                  AND ("type_ids"."base_uri" = $2) AND ("type_ids"."version" = $3)
                  AND "data_types"."schema"->>'description' IS NOT NULL
                  AND (("data_types"."schema"->>'value' = $4) OR ("data_types"."schema"->>'value' = $5))"#
            )
        );
        let parameters = parameters
            .iter()
            .map(|parameter| format!("{parameter:?}"))
            .collect::<Vec<_>>();
        assert_eq!(parameters, &[
            "\"latest\"",
            "\"https://blockprotocol.org/@blockprotocol/types/data-type/text/\"",
            "1.0",
            "\"something\"",
            "\"something_else\""
        ]);
    }
}
