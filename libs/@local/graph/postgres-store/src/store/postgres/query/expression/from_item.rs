use core::fmt::{self, Write as _};

use super::{ColumnName, Expression, Function, JoinType, TableReference, TableSample};
use crate::store::postgres::query::{SelectStatement, Transpile};

/// A FROM item in a PostgreSQL query.
///
/// Represents any source of rows in a query, including tables, subqueries, functions,
/// and joins. This enum matches PostgreSQL's `from_item` grammar, supporting both
/// simple sources and complex recursive join structures.
///
/// # Join Structure
///
/// Joins are represented recursively, where each join variant contains `left` and `right`
/// `FromItem`s. This allows representing arbitrary join trees like `(A JOIN B) JOIN (C JOIN D)`.
///
/// When building queries with multiple joins, they form a left-associative tree:
/// ```text
/// from(A).join(B).join(C)
///
/// Becomes:
///          JoinOn(C)
///         /        \
///     JoinOn(B)     C
///     /       \
///    A         B
/// ```
#[derive(Clone, PartialEq)]
pub enum FromItem<'id> {
    /// A table reference: `[ ONLY ] table_name [ AS alias [ ( column_alias [, ...] ) ] ] [
    /// TABLESAMPLE ... ]`.
    ///
    /// Transpiles to:
    /// ```sql
    /// [ ONLY ] table_name [ AS alias [ (col1, col2, ...) ] ] [ TABLESAMPLE method(percentage) [ REPEATABLE(seed) ] ]
    /// ```
    Table {
        /// Whether to query only this table, excluding inherited tables.
        ///
        /// When `true`, prevents querying child tables in table inheritance hierarchies.
        /// Transpiles to `ONLY table_name`.
        ///
        /// PostgreSQL table inheritance allows tables to inherit columns from parent tables.
        /// By default, queries on a parent table include rows from all child tables.
        /// Setting `only` to `true` restricts the query to the parent table only.
        only: bool,
        /// The base table reference.
        table: TableReference<'id>,
        /// Optional alias for the table.
        ///
        /// When `Some`, the table is referenced using this alias elsewhere in the query.
        /// When `None`, the base table reference is used directly.
        alias: Option<TableReference<'id>>,
        /// Optional column aliases to rename the table's columns.
        ///
        /// When non-empty, renames the columns in order: first column gets first alias, etc.
        /// Requires `alias` to be set - PostgreSQL syntax is `AS table_alias(col1, col2, ...)`.
        ///
        /// Transpiles to `AS alias(column1, column2, ...)`.
        ///
        /// Useful for:
        /// - Renaming columns from subqueries or functions with unclear names
        /// - Standardizing column names across different sources
        /// - Avoiding column name conflicts in complex queries
        column_alias: Vec<ColumnName<'id>>,
        /// Optional TABLESAMPLE clause for row sampling.
        ///
        /// When `Some`, applies SQL:2003 standard TABLESAMPLE sampling to select a random
        /// subset of rows from the table. Useful for quick data exploration and testing
        /// queries on large tables.
        tablesample: Option<TableSample>,
    },

    /// A subquery: `[ LATERAL ] ( SELECT ... ) [ AS alias [ ( column_alias [, ...] ) ] ]`.
    Subquery {
        /// Whether this is a LATERAL subquery.
        ///
        /// When `true`, the subquery can reference columns from preceding FROM items.
        /// Transpiles to `LATERAL (SELECT ...) AS alias`.
        ///
        /// LATERAL is particularly useful for:
        /// - Correlated subqueries that depend on values from earlier tables
        /// - Set-returning functions that need to reference preceding columns
        /// - Per-row computations that require context from other tables
        lateral: bool,
        /// The subquery SELECT statement.
        statement: Box<SelectStatement>,
        /// Optional alias for the subquery result.
        ///
        /// While PostgreSQL requires aliases for subqueries in most contexts,
        /// this is `Option` to allow construction before alias assignment.
        alias: Option<TableReference<'id>>,
        /// Optional column aliases to rename the subquery's result columns.
        ///
        /// When non-empty, renames the columns in order: first column gets first alias, etc.
        /// Requires `alias` to be set - PostgreSQL syntax is `AS alias(col1, col2, ...)`.
        ///
        /// Transpiles to `AS alias(column1, column2, ...)`.
        column_alias: Vec<ColumnName<'id>>,
    },

    /// A function call: `[ LATERAL ] function_name(...) [ WITH ORDINALITY ] [ AS alias [ (
    /// column_alias [, ...] ) ] ]`.
    ///
    /// Represents set-returning functions or table functions in the FROM clause.
    /// Common use cases include `unnest()`, `generate_series()`, and `json_to_recordset()`.
    Function {
        /// Whether this is a LATERAL function call.
        ///
        /// When `true`, the function can reference columns from preceding FROM items.
        /// Transpiles to: `LATERAL function_name(...) AS alias`.
        ///
        /// LATERAL functions are useful for:
        /// - Unnesting arrays from preceding tables
        /// - Generating rows based on values from other tables
        /// - Per-row function evaluation with access to earlier columns
        lateral: bool,
        /// The function to call.
        function: Function,
        /// Whether to add an ordinality column (row number).
        ///
        /// When `true`, adds an additional column containing the row number (1-indexed).
        /// Transpiles to: `function(...) WITH ORDINALITY`.
        ///
        /// The ordinality column is particularly useful for:
        /// - Getting the position/index of each element in set-returning functions
        /// - Tracking the order of results from array unnesting
        /// - Correlating function results with their sequence number
        ///
        /// Example: `unnest(ARRAY[10,20,30]) WITH ORDINALITY` produces:
        /// ```text
        /// unnest | ordinality
        /// --------+-----------
        ///     10 |         1
        ///     20 |         2
        ///     30 |         3
        /// ```
        with_ordinality: bool,
        /// Optional alias for the function result.
        ///
        /// Required for most set-returning functions to name the result columns.
        alias: Option<TableReference<'id>>,
        /// Optional column aliases to rename the function's result columns.
        ///
        /// When non-empty, renames the columns in order: first column gets first alias, etc.
        /// Requires `alias` to be set - PostgreSQL syntax is `AS alias(col1, col2, ...)`.
        ///
        /// Transpiles to: `AS alias(column1, column2, ...)`.
        ///
        /// When combined with `with_ordinality`, the column aliases should include both
        /// the function result columns and the ordinality column.
        column_alias: Vec<ColumnName<'id>>,
    },

    /// A JOIN with explicit ON conditions.
    ///
    /// Transpiles to:
    /// ```sql
    /// <left> <JOIN TYPE> <right> ON condition1 AND condition2
    /// ```
    ///
    /// When `condition` is empty, transpiles to `ON TRUE` (cartesian product).
    JoinOn {
        /// The left side of the join (can be any FROM item, including nested joins).
        left: Box<Self>,
        /// The type of join (INNER, LEFT OUTER, etc.).
        join_type: JoinType,
        /// The right side of the join (can be any FROM item, including nested joins).
        right: Box<Self>,
        /// Join conditions combined with AND.
        ///
        /// Multiple conditions support composite joins (e.g., multi-column foreign keys).
        /// When empty, transpiles to `ON TRUE`, producing a cartesian product.
        condition: Vec<Expression>,
    },

    /// A JOIN using a USING clause with specified column names.
    ///
    /// Transpiles to:
    /// ```sql
    /// <left> <JOIN TYPE> <right> USING (col1, col2) [ AS join_alias ]
    /// ```
    ///
    /// The USING clause specifies column names that must exist in both tables.
    /// PostgreSQL will join rows where these columns have equal values.
    /// The specified columns appear only once in the result set.
    ///
    /// When `columns` is empty, transpiles to `ON TRUE` for consistency with PostgreSQL's
    /// NATURAL JOIN behavior (which produces a cartesian product when no common columns exist).
    JoinUsing {
        /// The left side of the join.
        left: Box<Self>,
        /// The type of join (INNER, LEFT OUTER, etc.).
        join_type: JoinType,
        /// The right side of the join.
        right: Box<Self>,
        /// Column names to join on.
        ///
        /// These columns must exist in both the left and right sides.
        /// When empty, transpiles to `ON TRUE` (cartesian product).
        columns: Vec<ColumnName<'id>>,
        /// Optional alias for referencing the join columns.
        ///
        /// When present, provides a table alias that can only reference columns listed in
        /// the USING clause. This does not hide the names of the joined tables from the rest
        /// of the query, and you cannot use this alias to reference other columns.
        ///
        /// Transpiles to: `AS "join_alias"`.
        alias: Option<TableReference<'id>>,
    },

    /// A CROSS JOIN producing the cartesian product of both sides.
    ///
    /// Transpiles to: `<left> CROSS JOIN <right>`.
    ///
    /// Equivalent to `<left> INNER JOIN <right> ON TRUE`.
    CrossJoin {
        /// The left side of the cross join.
        left: Box<Self>,
        /// The right side of the cross join.
        right: Box<Self>,
    },

    /// A NATURAL JOIN implicitly using matching column names.
    ///
    /// Transpiles to: `<left> NATURAL <JOIN TYPE> <right>`.
    ///
    /// PostgreSQL automatically joins on columns with matching names in both tables.
    NaturalJoin {
        /// The left side of the natural join.
        left: Box<Self>,
        /// The type of join (INNER, LEFT OUTER, etc.).
        join_type: JoinType,
        /// The right side of the natural join.
        right: Box<Self>,
    },
}

