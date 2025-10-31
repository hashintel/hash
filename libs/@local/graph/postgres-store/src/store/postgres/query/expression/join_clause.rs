use core::{fmt, fmt::Write as _};

use super::{ColumnName, TableReference};
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
        /// Whether this is a LATERAL subquery.
        ///
        /// When `true`, the subquery can reference columns from preceding FROM items.
        /// Transpiles to: `LATERAL (SELECT ...) AS alias`
        ///
        /// LATERAL is particularly useful for:
        /// - Correlated subqueries that depend on values from earlier tables
        /// - Set-returning functions that need to reference preceding columns
        /// - Per-row computations that require context from other tables
        lateral: bool,
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
            Self::Subquery {
                statement,
                alias,
                lateral,
            } => {
                if *lateral {
                    fmt.write_str("LATERAL ")?;
                }
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
/// - **ON joins** (INNER, LEFT/RIGHT/FULL OUTER) require explicit `ON` conditions
/// - **USING joins** specify column names that must match between tables
/// - **CROSS JOIN** produces a cartesian product with no conditions
/// - **NATURAL JOIN** implicitly joins on columns with matching names
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum JoinClause {
    /// A join with explicit ON conditions.
    ///
    /// Transpiles to:
    /// - Non-empty: `<JOIN TYPE> "table" ON condition1 AND condition2`
    /// - Empty: `<JOIN TYPE> "table" ON TRUE` (cartesian product)
    On {
        /// The type of join (INNER, LEFT OUTER, etc.).
        join: JoinType,
        /// The source being joined (table or subquery).
        from: JoinFrom,
        /// Join conditions combined with AND.
        ///
        /// Multiple conditions are supported for composite joins (e.g., multi-column
        /// foreign keys). All conditions are combined with `AND` in the `ON` clause.
        ///
        /// When empty, transpiles to `ON TRUE`, producing a cartesian product.
        conditions: Vec<Condition>,
    },
    /// A join using a USING clause with specified column names.
    ///
    /// Transpiles to:
    /// - Empty columns: `<JOIN TYPE> "table" ON TRUE` (cartesian product)
    /// - Without alias: `<JOIN TYPE> "table" USING ("col1", "col2")`
    /// - With alias: `<JOIN TYPE> "table" USING ("col1", "col2") AS "join_alias"`
    ///
    /// The USING clause specifies column names that must exist in both tables.
    /// PostgreSQL will join rows where these columns have equal values.
    /// The specified columns appear only once in the result set.
    ///
    /// When `columns` is empty, transpiles to `ON TRUE` for consistency with PostgreSQL's
    /// NATURAL JOIN behavior (which produces a cartesian product when no common columns exist).
    ///
    /// The optional `join_using_alias` provides a table alias that can reference the joined
    /// columns. Unlike a regular table alias, this only makes the USING columns addressable,
    /// not other columns from the joined tables.
    Using {
        /// The type of join (INNER, LEFT OUTER, etc.).
        join: JoinType,
        /// The source being joined (table or subquery).
        from: JoinFrom,
        /// Column names to join on.
        ///
        /// These columns must exist in both the left and right tables.
        /// Multiple columns are supported for composite joins.
        ///
        /// When empty, transpiles to `ON TRUE`, producing a cartesian product.
        /// This is consistent with PostgreSQL's NATURAL JOIN behavior when no common
        /// column names exist.
        columns: Vec<ColumnName<'static>>,
        /// Optional alias for referencing the join columns.
        ///
        /// When present, provides a table alias that can only reference columns listed in
        /// the USING clause. This does not hide the names of the joined tables from the rest
        /// of the query, and you cannot use this alias to reference other columns.
        ///
        /// Transpiles to: `AS "join_alias"`
        join_using_alias: Option<TableReference<'static>>,
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

impl JoinClause {
    #[must_use]
    #[expect(clippy::wrong_self_convention, reason = "from_item is a field")]
    pub const fn from_item(&self) -> &JoinFrom {
        match self {
            Self::On { from, .. }
            | Self::Using { from, .. }
            | Self::Cross { from }
            | Self::Natural { from, .. } => from,
        }
    }

    #[must_use]
    #[expect(clippy::wrong_self_convention, reason = "from_item is a field")]
    pub const fn from_item_mut(&mut self) -> &mut JoinFrom {
        match self {
            Self::On { from, .. }
            | Self::Using { from, .. }
            | Self::Cross { from }
            | Self::Natural { from, .. } => from,
        }
    }
}

impl Transpile for JoinClause {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::On {
                join,
                from,
                conditions,
            } => {
                join.transpile(fmt)?;
                fmt.write_char(' ')?;
                from.transpile(fmt)?;
                fmt.write_str(" ON ")?;

                if conditions.is_empty() {
                    fmt.write_str("TRUE")
                } else {
                    for (i, condition) in conditions.iter().enumerate() {
                        if i > 0 {
                            fmt.write_str(" AND ")?;
                        }
                        condition.transpile(fmt)?;
                    }
                    Ok(())
                }
            }
            Self::Using {
                join,
                from,
                columns,
                join_using_alias,
            } => {
                join.transpile(fmt)?;
                fmt.write_char(' ')?;
                from.transpile(fmt)?;

                if columns.is_empty() {
                    // Empty USING list produces ON TRUE (cartesian product),
                    // consistent with NATURAL JOIN behavior when no common columns exist
                    fmt.write_str(" ON TRUE")
                } else {
                    fmt.write_str(" USING (")?;
                    for (i, column) in columns.iter().enumerate() {
                        if i > 0 {
                            fmt.write_str(", ")?;
                        }
                        column.transpile(fmt)?;
                    }
                    fmt.write_char(')')?;

                    if let Some(alias) = join_using_alias {
                        fmt.write_str(" AS ")?;
                        alias.transpile(fmt)?;
                    }

                    Ok(())
                }
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
    use indoc::indoc;

    use super::*;
    use crate::store::postgres::query::{
        Alias, Expression, ForeignKeyReference, OrderByExpression, Table,
        expression::{GroupByExpression, SelectExpression, WhereExpression, WithExpression},
        statement::FromItem,
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
            JoinClause::On {
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
    fn transpile_on_join_empty_conditions() {
        assert_eq!(
            JoinClause::On {
                join: JoinType::Inner,
                from: JoinFrom::Table {
                    table: Table::OntologyIds.into(),
                    alias: None,
                },
                conditions: vec![],
            }
            .transpile_to_string(),
            r#"INNER JOIN "ontology_ids" ON TRUE"#
        );

        // Also test with LEFT OUTER JOIN to show it works with all join types
        assert_eq!(
            JoinClause::On {
                join: JoinType::LeftOuter,
                from: JoinFrom::Table {
                    table: Table::OntologyIds.into(),
                    alias: None,
                },
                conditions: vec![],
            }
            .transpile_to_string(),
            r#"LEFT OUTER JOIN "ontology_ids" ON TRUE"#
        );
    }

    #[test]
    fn transpile_using_join() {
        assert_eq!(
            JoinClause::Using {
                join: JoinType::Inner,
                from: JoinFrom::Table {
                    table: Table::OntologyIds.into(),
                    alias: None,
                },
                columns: vec![ColumnName::from(Column::OntologyIds(
                    OntologyIds::OntologyId
                ))],
                join_using_alias: None,
            }
            .transpile_to_string(),
            r#"INNER JOIN "ontology_ids" USING ("ontology_id")"#
        );

        // Multiple columns
        assert_eq!(
            JoinClause::Using {
                join: JoinType::LeftOuter,
                from: JoinFrom::Table {
                    table: Table::OntologyIds.into(),
                    alias: None,
                },
                columns: vec![
                    ColumnName::from(Column::OntologyIds(OntologyIds::BaseUrl)),
                    ColumnName::from(Column::OntologyIds(OntologyIds::Version)),
                ],
                join_using_alias: None,
            }
            .transpile_to_string(),
            r#"LEFT OUTER JOIN "ontology_ids" USING ("base_url", "version")"#
        );
    }

    #[test]
    fn transpile_using_join_with_alias() {
        use super::super::table_reference::TableName;

        assert_eq!(
            JoinClause::Using {
                join: JoinType::Inner,
                from: JoinFrom::Table {
                    table: Table::OntologyIds.into(),
                    alias: None,
                },
                columns: vec![ColumnName::from(Column::OntologyIds(
                    OntologyIds::OntologyId
                ))],
                join_using_alias: Some(TableReference {
                    schema: None,
                    name: TableName::from("joined_ids"),
                    alias: None,
                }),
            }
            .transpile_to_string(),
            r#"INNER JOIN "ontology_ids" USING ("ontology_id") AS "joined_ids""#
        );

        // Multiple columns with alias
        assert_eq!(
            JoinClause::Using {
                join: JoinType::LeftOuter,
                from: JoinFrom::Table {
                    table: Table::OntologyIds.into(),
                    alias: None,
                },
                columns: vec![
                    ColumnName::from(Column::OntologyIds(OntologyIds::BaseUrl)),
                    ColumnName::from(Column::OntologyIds(OntologyIds::Version)),
                ],
                join_using_alias: Some(TableReference {
                    schema: None,
                    name: TableName::from("versioned_ids"),
                    alias: None,
                }),
            }
            .transpile_to_string(),
            r#"LEFT OUTER JOIN "ontology_ids" USING ("base_url", "version") AS "versioned_ids""#
        );
    }

    #[test]
    fn transpile_using_join_empty_columns() {
        // Empty USING list transpiles to ON TRUE (cartesian product),
        // consistent with NATURAL JOIN when no common columns exist
        assert_eq!(
            JoinClause::Using {
                join: JoinType::Inner,
                from: JoinFrom::Table {
                    table: Table::OntologyIds.into(),
                    alias: None,
                },
                columns: vec![],
                join_using_alias: None,
            }
            .transpile_to_string(),
            r#"INNER JOIN "ontology_ids" ON TRUE"#
        );

        // Also test with LEFT OUTER JOIN
        assert_eq!(
            JoinClause::Using {
                join: JoinType::LeftOuter,
                from: JoinFrom::Table {
                    table: Table::OntologyIds.into(),
                    alias: None,
                },
                columns: vec![],
                join_using_alias: None,
            }
            .transpile_to_string(),
            r#"LEFT OUTER JOIN "ontology_ids" ON TRUE"#
        );
    }

    #[test]
    fn transpile_cross_join() {
        assert_eq!(
            JoinClause::Cross {
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
    fn transpile_lateral_subquery() {
        let subquery = SelectStatement {
            with: WithExpression::default(),
            distinct: vec![],
            selects: vec![SelectExpression::Asterisk(None)],
            from: FromItem::Table {
                table: Table::OntologyIds,
                alias: None,
            },
            joins: vec![],
            where_expression: WhereExpression::default(),
            order_by_expression: OrderByExpression::default(),
            group_by_expression: GroupByExpression::default(),
            limit: None,
        };

        // Without LATERAL
        assert_eq!(
            JoinClause::On {
                join: JoinType::LeftOuter,
                from: JoinFrom::Subquery {
                    statement: Box::new(subquery.clone()),
                    alias: Table::OntologyIds.aliased(Alias {
                        condition_index: 0,
                        chain_depth: 1,
                        number: 2,
                    }),
                    lateral: false,
                },
                conditions: vec![Condition::Equal(
                    Expression::ColumnReference(Column::DataTypes(DataTypes::OntologyId).into()),
                    Expression::ColumnReference(
                        Column::OntologyIds(OntologyIds::OntologyId).into()
                    ),
                )],
            }
            .transpile_to_string(),
            indoc! {r#"
                LEFT OUTER JOIN (SELECT *
                FROM "ontology_ids") AS "ontology_ids_0_1_2" ON "data_types"."ontology_id" = "ontology_ids"."ontology_id"
            "#}.trim()
        );

        // With LATERAL
        assert_eq!(
            JoinClause::On {
                join: JoinType::LeftOuter,
                from: JoinFrom::Subquery {
                    statement: Box::new(subquery),
                    alias: Table::OntologyIds.aliased(Alias {
                        condition_index: 0,
                        chain_depth: 1,
                        number: 2,
                    }),
                    lateral: true,
                },
                conditions: vec![Condition::Equal(
                    Expression::ColumnReference(Column::DataTypes(DataTypes::OntologyId).into()),
                    Expression::ColumnReference(
                        Column::OntologyIds(OntologyIds::OntologyId).into()
                    ),
                )],
            }
            .transpile_to_string(),
            indoc! {r#"
                LEFT OUTER JOIN LATERAL (SELECT *
                FROM "ontology_ids") AS "ontology_ids_0_1_2" ON "data_types"."ontology_id" = "ontology_ids"."ontology_id"
            "#}.trim()
        );
    }

    #[test]
    fn transpile_natural_join() {
        assert_eq!(
            JoinClause::Natural {
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
            JoinClause::Natural {
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
