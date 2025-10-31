use core::{fmt, fmt::Write as _};

use super::TableReference;
use crate::store::postgres::query::{Condition, SelectStatement, Transpile};

/// SQL JOIN types supported in PostgreSQL queries.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum JoinType {
    /// INNER JOIN - returns rows when there is a match in both tables.
    Inner,
    /// LEFT OUTER JOIN - returns all rows from the left table, with matched rows from the right.
    LeftOuter,
    /// RIGHT OUTER JOIN - returns all rows from the right table, with matched rows from the left.
    RightOuter,
    /// FULL OUTER JOIN - returns all rows when there is a match in either table.
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
    /// Returns the reversed join type.
    ///
    /// Swaps left/right orientation while preserving semantics:
    /// - `LeftOuter` ↔ `RightOuter`
    /// - `Inner` and `FullOuter` remain unchanged
    ///
    /// Useful when reversing the order of tables in a join operation.
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

/// The source for a JOIN operation, either a table or a subquery.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum JoinFrom {
    /// Join with a table reference.
    Table {
        /// The base table reference.
        table: TableReference<'static>,
        /// Optional alias for the table.
        ///
        /// When `Some`, the table is referenced using this alias in join conditions.
        /// When `None`, the base table reference is used directly.
        alias: Option<TableReference<'static>>,
    },
    /// Join with a subquery (SELECT statement).
    Subquery {
        /// The subquery to join with.
        statement: Box<SelectStatement>,
        /// Alias for the subquery result.
        ///
        /// Required for subqueries, as they must be named to be referenced in conditions.
        alias: TableReference<'static>,
    },
}

impl JoinFrom {
    /// Returns the table reference used in join conditions.
    ///
    /// For [`JoinFrom::Table`], returns the alias if present, otherwise the base table.
    /// For [`JoinFrom::Subquery`], returns the alias (which is always present).
    #[must_use]
    pub const fn reference_table(&self) -> &TableReference<'static> {
        match self {
            Self::Table {
                alias: Some(table), ..
            }
            | Self::Table { table, .. }
            | Self::Subquery { alias: table, .. } => table,
        }
    }

    /// Returns a mutable reference to the table reference used in join conditions.
    ///
    /// See [`reference_table`](Self::reference_table) for details on which reference is returned.
    #[must_use]
    pub const fn reference_table_mut(&mut self) -> &mut TableReference<'static> {
        match self {
            Self::Table {
                alias: Some(table), ..
            }
            | Self::Table { table, .. }
            | Self::Subquery { alias: table, .. } => table,
        }
    }

    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Table { table, alias } => {
                table.transpile(fmt)?;
                if let Some(alias) = alias {
                    fmt.write_str(" AS ")?;
                    alias.transpile(fmt)?;
                }
                Ok(())
            }
            Self::Subquery { statement, alias } => {
                fmt.write_char('(')?;
                statement.transpile(fmt)?;
                fmt.write_str(") AS ")?;
                alias.transpile(fmt)
            }
        }
    }
}

/// A JOIN expression in a PostgreSQL query.
///
/// PostgreSQL supports several join types with different condition requirements:
/// - **Conditioned joins** (INNER, LEFT/RIGHT/FULL OUTER) require explicit `ON` conditions
/// - **CROSS JOIN** produces a cartesian product with no conditions
/// - **NATURAL JOIN** implicitly joins on columns with matching names
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum JoinExpression {
    /// A join with explicit ON conditions.
    ///
    /// Transpiles to: `<JOIN TYPE> "table" ON condition1 AND condition2`
    Conditioned {
        /// The type of join (INNER, LEFT OUTER, etc.).
        join: JoinType,
        /// The source being joined (table or subquery).
        from: JoinFrom,
        /// Join conditions combined with AND.
        ///
        /// Multiple conditions are supported for composite joins (e.g., multi-column
        /// foreign keys). All conditions are combined with `AND` in the `ON` clause.
        ///
        /// Must contain at least one condition (validated during transpilation).
        conditions: Vec<Condition>,
    },
    /// A CROSS JOIN producing the cartesian product of both tables.
    ///
    /// Transpiles to: `CROSS JOIN "table"`
    ///
    /// Equivalent to `INNER JOIN ... ON TRUE`.
    Cross {
        /// The source being joined (table or subquery).
        from: JoinFrom,
    },
    /// A NATURAL JOIN implicitly using matching column names.
    ///
    /// Transpiles to: `NATURAL <JOIN TYPE> "table"`
    Natural {
        /// The type of join (INNER, LEFT OUTER, etc.).
        join: JoinType,
        /// The source being joined (table or subquery).
        from: JoinFrom,
    },
}