impl fmt::Debug for FromItem<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.transpile(fmt)
    }
}

#[bon::bon]
impl<'id> FromItem<'id> {
    /// Creates a table FROM item.
    ///
    /// See [`FromItemTableBuilder`] for available options.
    #[builder(finish_fn = build, derive(Debug, Clone, Into))]
    pub const fn table(
        #[builder(start_fn, into)] table: TableReference<'id>,
        alias: Option<TableReference<'id>>,
        #[builder(default, setters(vis = "", name = "set_column_aliases"))] column_alias: Vec<
            ColumnName<'id>,
        >,
        #[builder(default)] only: bool,
        tablesample: Option<TableSample>,
    ) -> Self {
        Self::Table {
            table,
            alias,
            column_alias,
            only,
            tablesample,
        }
    }

    /// Creates a subquery FROM item.
    ///
    /// See [`FromItemSubqueryBuilder`] for available options.
    #[builder(finish_fn = build, derive(Debug, Clone, Into))]
    pub fn subquery(
        #[builder(start_fn, into)] statement: SelectStatement,
        alias: Option<TableReference<'id>>,
        #[builder(default, setters(vis = "", name = "set_column_aliases"))] column_alias: Vec<
            ColumnName<'id>,
        >,
        #[builder(default)] lateral: bool,
    ) -> Self {
        Self::Subquery {
            statement: Box::new(statement),
            alias,
            column_alias,
            lateral,
        }
    }

