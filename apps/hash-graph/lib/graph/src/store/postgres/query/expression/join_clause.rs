use std::fmt;

use crate::store::postgres::query::{AliasedColumn, Transpile};

#[derive(Debug, PartialEq, Eq, Hash)]
pub struct JoinExpression<'p> {
    pub join: AliasedColumn<'p>,
    pub on: AliasedColumn<'p>,
}

impl<'p> JoinExpression<'p> {
    #[must_use]
    pub const fn new(join: AliasedColumn<'p>, on: AliasedColumn<'p>) -> Self {
        Self { join, on }
    }
}

impl Transpile for JoinExpression<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match (self.join.column.nullable(), self.on.column.nullable()) {
            (false, false) => write!(fmt, "INNER JOIN ")?,
            (true, false) => write!(fmt, "LEFT OUTER JOIN ")?,
            (false, true) => write!(fmt, "RIGHT OUTER JOIN ")?,
            (true, true) => write!(fmt, "FULL OUTER JOIN ")?,
        };
        let table = self.join.table();
        table.table.transpile(fmt)?;
        fmt.write_str(" AS ")?;
        table.transpile(fmt)?;

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
        table::{Column, DataTypes, TypeIds},
        Alias,
    };

    #[test]
    fn transpile_join_expression() {
        assert_eq!(
            JoinExpression::new(
                Column::TypeIds(TypeIds::VersionId).aliased(Alias {
                    condition_index: 0,
                    chain_depth: 1,
                    number: 2,
                }),
                Column::DataTypes(DataTypes::VersionId).aliased(Alias {
                    condition_index: 1,
                    chain_depth: 2,
                    number: 3,
                }),
            )
            .transpile_to_string(),
            r#"INNER JOIN "type_ids" AS "type_ids_0_1_2" ON "type_ids_0_1_2"."version_id" = "data_types_1_2_3"."version_id""#
        );
    }
}