impl JoinExpression {
    #[must_use]
    #[expect(clippy::wrong_self_convention)]
    pub const fn from_item(&self) -> &JoinFrom {
        match self {
            Self::Conditioned { from, .. } | Self::Cross { from } | Self::Natural { from, .. } => {
                from
            }
        }
    }

    #[must_use]
    #[expect(clippy::wrong_self_convention)]
    pub const fn from_item_mut(&mut self) -> &mut JoinFrom {
        match self {
            Self::Conditioned { from, .. } | Self::Cross { from } | Self::Natural { from, .. } => {
                from
            }
        }
    }
}

impl Transpile for JoinExpression {
    #[expect(clippy::panic_in_result_fn)]
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Conditioned {
                join,
                from,
                conditions,
            } => {
                assert!(
                    !conditions.is_empty(),
                    "Conditioned JOIN expressions require at least one condition"
                );

                join.transpile(fmt)?;
                fmt.write_char(' ')?;
                from.transpile(fmt)?;
                fmt.write_str(" ON ")?;
                for (i, condition) in conditions.iter().enumerate() {
                    if i > 0 {
                        fmt.write_str(" AND ")?;
                    }
                    condition.transpile(fmt)?;
                }
                Ok(())
            }
            Self::Cross { from } => {
                fmt.write_str("CROSS JOIN ")?;
                from.transpile(fmt)
            }
            Self::Natural { join, from } => {
                fmt.write_str("NATURAL ")?;
                join.transpile(fmt)?;
                fmt.write_char(' ')?;
                from.transpile(fmt)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::postgres::query::{
        Alias, ForeignKeyReference, Table,
        table::{Column, DataTypes, OntologyIds},
    };

    #[test]
    fn transpile_conditioned_join() {
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
            JoinExpression::Conditioned {
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

    #[test]
    #[should_panic(expected = "Conditioned JOIN expressions require at least one condition")]
    fn transpile_conditioned_join_empty_conditions() {
        _ = JoinExpression::Conditioned {
            join: JoinType::Inner,
            from: JoinFrom::Table {
                table: Table::OntologyIds.into(),
                alias: None,
            },
            conditions: vec![],
        }
        .transpile_to_string();
    }

    #[test]
    fn transpile_cross_join() {
        assert_eq!(
            JoinExpression::Cross {
                from: JoinFrom::Table {
                    table: Table::OntologyIds.into(),
                    alias: None,
                },
            }
            .transpile_to_string(),
            r#"CROSS JOIN "ontology_ids""#
        );
    }

    #[test]
    fn transpile_natural_join() {
        assert_eq!(
            JoinExpression::Natural {
                join: JoinType::Inner,
                from: JoinFrom::Table {
                    table: Table::OntologyIds.into(),
                    alias: None,
                },
            }
            .transpile_to_string(),
            r#"NATURAL INNER JOIN "ontology_ids""#
        );

        assert_eq!(
            JoinExpression::Natural {
                join: JoinType::LeftOuter,
                from: JoinFrom::Table {
                    table: Table::OntologyIds.into(),
                    alias: None,
                },
            }
            .transpile_to_string(),
            r#"NATURAL LEFT OUTER JOIN "ontology_ids""#
        );
    }

    #[test]
    fn reference_table_returns_alias_when_present() {
        let table_ref: TableReference = Table::OntologyIds.into();
        let alias_ref = Table::OntologyIds.aliased(Alias {
            condition_index: 0,
            chain_depth: 1,
            number: 2,
        });

        let join_from = JoinFrom::Table {
            table: table_ref,
            alias: Some(alias_ref.clone()),
        };

        // Should return alias, not table
        assert_eq!(join_from.reference_table(), &alias_ref);
    }

    #[test]
    fn reference_table_returns_table_when_no_alias() {
        let table_ref: TableReference = Table::OntologyIds.into();

        let join_from = JoinFrom::Table {
            table: table_ref.clone(),
            alias: None,
        };

        // Should return table
        assert_eq!(join_from.reference_table(), &table_ref);
    }
}