    /// Creates a function FROM item for set-returning functions.
    ///
    /// See [`FromItemFunctionBuilder`] for available options.
    #[builder(finish_fn = build, derive(Debug, Clone, Into))]
    pub const fn function(
        #[builder(start_fn, into)] function: Function,
        #[builder(default)] with_ordinality: bool,
        alias: Option<TableReference<'id>>,
        #[builder(default, setters(vis = "", name = "set_column_aliases"))] column_alias: Vec<
            ColumnName<'id>,
        >,
        #[builder(default)] lateral: bool,
    ) -> Self {
        Self::Function {
            function,
            with_ordinality,
            alias,
            column_alias,
            lateral,
        }
    }

    /// Joins this FROM item with another.
    ///
    /// See [`FromItemJoinBuilder`] for available options. Use [`.on()`] for ON-condition joins
    /// or [`.using()`] for USING-clause joins.
    ///
    /// [`.on()`]: FromItemJoinBuilder::on
    /// [`.using()`]: FromItemJoinBuilder::using
    #[builder(finish_fn = build, derive(Debug, Clone, Into))]
    pub fn join(
        self,
        #[builder(start_fn)] r#type: JoinType,
        #[builder(start_fn, into)] from: Self,
        #[builder(setters(vis = ""))] condition: Vec<Expression>,
        #[builder(setters(vis = ""))] join_using_alias: Option<TableReference<'id>>,
        #[builder(setters(vis = ""))] columns: Vec<ColumnName<'id>>,
    ) -> Self {
        if columns.is_empty() {
            Self::JoinOn {
                left: Box::new(self),
                join_type: r#type,
                right: Box::new(from),
                condition,
            }
        } else {
            Self::JoinUsing {
                left: Box::new(self),
                join_type: r#type,
                right: Box::new(from),
                columns,
                alias: join_using_alias,
            }
        }
    }

    /// Creates a NATURAL JOIN using matching column names.
    pub fn natural_join(self, r#type: JoinType, from: impl Into<Self>) -> Self {
        Self::NaturalJoin {
            left: Box::new(self),
            join_type: r#type,
            right: Box::new(from.into()),
        }
    }

    /// Creates a CROSS JOIN (cartesian product).
    pub fn cross_join(self, from: impl Into<Self>) -> Self {
        Self::CrossJoin {
            left: Box::new(self),
            right: Box::new(from.into()),
        }
    }

