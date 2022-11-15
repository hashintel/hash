use std::fmt;

use crate::store::postgres::query::{AliasedColumn, Transpile};

#[derive(Debug, PartialEq, Eq, Hash)]
pub struct JoinExpression<'q> {
    pub join: AliasedColumn<'q>,
    pub on: AliasedColumn<'q>,
}

impl<'q> JoinExpression<'q> {
    #[must_use]
    pub const fn new(join: AliasedColumn<'q>, on: AliasedColumn<'q>) -> Self {
        Self { join, on }
    }
}

impl Transpile for JoinExpression<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        // TODO: https://app.asana.com/0/1202805690238892/1203324626226299/f
        fmt.write_str("INNER JOIN ")?;

        if self.join.alias.is_some() {
            self.join.column.table().transpile(fmt)?;
            fmt.write_str(" AS ")?;
        }
        self.join.table().transpile(fmt)?;

        fmt.write_str(" ON ")?;
        self.join.transpile(fmt)?;
        fmt.write_str(" = ")?;
        self.on.transpile(fmt)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::postgres::query::{
        table::{Column, DataTypes, Entities, TypeIds},
        Alias,
    };

    #[test]
    fn transpile_join_expression() {
        assert_eq!(
            JoinExpression::new(
                Column::TypeIds(TypeIds::VersionId).aliased(None),
                Column::DataTypes(DataTypes::VersionId).aliased(None),
            )
            .transpile_to_string(),
            r#"INNER JOIN "type_ids" ON "type_ids"."version_id" = "data_types"."version_id""#
        );

        assert_eq!(
            JoinExpression::new(
                Column::Entities(Entities::LeftEntityUuid).aliased(Alias {
                    condition_index: 0,
                    chain_depth: 1,
                    number: 2,
                }),
                Column::Entities(Entities::EntityUuid).aliased(None),
            )
            .transpile_to_string(),
            r#"INNER JOIN "entities" AS "entities_0_1_2" ON "entities_0_1_2"."left_entity_uuid" = "entities"."entity_uuid""#
        );
    }
}
