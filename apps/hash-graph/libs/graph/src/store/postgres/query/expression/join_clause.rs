use core::{fmt, fmt::Write};

use crate::store::postgres::query::{
    table::{Column, ForeignKeyReference},
    Alias, AliasedTable, Expression, SelectStatement, Transpile,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct JoinCondition {
    pub join: Column,
    pub on: Column,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
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
    pub const fn reverse(self) -> Self {
        match self {
            Self::Inner => Self::Inner,
            Self::LeftOuter => Self::RightOuter,
            Self::RightOuter => Self::LeftOuter,
            Self::FullOuter => Self::FullOuter,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct JoinOn {
    pub join: Column,
    pub on: Column,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
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
            ForeignKeyReference::Single {
                join,
                on,
                join_type,
            } => Self {
                join: join_type,
                table: join.table().aliased(join_alias),
                statement: None,
                on_alias,
                on: vec![JoinOn { join, on }],
            },
            ForeignKeyReference::Double {
                join: [join1, join2],
                on: [on1, on2],
                join_type,
            } => Self {
                join: join_type,
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
            Expression::ColumnReference {
                column: condition.join,
                table_alias: Some(self.table.alias),
            }
            .transpile(fmt)?;
            fmt.write_str(" = ")?;
            Expression::ColumnReference {
                column: condition.on,
                table_alias: Some(self.on_alias),
            }
            .transpile(fmt)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::postgres::query::table::{DataTypes, OntologyIds};

    #[test]
    fn transpile_join_expression() {
        assert_eq!(
            JoinExpression::from_foreign_key(
                ForeignKeyReference::Single {
                    on: Column::DataTypes(DataTypes::OntologyId),
                    join: Column::OntologyIds(OntologyIds::OntologyId),
                    join_type: JoinType::Inner,
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