    /// Returns the table reference that can be used to reference this FROM item.
    ///
    /// For simple sources (tables, subqueries, functions), returns their alias or name.
    /// For join expressions, returns `None` as joins don't have a single reference.
    #[must_use]
    pub const fn reference_table(&self) -> Option<&TableReference<'id>> {
        match self {
            Self::Table {
                alias: Some(alias), ..
            } => Some(alias),
            Self::Table { table, .. } => Some(table),
            Self::Subquery { alias, .. } | Self::Function { alias, .. } => alias.as_ref(),
            Self::JoinOn { .. }
            | Self::JoinUsing { .. }
            | Self::CrossJoin { .. }
            | Self::NaturalJoin { .. } => None,
        }
    }

    /// Returns `true` if this FROM item is any type of join.
    ///
    /// Used to determine if parentheses are needed when this item appears
    /// as the right side of another join.
    #[must_use]
    const fn is_join(&self) -> bool {
        matches!(
            self,
            Self::JoinOn { .. }
                | Self::JoinUsing { .. }
                | Self::CrossJoin { .. }
                | Self::NaturalJoin { .. }
        )
    }

    /// Transpiles the right side of a join, adding parentheses if needed.
    fn transpile_join_right(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        if self.is_join() {
            fmt.write_char('(')?;
        }
        self.transpile(fmt)?;
        if self.is_join() {
            fmt.write_char(')')?;
        }
        Ok(())
    }

    /// Transpiles a comma-separated list of columns: `col1, col2, ...`.
    fn transpile_column_list(columns: &[ColumnName<'_>], fmt: &mut fmt::Formatter) -> fmt::Result {
        for (idx, column) in columns.iter().enumerate() {
            if idx > 0 {
                fmt.write_str(", ")?;
            }
            column.transpile(fmt)?;
        }
        Ok(())
    }

    /// Transpiles column aliases: `(col1, col2, ...)`.
    fn transpile_column_aliases(
        column_alias: &[ColumnName<'_>],
        fmt: &mut fmt::Formatter,
    ) -> fmt::Result {
        if !column_alias.is_empty() {
            fmt.write_str("(")?;
            Self::transpile_column_list(column_alias, fmt)?;
            fmt.write_char(')')?;
        }
        Ok(())
    }
}

impl Transpile for FromItem<'_> {
    #[expect(
        clippy::too_many_lines,
        reason = "Pattern match for all FromItem variants"
    )]
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Table {
                table,
                alias,
                column_alias,
                only,
                tablesample,
            } => {
                if *only {
                    fmt.write_str("ONLY ")?;
                }

                table.transpile(fmt)?;

                if let Some(alias) = alias {
                    fmt.write_str(" AS ")?;
                    alias.transpile(fmt)?;
                    Self::transpile_column_aliases(column_alias, fmt)?;
                }

                if let Some(sample) = tablesample {
                    fmt.write_char(' ')?;
                    sample.transpile(fmt)?;
                }
            }
            Self::Subquery {
                statement,
                alias,
                column_alias,
                lateral,
            } => {
                if *lateral {
                    fmt.write_str("LATERAL ")?;
                }
                fmt.write_char('(')?;
                statement.transpile(fmt)?;
                fmt.write_char(')')?;
                if let Some(alias) = alias {
                    fmt.write_str(" AS ")?;
                    alias.transpile(fmt)?;
                    Self::transpile_column_aliases(column_alias, fmt)?;
                }
            }
            Self::Function {
                function,
                with_ordinality,
                alias,
                column_alias,
                lateral,
            } => {
                if *lateral {
                    fmt.write_str("LATERAL ")?;
                }
                function.transpile(fmt)?;

                if *with_ordinality {
                    fmt.write_str(" WITH ORDINALITY")?;
                }

                if let Some(alias) = alias {
                    fmt.write_str(" AS ")?;
                    alias.transpile(fmt)?;
                    Self::transpile_column_aliases(column_alias, fmt)?;
                }
            }
            Self::JoinOn {
                left,
                join_type,
                right,
                condition: conditions,
            } => {
                left.transpile(fmt)?;
                fmt.write_char('\n')?;
                join_type.transpile(fmt)?;
                fmt.write_char(' ')?;
                right.transpile_join_right(fmt)?;
                fmt.write_str("\n  ON ")?;

                if conditions.is_empty() {
                    fmt.write_str("TRUE")?;
                } else {
                    for (i, condition) in conditions.iter().enumerate() {
                        if i > 0 {
                            fmt.write_str("\n AND ")?;
                        }
                        condition.transpile(fmt)?;
                    }
                }
            }
            Self::JoinUsing {
                left,
                join_type,
                right,
                columns,
                alias,
            } => {
                left.transpile(fmt)?;
                fmt.write_char('\n')?;
                join_type.transpile(fmt)?;
                fmt.write_char(' ')?;
                right.transpile_join_right(fmt)?;

                if columns.is_empty() {
                    // Empty USING list produces ON TRUE (cartesian product),
                    // consistent with NATURAL JOIN behavior when no common columns exist
                    fmt.write_str(" ON TRUE")?;
                } else {
                    fmt.write_str(" USING (")?;
                    Self::transpile_column_list(columns, fmt)?;
                    fmt.write_char(')')?;

                    if let Some(alias) = alias {
                        fmt.write_str(" AS ")?;
                        alias.transpile(fmt)?;
                    }
                }
            }
            Self::CrossJoin { left, right } => {
                left.transpile(fmt)?;
                fmt.write_str("\nCROSS JOIN ")?;
                right.transpile_join_right(fmt)?;
            }
            Self::NaturalJoin {
                left,
                join_type,
                right,
            } => {
                left.transpile(fmt)?;
                fmt.write_str("\nNATURAL ")?;
                join_type.transpile(fmt)?;
                fmt.write_char(' ')?;
                right.transpile_join_right(fmt)?;
            }
        }
        Ok(())
    }
}

mod from_item_join_builder_impl {
    use super::{
        FromItemJoinBuilder,
        from_item_join_builder::{
            IsSet, IsUnset, SetColumns, SetCondition, SetJoinUsingAlias, State,
        },
    };
    use crate::store::postgres::query::expression::{ColumnName, Expression, TableReference};

    impl<'id, S: State> FromItemJoinBuilder<'id, S> {
        pub fn on(
            self,
            conditions: Vec<Expression>,
        ) -> FromItemJoinBuilder<'id, SetCondition<SetColumns<S>>>
        where
            S: State<Condition: IsUnset, Columns: IsUnset>,
        {
            self.columns(Vec::new()).condition(conditions)
        }

        pub fn using(
            self,
            columns: Vec<ColumnName<'id>>,
        ) -> FromItemJoinBuilder<'id, SetCondition<SetColumns<S>>>
        where
            S: State<Condition: IsUnset, Columns: IsUnset>,
        {
            self.columns(columns).condition(Vec::new())
        }

        pub fn alias(
            self,
            alias: impl Into<TableReference<'id>>,
        ) -> FromItemJoinBuilder<'id, SetJoinUsingAlias<S>>
        where
            S: State<Columns: IsSet, JoinUsingAlias: IsUnset>,
        {
            self.join_using_alias(alias.into())
        }
    }
}

mod from_item_table_builder_impl {
    use super::{
        FromItemTableBuilder,
        from_item_table_builder::{IsSet, IsUnset, SetColumnAlias, State},
    };
    use crate::store::postgres::query::expression::ColumnName;

    impl<'id, S: State> FromItemTableBuilder<'id, S> {
        /// Add column aliases to rename the table's columns.
        ///
        /// Column aliases rename columns in order: the first alias renames the first column,
        /// the second alias renames the second column, etc.
        ///
        /// Requires that an alias has been set on the table - PostgreSQL syntax requires
        /// `AS table_alias(col1, col2, ...)`.
        pub fn column_aliases(
            self,
            columns: Vec<ColumnName<'id>>,
        ) -> FromItemTableBuilder<'id, SetColumnAlias<S>>
        where
            S: State<Alias: IsSet, ColumnAlias: IsUnset>,
        {
            self.set_column_aliases(columns)
        }
    }
}

