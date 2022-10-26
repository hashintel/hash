use std::fmt;

use crate::store::postgres::query::{Condition, Expression, Table, Transpile};

#[derive(Debug, PartialEq, Eq, Hash)]
pub struct JoinExpression<'q> {
    pub join: Table,
    pub on: Condition<'q>,
}

/// The direction of how joining happens.
///
/// When joining a table, typically, this happens from mapping the source field to the target field.
/// In some circumstances, for example when resolving a link by it's incoming links, this direction
/// is reversed.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EdgeJoinDirection {
    SourceOnTarget,
    TargetOnSource,
}

impl<'q> JoinExpression<'q> {
    #[must_use]
    pub const fn from_tables(join: Table, on: Table, direction: EdgeJoinDirection) -> Self {
        let condition = match direction {
            EdgeJoinDirection::SourceOnTarget => Condition::Equal(
                Some(Expression::Column(join.source_join_column())),
                Some(Expression::Column(on.target_join_column())),
            ),
            EdgeJoinDirection::TargetOnSource => Condition::Equal(
                Some(Expression::Column(join.target_join_column())),
                Some(Expression::Column(on.source_join_column())),
            ),
        };

        Self {
            join,
            on: condition,
        }
    }
}

impl Transpile for JoinExpression<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        fmt.write_str("JOIN ")?;
        if self.join.alias.is_some() {
            let unaliased_table = Table {
                name: self.join.name,
                alias: None,
            };
            unaliased_table.transpile(fmt)?;
            fmt.write_str(" AS ")?;
        }
        self.join.transpile(fmt)?;

        fmt.write_str(" ON ")?;
        self.on.transpile(fmt)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::postgres::query::{TableAlias, TableName};

    #[test]
    fn transpile_join_expression() {
        assert_eq!(
            JoinExpression::from_tables(
                Table {
                    name: TableName::TypeIds,
                    alias: None
                },
                Table {
                    name: TableName::DataTypes,
                    alias: None
                },
                EdgeJoinDirection::SourceOnTarget,
            )
            .transpile_to_string(),
            r#"JOIN "type_ids" ON "type_ids"."version_id" = "data_types"."version_id""#
        );

        assert_eq!(
            JoinExpression::from_tables(
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
                EdgeJoinDirection::SourceOnTarget,
            )
            .transpile_to_string(),
            r#"JOIN "type_ids" AS "type_ids_0_1" ON "type_ids_0_1"."version_id" = "data_types"."version_id""#
        );

        assert_eq!(
            JoinExpression::from_tables(
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
                EdgeJoinDirection::SourceOnTarget,
            )
            .transpile_to_string(),
            r#"JOIN "type_ids" ON "type_ids"."version_id" = "data_types_0_0"."version_id""#
        );

        assert_eq!(
            JoinExpression::from_tables(
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
                EdgeJoinDirection::SourceOnTarget,
            )
            .transpile_to_string(),
            r#"JOIN "type_ids" AS "type_ids_0_1" ON "type_ids_0_1"."version_id" = "data_types_0_0"."version_id""#
        );
    }
}
