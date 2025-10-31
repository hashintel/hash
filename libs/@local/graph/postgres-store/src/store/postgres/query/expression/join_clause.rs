use core::{fmt, fmt::Write as _};

use super::TableReference;
use crate::store::postgres::query::{Condition, SelectStatement, Transpile, table::Column};

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

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum JoinFrom {
    Table {
        table: TableReference<'static>,
        alias: Option<TableReference<'static>>,
    },
    SelectStatement {
        statement: Box<SelectStatement>,
        alias: TableReference<'static>,
    },
}

impl JoinFrom {
    #[must_use]
    pub const fn reference_table(&self) -> &TableReference<'static> {
        match self {
            Self::Table {
                alias: Some(table), ..
            }
            | Self::Table { table, .. }
            | Self::SelectStatement { alias: table, .. } => table,
        }
    }

    #[must_use]
    pub const fn reference_table_mut(&mut self) -> &mut TableReference<'static> {
        match self {
            Self::Table {
                alias: Some(table), ..
            }
            | Self::Table { table, .. }
            | Self::SelectStatement { alias: table, .. } => table,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JoinExpression {
    pub join: JoinType,
    pub from: JoinFrom,
    pub conditions: Vec<Condition>,
}

impl Transpile for JoinExpression {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        self.join.transpile(fmt)?;
        fmt.write_char(' ')?;
        match &self.from {
            JoinFrom::Table { table, alias } => {
                table.name.transpile(fmt)?;
                if let Some(alias) = alias {
                    fmt.write_str(" AS ")?;
                    alias.transpile(fmt)?;
                }
            }
            JoinFrom::SelectStatement { statement, alias } => {
                fmt.write_char('(')?;
                statement.transpile(fmt)?;
                fmt.write_str(") AS ")?;
                alias.transpile(fmt)?;
            }
        }
        fmt.write_str(" ON ")?;
        for (i, condition) in self.conditions.iter().enumerate() {
            if i > 0 {
                fmt.write_str(" AND ")?;
            }
            condition.transpile(fmt)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::postgres::query::{
        Alias, ForeignKeyReference, Table,
        table::{DataTypes, OntologyIds},
    };

    #[test]
    fn transpile_join_expression() {
        let join_alias = Alias {
            condition_index: 0,
            chain_depth: 1,
            number: 2,
        };
        let on_alias = Alias {
            condition_index: 1,
            chain_depth: 2,
            number: 3,
        };

        assert_eq!(
            JoinExpression {
                join: JoinType::Inner,
                from: JoinFrom::Table {
                    table: Table::OntologyIds.into(),
                    alias: Some(Table::OntologyIds.aliased(join_alias))
                },
                conditions: ForeignKeyReference::Single {
                    on: Column::DataTypes(DataTypes::OntologyId),
                    join: Column::OntologyIds(OntologyIds::OntologyId),
                    join_type: JoinType::Inner,
                }
                .conditions(on_alias, join_alias),
            }
            .transpile_to_string(),
            r#"INNER JOIN "ontology_ids" AS "ontology_ids_0_1_2" ON "ontology_ids_0_1_2"."ontology_id" = "data_types_1_2_3"."ontology_id""#
        );
    }
}