mod from_item_subquery_builder_impl {
    use super::{
        FromItemSubqueryBuilder,
        from_item_subquery_builder::{IsSet, IsUnset, SetColumnAlias, State},
    };
    use crate::store::postgres::query::expression::ColumnName;

    impl<'id, S: State> FromItemSubqueryBuilder<'id, S> {
        /// Add column aliases to rename the subquery's result columns.
        ///
        /// Column aliases rename columns in order: the first alias renames the first column,
        /// the second alias renames the second column, etc.
        ///
        /// Requires that an alias has been set - PostgreSQL syntax requires
        /// `AS alias(col1, col2, ...)`.
        pub fn column_aliases(
            self,
            columns: Vec<ColumnName<'id>>,
        ) -> FromItemSubqueryBuilder<'id, SetColumnAlias<S>>
        where
            S: State<Alias: IsSet, ColumnAlias: IsUnset>,
        {
            self.set_column_aliases(columns)
        }
    }
}

mod from_item_function_builder_impl {
    use super::{
        FromItemFunctionBuilder,
        from_item_function_builder::{IsSet, IsUnset, SetColumnAlias, State},
    };
    use crate::store::postgres::query::expression::ColumnName;

    impl<'id, S: State> FromItemFunctionBuilder<'id, S> {
        /// Add column aliases to rename the function's result columns.
        ///
        /// Column aliases rename columns in order: the first alias renames the first column,
        /// the second alias renames the second column, etc.
        ///
        /// Requires that an alias has been set - PostgreSQL syntax requires
        /// `AS alias(col1, col2, ...)`.
        pub fn column_aliases(
            self,
            columns: Vec<ColumnName<'id>>,
        ) -> FromItemFunctionBuilder<'id, SetColumnAlias<S>>
        where
            S: State<Alias: IsSet, ColumnAlias: IsUnset>,
        {
            self.set_column_aliases(columns)
        }
    }
}

#[cfg(test)]
mod tests {
    use indoc::indoc;

    use super::*;
    use crate::store::postgres::query::{
        Alias, Expression, ForeignKeyReference, Table,
        expression::{
            SelectExpression, TableName, TableReference, identifier::Identifier,
            table_sample::SamplingMethod,
        },
        table::{Column, DataTypes, OntologyIds},
    };

