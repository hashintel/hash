use std::{fmt, fmt::Write};

use crate::store::postgres::query::{
    table::{Column, ForeignKeyReference},
    Alias, AliasedTable, SelectStatement, Transpile,
};

#[derive(Debug, PartialEq, Eq, Hash)]
pub struct JoinCondition<'p> {
    pub join: Column<'p>,
    pub on: Column<'p>,
}

#[derive(Debug, PartialEq, Eq, Hash)]
pub enum JoinType {
    Inner,
    LeftOuter,
    RightOuter,
    FullOuter,
}

impl Transpile for JoinType {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Inner => fmt.write_str("INNER JOIN"),
            Self::LeftOuter => fmt.write_str("LEFT OUTER JOIN"),
            Self::RightOuter => fmt.write_str("RIGHT OUTER JOIN"),
            Self::FullOuter => fmt.write_str("FULL OUTER JOIN"),
        }
    }
}

impl JoinType {
    #[must_use]
    const fn from_nullability(left: bool, right: bool) -> Self {
        match (left, right) {
            (false, false) => Self::Inner,
            (true, false) => Self::LeftOuter,
            (false, true) => Self::RightOuter,
            (true, true) => Self::FullOuter,
        }
    }
}

#[derive(Debug, PartialEq, Eq, Hash)]
pub struct JoinOn {
    pub join: Column<'static>,
    pub on: Column<'static>,
}

#[derive(Debug, PartialEq, Eq, Hash)]
pub struct JoinExpression {
    pub join: JoinType,
    pub statement: Option<SelectStatement>,
    pub table: AliasedTable,
    pub on_alias: Alias,
    pub on: Vec<JoinOn>,
}

impl JoinExpression {
    pub fn from_foreign_key(
        foreign_key_reference: ForeignKeyReference,
        on_alias: Alias,
        join_alias: Alias,
    ) -> Self {
        match foreign_key_reference {
            ForeignKeyReference::Single { join, on } => Self {
                join: JoinType::from_nullability(join.nullable(), on.nullable()),
                table: join.table().aliased(join_alias),
                statement: None,
                on_alias,
                on: vec![JoinOn { join, on }],
            },
            ForeignKeyReference::Double {
                join: [join1, join2],
                on: [on1, on2],
            } => Self {
                join: JoinType::from_nullability(
                    join1.nullable() || join2.nullable(),
                    on1.nullable() || on2.nullable(),
                ),
                table: join1.table().aliased(join_alias),
                statement: None,
                on_alias,
                on: vec![
                    JoinOn {
                        join: join1,
                        on: on1,
                    },
                    JoinOn {
                        join: join2,
                        on: on2,
                    },
                ],
            },
        }
    }
}

impl Transpile for JoinExpression {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        self.join.transpile(fmt)?;
        fmt.write_char(' ')?;
        if let Some(select) = &self.statement {
            fmt.write_char('(')?;
            select.transpile(fmt)?;
            fmt.write_char(')')?;
        } else {
            self.table.table.transpile(fmt)?;
        }
        fmt.write_str(" AS ")?;
        self.table.transpile(fmt)?;
        fmt.write_str(" ON ")?;
        for (i, condition) in self.on.iter().enumerate() {
            if i > 0 {
                fmt.write_str(" AND ")?;
            }
            condition.join.aliased(self.table.alias).transpile(fmt)?;
            fmt.write_str(" = ")?;
            condition.on.aliased(self.on_alias).transpile(fmt)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::postgres::query::{
        table::{Column, DataTypes, OntologyIds},
        Alias,
    };

    #[test]
    fn transpile_join_expression() {
        assert_eq!(
            JoinExpression::from_foreign_key(
                ForeignKeyReference::Single {
                    on: Column::DataTypes(DataTypes::OntologyId),
                    join: Column::OntologyIds(OntologyIds::OntologyId),
                },
                Alias {
                    condition_index: 1,
                    chain_depth: 2,
                    number: 3,
                },
                Alias {
                    condition_index: 0,
                    chain_depth: 1,
                    number: 2,
                }
            )
            .transpile_to_string(),
            r#"INNER JOIN "ontology_ids" AS "ontology_ids_0_1_2" ON "ontology_ids_0_1_2"."ontology_id" = "data_types_1_2_3"."ontology_id""#
        );
    }
}
