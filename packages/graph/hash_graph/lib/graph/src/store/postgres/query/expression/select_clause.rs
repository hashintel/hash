use std::{borrow::Cow, fmt};

use crate::store::postgres::query::{AliasedColumn, Expression, Transpile};

#[derive(Debug, PartialEq, Eq, Hash)]
pub struct SelectExpression<'q> {
    expression: Expression<'q>,
    alias: Option<Cow<'q, str>>,
}

impl<'q> SelectExpression<'q> {
    #[must_use]
    #[inline]
    pub const fn new(expression: Expression<'q>, alias: Option<Cow<'q, str>>) -> Self {
        Self { expression, alias }
    }

    #[must_use]
    pub const fn from_column(column: AliasedColumn<'q>, alias: Option<Cow<'q, str>>) -> Self {
        Self::new(Expression::Column(column), alias)
    }
}

impl Transpile for SelectExpression<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        self.expression.transpile(fmt)?;
        if let Some(alias) = &self.alias {
            write!(fmt, r#" AS "{alias}""#)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        ontology::DataTypeQueryPath,
        store::postgres::query::{Alias, Function, Path, WindowStatement},
    };

    #[test]
    fn transpile_select_expression() {
        assert_eq!(
            SelectExpression::from_column(
                DataTypeQueryPath::BaseUri
                    .terminating_column()
                    .aliased(Alias {
                        condition_index: 1,
                        chain_depth: 2,
                        number: 3,
                    }),
                None
            )
            .transpile_to_string(),
            r#""type_ids_1_2_3"."base_uri""#
        );

        assert_eq!(
            SelectExpression::from_column(
                DataTypeQueryPath::VersionedUri
                    .terminating_column()
                    .aliased(Alias {
                        condition_index: 1,
                        chain_depth: 2,
                        number: 3,
                    }),
                Some(Cow::Borrowed("versionedUri"))
            )
            .transpile_to_string(),
            r#""data_types_1_2_3"."schema"->>'$id' AS "versionedUri""#
        );

        assert_eq!(
            SelectExpression::new(
                Expression::Window(
                    Box::new(Expression::Function(Function::Max(Box::new(
                        Expression::Column(
                            DataTypeQueryPath::Version
                                .terminating_column()
                                .aliased(Alias {
                                    condition_index: 1,
                                    chain_depth: 2,
                                    number: 3,
                                })
                        )
                    )))),
                    WindowStatement::partition_by(
                        DataTypeQueryPath::BaseUri
                            .terminating_column()
                            .aliased(Alias {
                                condition_index: 1,
                                chain_depth: 2,
                                number: 3,
                            })
                    )
                ),
                Some(Cow::Borrowed("latest_version"))
            )
            .transpile_to_string(),
            r#"MAX("type_ids_1_2_3"."version") OVER (PARTITION BY "type_ids_1_2_3"."base_uri") AS "latest_version""#
        );
    }
}
