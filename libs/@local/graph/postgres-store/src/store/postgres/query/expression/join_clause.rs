use core::{fmt, fmt::Write as _};

use super::TableReference;
use crate::store::postgres::query::{
    Alias, Condition, Expression, SelectStatement, Transpile,
    table::{Column, ForeignKeyReference},
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
pub enum JoinExpression {
    Old {
        join: JoinType,
        statement: Option<SelectStatement>,
        table: TableReference<'static>,
        on_alias: Alias,
        on: Vec<JoinOn>,
        additional_conditions: Vec<Condition>,
    },
}

impl JoinExpression {
    #[must_use]
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
            } => Self::Old {
                join: join_type,
                table: join.table().aliased(join_alias),
                statement: None,
                on_alias,
                on: vec![JoinOn { join, on }],
                additional_conditions: Vec::new(),
            },
            ForeignKeyReference::Double {
                join: [join1, join2],
                on: [on1, on2],
                join_type,
            } => Self::Old {
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
                additional_conditions: Vec::new(),
            },
        }
    }
}

impl Transpile for JoinExpression {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Old {
                join,
                statement,
                table,
                on_alias,
                on,
                additional_conditions,
            } => {
                join.transpile(fmt)?;
                fmt.write_char(' ')?;
                if let Some(select) = statement {
                    fmt.write_char('(')?;
                    select.transpile(fmt)?;
                    fmt.write_char(')')?;
                } else {
                    table.name.transpile(fmt)?;
                }
                fmt.write_str(" AS ")?;
                table.transpile(fmt)?;
                fmt.write_str(" ON ")?;
                for (i, condition) in on.iter().enumerate() {
                    if i > 0 {
                        fmt.write_str(" AND ")?;
                    }
                    Expression::AliasedColumn {
                        column: condition.join,
                        table_alias: table.alias,
                    }
                    .transpile(fmt)?;
                    fmt.write_str(" = ")?;
                    Expression::AliasedColumn {
                        column: condition.on,
                        table_alias: Some(*on_alias),
                    }
                    .transpile(fmt)?;
                }
                for condition in additional_conditions {
                    fmt.write_str(" AND ")?;
                    condition.transpile(fmt)?;
                }
            }
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
