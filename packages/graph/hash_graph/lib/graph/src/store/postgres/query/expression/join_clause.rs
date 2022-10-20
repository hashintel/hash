use std::fmt;

use crate::store::postgres::query::{Condition, Expression, Table, Transpile};

#[derive(Debug, PartialEq, Eq, Hash)]
pub struct JoinExpression<'q> {
    pub table: Table,
    pub on: Condition<'q>,
}

impl<'q> JoinExpression<'q> {
    #[must_use]
    pub const fn from_tables(table: Table, on: Table) -> Self {
        Self {
            table,
            on: Condition::Equal(
                Some(Expression::Column(table.source_join_column())),
                Some(Expression::Column(on.target_join_column())),
            ),
        }
    }
}

impl Transpile for JoinExpression<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        fmt.write_str("JOIN ")?;
        if self.table.alias.is_some() {
            let unaliased_table = Table {
                name: self.table.name,
                alias: None,
            };
            unaliased_table.transpile(fmt)?;
            fmt.write_str(" AS ")?;
        }
        self.table.transpile(fmt)?;

        fmt.write_str(" ON ")?;
        self.on.transpile(fmt)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::postgres::query::{test_helper::transpile, TableAlias, TableName};

    #[test]
    fn render_join() {
        assert_eq!(
            transpile(&JoinExpression::from_tables(
                Table {
                    name: TableName::TypeIds,
                    alias: None
                },
                Table {
                    name: TableName::DataTypes,
                    alias: None
                },
            )),
            r#"JOIN "type_ids" ON "type_ids"."version_id" = "data_types"."version_id""#
        );

        assert_eq!(
            transpile(&JoinExpression::from_tables(
                Table {
                    name: TableName::TypeIds,
                    alias: Some(TableAlias {
                        condition_index: 0,
                        chain_depth: 1
                    })
                },
                Table {
                    name: TableName::DataTypes,
                    alias: None
                },
            )),
            r#"JOIN "type_ids" AS "type_ids_0_1" ON "type_ids_0_1"."version_id" = "data_types"."version_id""#
        );

        assert_eq!(
            transpile(&JoinExpression::from_tables(
                Table {
                    name: TableName::TypeIds,
                    alias: None
                },
                Table {
                    name: TableName::DataTypes,
                    alias: Some(TableAlias {
                        condition_index: 0,
                        chain_depth: 0
                    })
                },
            )),
            r#"JOIN "type_ids" ON "type_ids"."version_id" = "data_types_0_0"."version_id""#
        );

        assert_eq!(
            transpile(&JoinExpression::from_tables(
                Table {
                    name: TableName::TypeIds,
                    alias: Some(TableAlias {
                        condition_index: 0,
                        chain_depth: 1
                    })
                },
                Table {
                    name: TableName::DataTypes,
                    alias: Some(TableAlias {
                        condition_index: 0,
                        chain_depth: 0
                    })
                },
            )),
            r#"JOIN "type_ids" AS "type_ids_0_1" ON "type_ids_0_1"."version_id" = "data_types_0_0"."version_id""#
        );
    }
}
