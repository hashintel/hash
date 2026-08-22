mod insert;
mod select;

use core::fmt;

pub use self::{
    insert::{OnConflict, bulk_insert},
    select::{SelectClause, SelectQuantifier, SelectStatement, SetOperator, SimpleSelect},
};
use crate::store::postgres::query::Transpile;

#[derive(Debug, Clone, PartialEq)]
pub enum Statement {
    Select(SelectStatement),
}

impl Transpile for Statement {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Select(statement) => statement.transpile(fmt),
        }
    }
}

impl From<SelectStatement> for Statement {
    #[inline]
    fn from(statement: SelectStatement) -> Self {
        Self::Select(statement)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::postgres::query::{
        FromItem, SelectClause, SelectExpression, SimpleSelect, Table, TableName,
    };

    fn select_all_from(table: Table) -> SelectClause {
        SelectClause::from(
            SimpleSelect::builder()
                .selects(vec![SelectExpression::Asterisk(None)])
                .from(FromItem::table(table).build())
                .build(),
        )
    }

    #[test]
    fn transpile_union_all() {
        assert_eq!(
            select_all_from(Table::DataTypes)
                .union_all(select_all_from(Table::OntologyIds))
                .transpile_to_string(),
            "SELECT *\nFROM \"data_types\"\nUNION ALL\nSELECT *\nFROM \"ontology_ids\""
        );
    }

    #[test]
    fn set_operation_stands_in_a_from_item() {
        let subquery = FromItem::subquery(
            select_all_from(Table::DataTypes).union_all(select_all_from(Table::OntologyIds)),
        )
        .alias(TableName::from("combined"))
        .build();

        assert_eq!(
            subquery.transpile_to_string(),
            "(SELECT *\nFROM \"data_types\"\nUNION ALL\nSELECT *\nFROM \"ontology_ids\") AS \
             \"combined\""
        );
    }
}
