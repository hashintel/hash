mod insert;
mod select;

use core::fmt::{self, Write as _};

pub use self::{
    insert::{OnConflict, bulk_insert},
    select::{Distinctness, SelectStatement},
};
use crate::store::postgres::query::Transpile;

#[derive(Debug, Clone, PartialEq)]
pub enum Statement {
    Select(Box<SelectStatement>),
    SetOperation(SetOperation),
}

impl Transpile for Statement {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Select(statement) => statement.transpile(fmt),
            Self::SetOperation(operation) => operation.transpile(fmt),
        }
    }
}

impl From<SelectStatement> for Statement {
    #[inline]
    fn from(statement: SelectStatement) -> Self {
        Self::Select(Box::new(statement))
    }
}

impl From<SetOperation> for Statement {
    #[inline]
    fn from(operation: SetOperation) -> Self {
        Self::SetOperation(operation)
    }
}

/// The operator combining two queries' result sets.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum SetOperator {
    /// Both sets with duplicates removed.
    Union,
    /// Both sets whole, keeping duplicates.
    UnionAll,
    /// The rows present in both sets.
    Intersect,
    /// The left set's rows absent from the right set.
    Except,
}

impl Transpile for SetOperator {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Union => fmt.write_str("UNION"),
            Self::UnionAll => fmt.write_str("UNION ALL"),
            Self::Intersect => fmt.write_str("INTERSECT"),
            Self::Except => fmt.write_str("EXCEPT"),
        }
    }
}

/// Combines two queries into one result set.
///
/// Transpiles to `<left>\n<operator>\n<right>`. Both sides must deliver the same column count
/// with compatible types, which PostgreSQL checks when it parses the statement.
#[derive(Debug, Clone, PartialEq)]
pub struct SetOperation {
    pub left: Box<Statement>,
    pub operator: SetOperator,
    pub right: Box<Statement>,
}

impl SetOperation {
    /// Combines two queries with the given operator.
    #[must_use]
    pub fn new(
        left: impl Into<Statement>,
        operator: SetOperator,
        right: impl Into<Statement>,
    ) -> Self {
        Self {
            left: Box::new(left.into()),
            operator,
            right: Box::new(right.into()),
        }
    }

    /// Combines two queries into one set keeping duplicates: `<left> UNION ALL <right>`.
    #[must_use]
    pub fn union_all(left: impl Into<Statement>, right: impl Into<Statement>) -> Self {
        Self::new(left, SetOperator::UnionAll, right)
    }
}

impl Transpile for SetOperation {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        self.left.transpile(fmt)?;
        fmt.write_char('\n')?;
        self.operator.transpile(fmt)?;
        fmt.write_char('\n')?;
        self.right.transpile(fmt)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::postgres::query::{
        FromItem, SelectExpression, Table, TableName, TableReference,
    };

    fn select_all_from(table: Table) -> SelectStatement {
        SelectStatement::builder()
            .selects(vec![SelectExpression::Asterisk(None)])
            .from(FromItem::table(table))
            .build()
    }

    #[test]
    fn transpile_union_all() {
        assert_eq!(
            SetOperation::union_all(
                select_all_from(Table::DataTypes),
                select_all_from(Table::OntologyIds),
            )
            .transpile_to_string(),
            "SELECT *\nFROM \"data_types\"\nUNION ALL\nSELECT *\nFROM \"ontology_ids\""
        );
    }

    #[test]
    fn set_operation_stands_in_a_from_item() {
        let subquery = FromItem::subquery(SetOperation::union_all(
            select_all_from(Table::DataTypes),
            select_all_from(Table::OntologyIds),
        ))
        .alias(TableReference {
            schema: None,
            name: TableName::from("combined"),
            alias: None,
        })
        .build();

        assert_eq!(
            subquery.transpile_to_string(),
            "(SELECT *\nFROM \"data_types\"\nUNION ALL\nSELECT *\nFROM \"ontology_ids\") AS \
             \"combined\""
        );
    }
}