    #[test]
    fn transpile_join_on() {
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

        // Build: base JOIN right
        let join = FromItem::table(Table::DataTypes.aliased(on_alias))
            .build()
            .join(
                JoinType::Inner,
                FromItem::table(Table::OntologyIds).alias(Table::OntologyIds.aliased(join_alias)),
            )
            .on(ForeignKeyReference::Single {
                on: Column::DataTypes(DataTypes::OntologyId),
                join: Column::OntologyIds(OntologyIds::OntologyId),
                join_type: JoinType::Inner,
            }
            .conditions(on_alias, join_alias))
            .build();

        assert_eq!(
            join.transpile_to_string(),
            indoc! {r#"
                "data_types_1_2_3"
                INNER JOIN "ontology_ids" AS "ontology_ids_0_1_2"
                  ON "ontology_ids_0_1_2"."ontology_id" = "data_types_1_2_3"."ontology_id"
            "#}
            .trim()
        );
    }

    #[test]
    fn transpile_join_on_empty_conditions() {
        let left = FromItem::table(Table::DataTypes).build();
        let right = FromItem::table(Table::OntologyIds).build();

        assert_eq!(
            left.clone()
                .join(JoinType::Inner, right.clone())
                .on(Vec::new())
                .build()
                .transpile_to_string(),
            indoc! {r#"
                "data_types"
                INNER JOIN "ontology_ids"
                  ON TRUE
            "#}
            .trim()
        );

        assert_eq!(
            left.join(JoinType::LeftOuter, right)
                .on(Vec::new())
                .build()
                .transpile_to_string(),
            indoc! {r#"
                "data_types"
                LEFT OUTER JOIN "ontology_ids"
                  ON TRUE
            "#}
            .trim()
        );
    }

    #[test]
    fn transpile_join_using() {
        let left = FromItem::table(Table::DataTypes).build();
        let right = FromItem::table(Table::OntologyIds).build();

        assert_eq!(
            left.clone()
                .join(JoinType::Inner, right.clone())
                .using(vec![ColumnName::from(Column::OntologyIds(
                    OntologyIds::OntologyId
                ))])
                .build()
                .transpile_to_string(),
            indoc! {r#"
                "data_types"
                INNER JOIN "ontology_ids" USING ("ontology_id")
            "#}
            .trim()
        );

        // Multiple columns
        assert_eq!(
            left.join(JoinType::LeftOuter, right)
                .using(vec![
                    ColumnName::from(Column::OntologyIds(OntologyIds::BaseUrl)),
                    ColumnName::from(Column::OntologyIds(OntologyIds::Version)),
                ])
                .build()
                .transpile_to_string(),
            indoc! {r#"
                "data_types"
                LEFT OUTER JOIN "ontology_ids" USING ("base_url", "version")
            "#}
            .trim()
        );
    }

    #[test]
    fn transpile_join_using_with_alias() {
        let left = FromItem::table(Table::DataTypes).build();
        let right = FromItem::table(Table::OntologyIds).build();

        assert_eq!(
            left.clone()
                .join(JoinType::Inner, right.clone())
                .using(vec![ColumnName::from(Column::OntologyIds(
                    OntologyIds::OntologyId
                ))])
                .alias(TableReference {
                    schema: None,
                    name: TableName::from("joined_ids"),
                    alias: None,
                })
                .build()
                .transpile_to_string(),
            indoc! {r#"
                "data_types"
                INNER JOIN "ontology_ids" USING ("ontology_id") AS "joined_ids"
            "#}
            .trim()
        );

        // Multiple columns with alias
        assert_eq!(
            left.join(JoinType::LeftOuter, right)
                .using(vec![
                    ColumnName::from(Column::OntologyIds(OntologyIds::BaseUrl)),
                    ColumnName::from(Column::OntologyIds(OntologyIds::Version)),
                ])
                .alias(TableReference {
                    schema: None,
                    name: TableName::from("versioned_ids"),
                    alias: None,
                })
                .build()
                .transpile_to_string(),
            indoc! {r#"
                "data_types"
                LEFT OUTER JOIN "ontology_ids" USING ("base_url", "version") AS "versioned_ids"
            "#}
            .trim()
        );
    }

    #[test]
    fn transpile_join_using_empty_columns() {
        let left = FromItem::table(Table::DataTypes).build();
        let right = FromItem::table(Table::OntologyIds).build();

        // Empty USING list transpiles to ON TRUE
        assert_eq!(
            left.clone()
                .join(JoinType::Inner, right.clone())
                .using(Vec::new())
                .build()
                .transpile_to_string(),
            indoc! {r#"
                "data_types"
                INNER JOIN "ontology_ids"
                  ON TRUE
            "#}
            .trim()
        );

        assert_eq!(
            left.join(JoinType::LeftOuter, right)
                .using(Vec::new())
                .build()
                .transpile_to_string(),
            indoc! {r#"
                "data_types"
                LEFT OUTER JOIN "ontology_ids"
                  ON TRUE
            "#}
            .trim()
        );
    }

    #[test]
    fn transpile_cross_join() {
        let left = FromItem::table(Table::DataTypes).build();
        let right = FromItem::table(Table::OntologyIds).build();

        assert_eq!(
            left.cross_join(right).transpile_to_string(),
            indoc! {r#"
                "data_types"
                CROSS JOIN "ontology_ids"
            "#}
            .trim()
        );
    }

    #[test]
    fn transpile_subquery_with_column_aliases() {
        let subquery = SelectStatement::builder()
            .selects(vec![SelectExpression::Asterisk(None)])
            .from(FromItem::table(Table::OntologyIds))
            .build();

        let from_item = FromItem::subquery(subquery)
            .alias(TableReference {
                schema: None,
                name: TableName::from("sub"),
                alias: None,
            })
            .column_aliases(vec![
                ColumnName::from(Identifier::from("id")),
                ColumnName::from(Identifier::from("url")),
                ColumnName::from(Identifier::from("ver")),
            ])
            .build();

        assert_eq!(
            from_item.transpile_to_string(),
            indoc! {r#"
                (SELECT *
                FROM "ontology_ids") AS "sub"("id", "url", "ver")
            "#}
            .trim()
        );
    }

    #[test]
    fn transpile_lateral_subquery() {
        let subquery = SelectStatement::builder()
            .selects(vec![SelectExpression::Asterisk(None)])
            .from(FromItem::table(Table::OntologyIds))
            .build();

        let base = FromItem::table(Table::DataTypes).build();

        let conditions = vec![Expression::equal(
            Expression::ColumnReference(Column::DataTypes(DataTypes::OntologyId).into()),
            Expression::ColumnReference(Column::OntologyIds(OntologyIds::OntologyId).into()),
        )];

        // Without LATERAL
        assert_eq!(
            base.clone()
                .join(
                    JoinType::LeftOuter,
                    FromItem::subquery(subquery.clone()).alias(Table::OntologyIds.aliased(Alias {
                        condition_index: 0,
                        chain_depth: 1,
                        number: 2,
                    }))
                )
                .on(conditions.clone())
                .build()
                .transpile_to_string(),
            indoc! {r#"
                "data_types"
                LEFT OUTER JOIN (SELECT *
                FROM "ontology_ids") AS "ontology_ids_0_1_2"
                  ON "data_types"."ontology_id" = "ontology_ids"."ontology_id"
            "#}
            .trim()
        );

        // With LATERAL
        assert_eq!(
            base.join(
                JoinType::LeftOuter,
                FromItem::subquery(subquery)
                    .alias(Table::OntologyIds.aliased(Alias {
                        condition_index: 0,
                        chain_depth: 1,
                        number: 2,
                    }))
                    .lateral(true)
            )
            .on(conditions)
            .build()
            .transpile_to_string(),
            indoc! {r#"
                "data_types"
                LEFT OUTER JOIN LATERAL (SELECT *
                FROM "ontology_ids") AS "ontology_ids_0_1_2"
                  ON "data_types"."ontology_id" = "ontology_ids"."ontology_id"
            "#}
            .trim()
        );
    }

    #[test]
    fn transpile_natural_join() {
        let left = FromItem::table(Table::DataTypes).build();
        let right = FromItem::table(Table::OntologyIds).build();

        assert_eq!(
            left.clone()
                .natural_join(JoinType::Inner, right.clone())
                .transpile_to_string(),
            indoc! {r#"
                "data_types"
                NATURAL INNER JOIN "ontology_ids"
            "#}
            .trim()
        );

        assert_eq!(
            left.clone()
                .natural_join(JoinType::LeftOuter, right.clone())
                .transpile_to_string(),
            indoc! {r#"
                "data_types"
                NATURAL LEFT OUTER JOIN "ontology_ids"
            "#}
            .trim()
        );
    }

    #[test]
    fn transpile_function() {
        // Function without alias
        assert_eq!(
            FromItem::function(Function::Unnest(Box::new(Expression::ColumnReference(
                Column::DataTypes(DataTypes::OntologyId).into()
            ),)))
            .build()
            .transpile_to_string(),
            r#"UNNEST("data_types"."ontology_id")"#
        );

        // Function with alias
        assert_eq!(
            FromItem::function(Function::Unnest(Box::new(Expression::ColumnReference(
                Column::DataTypes(DataTypes::OntologyId).into()
            ),)))
            .alias(TableReference {
                schema: None,
                name: TableName::from("ids"),
                alias: None,
            })
            .build()
            .transpile_to_string(),
            r#"UNNEST("data_types"."ontology_id") AS "ids""#
        );
    }

    #[test]
    fn transpile_function_with_column_aliases() {
        let from_item = FromItem::function(Function::Unnest(Box::new(
            Expression::ColumnReference(Column::DataTypes(DataTypes::OntologyId).into()),
        )))
        .alias(TableReference {
            schema: None,
            name: TableName::from("ids"),
            alias: None,
        })
        .column_aliases(vec![ColumnName::from(Identifier::from("id"))])
        .build();

        assert_eq!(
            from_item.transpile_to_string(),
            r#"UNNEST("data_types"."ontology_id") AS "ids"("id")"#
        );
    }

    #[test]
    fn transpile_function_with_ordinality() {
        let from_item = FromItem::function(Function::Unnest(Box::new(
            Expression::ColumnReference(Column::DataTypes(DataTypes::OntologyId).into()),
        )))
        .with_ordinality(true)
        .build();

        assert_eq!(
            from_item.transpile_to_string(),
            r#"UNNEST("data_types"."ontology_id") WITH ORDINALITY"#
        );
    }

    #[test]
    fn transpile_function_with_ordinality_and_alias() {
        let from_item = FromItem::function(Function::Unnest(Box::new(
            Expression::ColumnReference(Column::DataTypes(DataTypes::OntologyId).into()),
        )))
        .with_ordinality(true)
        .alias(TableReference {
            schema: None,
            name: TableName::from("t"),
            alias: None,
        })
        .column_aliases(vec![
            ColumnName::from(Identifier::from("val")),
            ColumnName::from(Identifier::from("ord")),
        ])
        .build();

        assert_eq!(
            from_item.transpile_to_string(),
            r#"UNNEST("data_types"."ontology_id") WITH ORDINALITY AS "t"("val", "ord")"#
        );
    }

    #[test]
    fn transpile_lateral_function() {
        let base = FromItem::table(Table::DataTypes).build();

        // LATERAL function in a join
        assert_eq!(
            base.join(
                JoinType::LeftOuter,
                FromItem::function(Function::Unnest(Box::new(Expression::ColumnReference(
                    Column::DataTypes(DataTypes::OntologyId).into(),
                ))))
                .alias(TableReference {
                    schema: None,
                    name: TableName::from("unnested_ids"),
                    alias: None,
                })
                .lateral(true)
            )
            .on(Vec::new())
            .build()
            .transpile_to_string(),
            indoc! {r#"
                "data_types"
                LEFT OUTER JOIN LATERAL UNNEST("data_types"."ontology_id") AS "unnested_ids"
                  ON TRUE
            "#}
            .trim()
        );
    }

    #[test]
    fn reference_table_returns_alias_when_present() {
        let table_ref: TableReference = Table::OntologyIds.into();
        let alias_ref = TableReference {
            alias: Some(Alias {
                condition_index: 0,
                chain_depth: 1,
                number: 2,
            }),
            ..table_ref.clone()
        };

        let from_item = FromItem::table(table_ref).alias(alias_ref.clone()).build();

        assert_eq!(from_item.reference_table(), Some(&alias_ref));
    }

    #[test]
    fn reference_table_returns_table_when_no_alias() {
        let table_ref: TableReference = Table::OntologyIds.into();

        let from_item = FromItem::table(table_ref.clone()).build();

        assert_eq!(from_item.reference_table(), Some(&table_ref));
    }

    #[test]
    fn reference_table_returns_alias_for_function() {
        let alias_ref = TableReference {
            schema: None,
            name: TableName::from("fn_result"),
            alias: None,
        };

        // Function with alias
        assert_eq!(
            FromItem::function(Function::Now)
                .alias(alias_ref.clone())
                .build()
                .reference_table(),
            Some(&alias_ref)
        );

        // Function without alias
        assert_eq!(
            FromItem::function(Function::Now).build().reference_table(),
            None
        );
    }

    #[test]
    fn reference_table_returns_alias_for_subquery() {
        let alias_ref = TableReference {
            schema: None,
            name: TableName::from("sub"),
            alias: None,
        };

        let subquery = SelectStatement::builder()
            .selects(vec![SelectExpression::Asterisk(None)])
            .from(FromItem::table(Table::OntologyIds))
            .build();

        // Subquery with alias
        assert_eq!(
            FromItem::subquery(subquery.clone())
                .alias(alias_ref.clone())
                .build()
                .reference_table(),
            Some(&alias_ref)
        );

        // Subquery without alias
        assert_eq!(FromItem::subquery(subquery).build().reference_table(), None);
    }

    #[test]
    fn reference_table_returns_none_for_joins() {
        let left = FromItem::table(Table::DataTypes).build();
        let right = FromItem::table(Table::OntologyIds).build();

        assert_eq!(
            left.clone()
                .join(JoinType::Inner, right.clone())
                .on(Vec::new())
                .build()
                .reference_table(),
            None
        );

        assert_eq!(
            left.join(JoinType::Inner, right)
                .on(Vec::new())
                .build()
                .reference_table(),
            None
        );
    }

    #[test]
    #[expect(
        clippy::many_single_char_names,
        reason = "Test uses single-letter table names for clarity"
    )]
    #[expect(
        clippy::similar_names,
        reason = "Test requires similar join variable names"
    )]
    #[expect(
        clippy::min_ident_chars,
        reason = "Single-letter table names are clearer in test"
    )]
    fn transpile_nested_joins_with_parentheses() {
        // Build: A JOIN B JOIN (C JOIN D JOIN E)
        // This tests that nested joins on the right side get parentheses
        let a = FromItem::table(TableReference {
            schema: None,
            name: TableName::from("a"),
            alias: None,
        })
        .build();
        let b = FromItem::table(TableReference {
            schema: None,
            name: TableName::from("b"),
            alias: None,
        })
        .build();
        let c = FromItem::table(TableReference {
            schema: None,
            name: TableName::from("c"),
            alias: None,
        })
        .build();
        let d: FromItem<'_> = FromItem::table(TableReference {
            schema: None,
            name: TableName::from("d"),
            alias: None,
        })
        .build();
        let e = FromItem::table(TableReference {
            schema: None,
            name: TableName::from("e"),
            alias: None,
        })
        .build();

        // Build: A JOIN B
        let ab_join = a.join(JoinType::Inner, b).on(Vec::new()).build();

        // Build: C JOIN D JOIN E
        let cd_join = c.join(JoinType::Inner, d).on(Vec::new()).build();
        let cde_join = cd_join.join(JoinType::Inner, e).on(Vec::new()).build();

        // Build: (A JOIN B) JOIN (C JOIN D JOIN E)
        let full_join = ab_join
            .join(JoinType::Inner, cde_join)
            .on(Vec::new())
            .build();

        let expected = indoc! {r#"
            "a"
            INNER JOIN "b"
              ON TRUE
            INNER JOIN ("c"
            INNER JOIN "d"
              ON TRUE
            INNER JOIN "e"
              ON TRUE)
              ON TRUE
        "#}
        .trim();

        assert_eq!(full_join.transpile_to_string(), expected);
    }

    #[test]
    fn transpile_table_with_only() {
        let from_item = FromItem::table(Table::DataTypes).only(true).build();

        assert_eq!(from_item.transpile_to_string(), r#"ONLY "data_types""#);
    }

    #[test]
    fn transpile_table_with_only_and_alias() {
        let from_item = FromItem::table(Table::DataTypes)
            .only(true)
            .alias(Table::DataTypes.aliased(Alias {
                condition_index: 0,
                chain_depth: 1,
                number: 2,
            }))
            .build();

        assert_eq!(
            from_item.transpile_to_string(),
            r#"ONLY "data_types" AS "data_types_0_1_2""#
        );
    }

    #[test]
    fn transpile_table_with_column_aliases() {
        let from_item = FromItem::table(Table::DataTypes)
            .alias(TableReference {
                schema: None,
                name: TableName::from("dt"),
                alias: None,
            })
            .column_aliases(vec![
                ColumnName::from(Identifier::from("id")),
                ColumnName::from(Identifier::from("name")),
                ColumnName::from(Identifier::from("url")),
            ])
            .build();

        assert_eq!(
            from_item.transpile_to_string(),
            r#""data_types" AS "dt"("id", "name", "url")"#
        );
    }

    #[test]
    fn transpile_table_with_alias_but_no_column_aliases() {
        let from_item = FromItem::table(Table::DataTypes)
            .alias(TableReference {
                schema: None,
                name: TableName::from("dt"),
                alias: None,
            })
            .build();

        assert_eq!(from_item.transpile_to_string(), r#""data_types" AS "dt""#);
    }

    #[test]
    fn transpile_table_with_tablesample() {
        let from_item = FromItem::table(Table::DataTypes)
            .tablesample(TableSample {
                method: SamplingMethod::Bernoulli,
                percentage: 10.0,
                repeatable_seed: None,
            })
            .build();

        assert_eq!(
            from_item.transpile_to_string(),
            r#""data_types" TABLESAMPLE BERNOULLI(10)"#
        );
    }

    #[test]
    fn transpile_table_with_alias_and_tablesample() {
        let from_item = FromItem::table(Table::DataTypes)
            .tablesample(TableSample {
                method: SamplingMethod::System,
                percentage: 5.0,
                repeatable_seed: Some(42),
            })
            .alias(Table::DataTypes.aliased(Alias {
                condition_index: 0,
                chain_depth: 1,
                number: 2,
            }))
            .build();

        assert_eq!(
            from_item.transpile_to_string(),
            r#""data_types" AS "data_types_0_1_2" TABLESAMPLE SYSTEM(5) REPEATABLE(42)"#
        );
    }
}
