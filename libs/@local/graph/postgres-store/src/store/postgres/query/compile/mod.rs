#[cfg(test)]
mod tests;

use alloc::borrow::Cow;
use core::iter::once;
use std::collections::{HashMap, HashSet};

use error_stack::{Report, bail, ensure};
use hash_graph_store::{
    filter::{
        Filter, FilterExpression, FilterExpressionList, Parameter, ParameterList, ParameterType,
        PathToken, QueryRecord, protection::PropertyProtectionFilter,
    },
    query::{NullOrdering, Ordering},
    subgraph::temporal_axes::QueryTemporalAxes,
};
use hash_graph_temporal_versioning::TimeAxis;
use postgres_types::ToSql;
use tracing::instrument;
use type_system::knowledge::Entity;

use super::ast::{
    ColumnName, ColumnReference, JoinType, Materialization, TableName, TableReference,
};
use crate::store::postgres::query::{
    Alias, Column, CommonTableExpression, EqualityOperator, Expression, FromItem, Function,
    GroupByClause, GroupingElement, Identifier, NonEmptyVec, NullsOrder, OrderByClause,
    PostgresQueryPath, PostgresRecord, SelectExpression, SelectQuantifier, SelectStatement,
    SimpleSelect, SortBy, SortDirection, Table, Transpile as _, WindowDefinition, WithClause,
    postgres_type::PostgresType,
    table::{
        DataTypeEmbeddings, EntityEditions, EntityEmbeddings, EntityTemporalMetadata,
        EntityTypeEmbeddings, EntityTypes, FilterColumn as _, JsonField, OntologyIds,
        OntologyTemporalMetadata, PropertyTypeEmbeddings,
    },
};

// # Lifetime guidance
// - 'c relates to the lifetime of the `SelectCompiler` (most constrained by the SelectStatement)
// - 'p relates to the lifetime of the parameters, should be the longest living as they have to
//   outlive the transpiling process

pub struct AppliedFilters {
    draft: bool,
    temporal_axes: bool,
}

pub struct TableInfo<'p> {
    tables: HashSet<TableReference<'p>>,
    pinned_timestamp_index: Option<usize>,
    variable_interval_index: Option<usize>,
}

pub struct CompilerArtifacts<'p> {
    parameters: Vec<&'p (dyn ToSql + Sync)>,
    condition_index: usize,
    joins: Vec<CompiledJoin>,
    table_info: TableInfo<'p>,
    cursor_disallowed_reason: Option<&'static str>,
    has_to_many_join: bool,
    /// Set once an embeddings distance subquery is installed; a statement supports only one.
    has_embeddings_filter: bool,
}

struct PathSelection {
    column: Expression,
    index: usize,
    distinctness: Distinctness,
    ordering: Option<(Ordering, Option<NullOrdering>)>,
}

/// The boolean connective of a [`Filter`] group.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FilterGroup {
    /// Members are AND-combined.
    All,
    /// Members are OR-combined.
    Any,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Distinctness {
    Indistinct,
    Distinct,
}

/// How [`SelectCompiler::compile`] lays out the statement.
///
/// Both keys-first shapes filter, sort, and limit a narrow key set in CTEs and hydrate the
/// wide projection only for the surviving rows. They fall back to [`SinglePass`] for every
/// [`ShapeFallback`] reason; the fallback is logged, since it silently loses the shape the
/// caller opted into.
///
/// Callers opting into a keys-first shape vouch for two preconditions the compiler cannot
/// check. `INNER` hydration joins must always match their key row (foreign-key-total joins
/// do), and the key query must produce at most one row per `DISTINCT ON` group. Both hold
/// for the entity read path, whose distinct key pins all row-multiplying columns. Violating
/// either returns short or shifted pages compared to [`SinglePass`].
///
/// [`SinglePass`]: Self::SinglePass
#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
pub enum StatementShape {
    /// One flat `SELECT` over all joins.
    #[default]
    SinglePass,
    /// The keys-first split with the planner left free.
    ///
    /// The CTEs stay inlinable, so the planner may serve the ordering demand from an index
    /// and abort early. A misestimated filter can still bait it into an ordered scan that
    /// never fills the limit.
    KeysFirst,
    /// The keys-first split behind a `MATERIALIZED` fence.
    ///
    /// The materialization fences the planner: the key query is planned without the outer
    /// ordering demand, which prevents ordered-pipeline bets built on unreliable row
    /// estimates. In exchange the whole filtered set is computed, no matter how early an
    /// index could have stopped.
    FencedKeysFirst,
}

/// Why a keys-first [`StatementShape`] degraded to a single-pass statement.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum ShapeFallback {
    /// Without a limit the planner never bets on an ordered pipeline, so there is nothing to
    /// fence off.
    Unlimited,
    /// Without sort keys there is no ordering demand to fence off.
    Unsorted,
    /// An asterisk select cannot be split into key and hydration columns.
    AsteriskSelect,
    /// A subquery expression may reference tables invisibly to the classifier.
    OpaqueExpression,
    /// A fanning-out join inside the key query would eat into `LIMIT n` with duplicates.
    ToManyKeyJoin,
    /// A right or full outer hydration join would generate rows the key query never saw,
    /// which the missing `WHERE` clause of the hydration statement cannot filter out again.
    GeneratingHydrationJoin,
    /// The statement reads nothing from the key query, leaving the CTE without columns.
    NoKeyColumns,
}

/// A join collected during compilation. The `FROM` tree is assembled from these records in
/// [`SelectCompiler::compile`], so the compiler can reuse joins and allocate fresh alias
/// numbers without reading a statement tree back.
struct CompiledJoin {
    table: Table,
    alias: Alias,
    join_type: JoinType,
    source: JoinSource,
    conditions: Vec<Expression>,
    /// Whether any relation using this join can fan out the driving rows.
    ///
    /// Unlike [`CompilerArtifacts::has_to_many_join`], which is tracked per relation, this
    /// marks the individual joins so they can be classified separately.
    to_many: bool,
}

impl CompiledJoin {
    /// The `FROM` item this join scans, aliased as [`table`](Self::table) at
    /// [`alias`](Self::alias).
    fn source_item(&self) -> FromItem<'static> {
        let alias = self.table.aliased_name(self.alias);
        match &self.source {
            JoinSource::Table => FromItem::table(self.table).alias(alias).build(),
            JoinSource::Subquery(statement) => FromItem::subquery((**statement).clone())
                .alias(alias)
                .build(),
        }
    }
}

/// What a [`CompiledJoin`] scans.
enum JoinSource {
    /// The aliased [`table`](CompiledJoin::table) itself.
    Table,
    /// A derived table standing in for the plain table. The embeddings distance filter swaps
    /// its join over to the aggregated distance subquery.
    Subquery(Box<SelectStatement>),
}

/// One keyset-pagination sort key.
struct CursorKey {
    expression: Expression,
    /// The cursor value to continue after; `None` encodes a `NULL` cursor entry.
    value: Option<Expression>,
    ordering: Ordering,
    nulls: Option<NullOrdering>,
    /// Whether the key is provably `NOT NULL`, allowing the null-handling arms to be skipped.
    non_null: bool,
}

impl From<Ordering> for SortDirection {
    fn from(ordering: Ordering) -> Self {
        match ordering {
            Ordering::Ascending => Self::Ascending,
            Ordering::Descending => Self::Descending,
        }
    }
}

impl From<NullOrdering> for NullsOrder {
    fn from(ordering: NullOrdering) -> Self {
        match ordering {
            NullOrdering::First => Self::First,
            NullOrdering::Last => Self::Last,
        }
    }
}

/// Collects the table names referenced by `expression` into `tables`.
///
/// Sets `opaque` when the expression contains a subquery, whose references stay invisible to
/// [`Expression::visit`].
fn collect_referenced_tables(
    expression: &Expression,
    tables: &mut HashSet<TableName<'static>>,
    opaque: &mut bool,
) {
    expression.visit(&mut |node| {
        if let Expression::ColumnReference(column) = node
            && let Some(correlation) = &column.correlation
        {
            tables.insert(correlation.name.clone());
        }
        if matches!(node, Expression::Select(_)) {
            *opaque = true;
        }
    });
}

/// Collects the columns `expression` reads from any of the `key_tables`, deduplicated and in
/// first-seen order.
///
/// Sets `opaque` when the expression contains a subquery, whose references stay invisible to
/// [`Expression::visit`].
fn collect_key_columns(
    expression: &Expression,
    key_tables: &HashSet<TableName<'static>>,
    columns: &mut Vec<(TableName<'static>, ColumnName<'static>)>,
    seen: &mut HashSet<(TableName<'static>, ColumnName<'static>)>,
    opaque: &mut bool,
) {
    expression.visit(&mut |node| {
        if let Expression::ColumnReference(column) = node
            && let Some(correlation) = &column.correlation
            && key_tables.contains(&correlation.name)
        {
            let key = (correlation.name.clone(), column.name.clone());
            if seen.insert(key.clone()) {
                columns.push(key);
            }
        }
        if matches!(node, Expression::Select(_)) {
            *opaque = true;
        }
    });
}

/// The join split for the keys-first [`StatementShape`]s.
struct KeyQueryPartition<'j> {
    /// The joins the key query filters and sorts through, in creation order.
    key_joins: Vec<&'j CompiledJoin>,
    /// The joins the hydration statement re-applies to the page, in creation order.
    hydrated_joins: Vec<&'j CompiledJoin>,
    /// The aliased names of the base table and every key-query join.
    tables: HashSet<TableName<'static>>,
}

/// Rewrites references to key-query tables into references to the key query's output columns.
struct KeyColumnRewriter<'r> {
    tables: &'r HashSet<TableName<'static>>,
    /// Output column name per key-query source column.
    outputs: HashMap<(TableName<'static>, ColumnName<'static>), ColumnName<'static>>,
}

impl<'r> KeyColumnRewriter<'r> {
    /// Assigns each key column its natural name. Every column name shared between source
    /// tables gets prefixed with its aliased table name instead.
    fn new(
        tables: &'r HashSet<TableName<'static>>,
        key_columns: &[(TableName<'static>, ColumnName<'static>)],
    ) -> Self {
        let mut name_users = HashMap::<&ColumnName<'static>, usize>::new();
        for (_, column) in key_columns {
            *name_users.entry(column).or_default() += 1;
        }
        Self {
            tables,
            outputs: key_columns
                .iter()
                .map(|(table, column)| {
                    let output = if name_users.get(column).is_some_and(|users| *users > 1) {
                        ColumnName::from(format!("{}_{}", table.as_str(), column.as_str()))
                    } else {
                        column.clone()
                    };
                    ((table.clone(), column.clone()), output)
                })
                .collect(),
        }
    }

    /// The output column name assigned to a key-query source column.
    fn output(
        &self,
        table: &TableName<'static>,
        column: &ColumnName<'static>,
    ) -> &ColumnName<'static> {
        self.outputs
            .get(&(table.clone(), column.clone()))
            .expect("every key-table column is collected before it is rewritten")
    }

    /// Replaces every reference to a key-query table with a reference to the corresponding
    /// output column, qualified with `target` (or bare when `target` is [`None`]).
    fn rewrite(&self, expression: &Expression, target: Option<&TableName<'static>>) -> Expression {
        let mut expression = expression.clone();
        expression.visit_mut(&mut |node| {
            if let Expression::ColumnReference(column) = node
                && let Some(correlation) = &column.correlation
                && self.tables.contains(&correlation.name)
            {
                column.name = self.output(&correlation.name, &column.name).clone();
                column.correlation = target.cloned().map(TableReference::from);
            }
        });
        expression
    }
}

type TableHook<'p, 'q, T> = fn(&mut SelectCompiler<'p, 'q, T>, Alias) -> Vec<Expression>;
type ColumnHook<'p, 'q, T> = fn(&mut SelectCompiler<'p, 'q, T>, Expression) -> Expression;

pub struct SelectCompiler<'p, 'q: 'p, T: QueryRecord> {
    shape: StatementShape,
    distinct_on: Vec<Expression>,
    selects: Vec<SelectExpression>,
    with: Option<WithClause>,
    conditions: Vec<Expression>,
    cursor: Vec<CursorKey>,
    sort_by: Vec<SortBy>,
    limit: Option<usize>,
    artifacts: CompilerArtifacts<'p>,
    temporal_axes: Option<&'p QueryTemporalAxes>,
    include_drafts: bool,
    table_hooks: HashMap<TableName<'p>, TableHook<'p, 'q, T>>,
    column_hooks: HashMap<Column, ColumnHook<'p, 'q, T>>,
    selections: HashMap<&'p T::QueryPath<'q>, PathSelection>,
    /// Optional property protection filter for Entity queries (lazy evaluation).
    /// Parameters are only bound when Properties/PropertyMetadata columns are actually selected.
    property_protection_filter: Option<&'p PropertyProtectionFilter<'p, 'q>>,
    /// Cached masking expression (built lazily on first use).
    property_keys_to_remove: Option<Expression>,
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum SelectCompilerError {
    #[display("Cannot convert parameter for distance function")]
    ConvertDistanceParameter,
    #[display("Only a single embedding filter is allowed per statement")]
    MultipleEmbeddings,
    #[display("Only embeddings are supported for cosine distance")]
    UnsupportedEmbeddingPath,
    #[display(
        "Cosine distance is only supported with exactly one `path` and one `parameter` expression."
    )]
    UnsupportedDistanceExpression,
    #[display("Cannot add a cursor: {reason}")]
    CursorDisallowed { reason: &'static str },
    #[display("Parameters with a pending conversion cannot be compiled")]
    PendingParameterConversion,
    #[display("String operations are not supported on paths backed by materialized array columns")]
    UnsupportedTextArrayOperation,
}

impl<'p, 'q: 'p, R: PostgresRecord> SelectCompiler<'p, 'q, R> {
    /// Creates a new, empty compiler.
    pub fn new(temporal_axes: Option<&'p QueryTemporalAxes>, include_drafts: bool) -> Self {
        let mut table_hooks = HashMap::<_, TableHook<'p, 'q, R>>::new();

        if temporal_axes.is_some() {
            table_hooks.insert(
                TableName::from(Table::OntologyTemporalMetadata),
                Self::ontology_table_conditions,
            );
        }
        if temporal_axes.is_some() || !include_drafts {
            table_hooks.insert(
                TableName::from(Table::EntityTemporalMetadata),
                Self::temporal_metadata_conditions,
            );
        }

        Self {
            shape: StatementShape::default(),
            distinct_on: Vec::new(),
            selects: Vec::new(),
            with: None,
            conditions: Vec::new(),
            cursor: Vec::new(),
            sort_by: Vec::new(),
            limit: None,
            artifacts: CompilerArtifacts {
                parameters: Vec::new(),
                condition_index: 0,
                joins: Vec::new(),
                table_info: TableInfo {
                    tables: HashSet::new(),
                    pinned_timestamp_index: None,
                    variable_interval_index: None,
                },
                cursor_disallowed_reason: None,
                has_to_many_join: false,
                has_embeddings_filter: false,
            },
            temporal_axes,
            table_hooks,
            column_hooks: HashMap::new(),
            include_drafts,
            selections: HashMap::new(),
            property_protection_filter: None,
            property_keys_to_remove: None,
        }
    }

    /// Creates a new compiler, which will select everything using the asterisk (`*`).
    #[must_use]
    pub fn with_asterisk(
        temporal_axes: Option<&'p QueryTemporalAxes>,
        include_drafts: bool,
    ) -> Self {
        let mut default = Self::new(temporal_axes, include_drafts);
        default.selects.push(SelectExpression::Asterisk(None));
        default
    }

    pub const fn set_limit(&mut self, limit: usize) {
        self.limit = Some(limit);
    }

    /// Requests a statement layout, see [`StatementShape`] for the semantics and the
    /// preconditions callers vouch for.
    pub const fn set_statement_shape(&mut self, shape: StatementShape) {
        self.shape = shape;
    }

    fn time_index(&mut self, temporal_axes: &'p QueryTemporalAxes, time_axis: TimeAxis) -> usize {
        match (temporal_axes, time_axis) {
            (QueryTemporalAxes::TransactionTime { pinned, .. }, TimeAxis::DecisionTime) => *self
                .artifacts
                .table_info
                .pinned_timestamp_index
                .get_or_insert_with(|| {
                    self.artifacts.parameters.push(&pinned.timestamp);
                    self.artifacts.parameters.len()
                }),
            (QueryTemporalAxes::DecisionTime { pinned, .. }, TimeAxis::TransactionTime) => *self
                .artifacts
                .table_info
                .pinned_timestamp_index
                .get_or_insert_with(|| {
                    self.artifacts.parameters.push(&pinned.timestamp);
                    self.artifacts.parameters.len()
                }),
            (QueryTemporalAxes::TransactionTime { variable, .. }, TimeAxis::TransactionTime) => {
                *self
                    .artifacts
                    .table_info
                    .variable_interval_index
                    .get_or_insert_with(|| {
                        self.artifacts.parameters.push(&variable.interval);
                        self.artifacts.parameters.len()
                    })
            }
            (QueryTemporalAxes::DecisionTime { variable, .. }, TimeAxis::DecisionTime) => *self
                .artifacts
                .table_info
                .variable_interval_index
                .get_or_insert_with(|| {
                    self.artifacts.parameters.push(&variable.interval);
                    self.artifacts.parameters.len()
                }),
        }
    }

    fn ontology_table_conditions(&mut self, alias: Alias) -> Vec<Expression> {
        let table = Table::OntologyTemporalMetadata.aliased(alias);
        if let Some(temporal_axes) = self.temporal_axes
            && self.artifacts.table_info.tables.insert(table)
        {
            let transaction_time_index = self.time_index(temporal_axes, TimeAxis::TransactionTime);
            match temporal_axes {
                QueryTemporalAxes::DecisionTime { .. } => {
                    vec![Expression::time_interval_contains_timestamp(
                        Expression::ColumnReference(
                            Column::OntologyTemporalMetadata(
                                OntologyTemporalMetadata::TransactionTime,
                            )
                            .aliased(alias),
                        ),
                        Expression::Parameter(transaction_time_index),
                    )]
                }
                QueryTemporalAxes::TransactionTime { .. } => {
                    vec![Expression::overlap(
                        Expression::ColumnReference(
                            Column::OntologyTemporalMetadata(
                                OntologyTemporalMetadata::TransactionTime,
                            )
                            .aliased(alias),
                        ),
                        Expression::Parameter(transaction_time_index),
                    )]
                }
            }
        } else {
            Vec::new()
        }
    }

    fn temporal_metadata_conditions(&mut self, alias: Alias) -> Vec<Expression> {
        let mut conditions = Vec::new();
        let table = Table::EntityTemporalMetadata.aliased(alias);
        if self.artifacts.table_info.tables.insert(table.clone()) {
            if !self.include_drafts {
                conditions.push(Expression::is_null(Expression::ColumnReference(
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::DraftId).aliased(alias),
                )));
            }

            if let Some(temporal_axes) = self.temporal_axes {
                let pinned_axis = temporal_axes.pinned_time_axis();
                let variable_axis = temporal_axes.variable_time_axis();
                let pinned_time_index = self.time_index(temporal_axes, pinned_axis);
                let variable_time_index = self.time_index(temporal_axes, variable_axis);

                // Adds the pinned timestamp condition, so for the projected decision time, we use
                // the transaction time and vice versa.
                conditions.extend([
                    Expression::time_interval_contains_timestamp(
                        Expression::ColumnReference(
                            Column::EntityTemporalMetadata(EntityTemporalMetadata::from_time_axis(
                                pinned_axis,
                            ))
                            .aliased(alias),
                        ),
                        Expression::Parameter(pinned_time_index),
                    ),
                    Expression::overlap(
                        Expression::ColumnReference(
                            Column::EntityTemporalMetadata(EntityTemporalMetadata::from_time_axis(
                                variable_axis,
                            ))
                            .aliased(alias),
                        ),
                        Expression::Parameter(variable_time_index),
                    ),
                ]);
            }
        }
        conditions
    }

    /// Adds a new path to the selection.
    ///
    /// Optionally, the added selection can be distinct or ordered by providing [`Distinctness`]
    /// and [`Ordering`].
    #[instrument(level = "debug", skip_all)]
    pub fn add_selection_path(&mut self, path: &'p R::QueryPath<'q>) -> usize
    where
        R::QueryPath<'q>: PostgresQueryPath,
    {
        self.add_distinct_selection_with_ordering(path, Distinctness::Indistinct, None)
    }

    /// Adds a new path to the selection.
    ///
    /// Optionally, the added selection can be distinct or ordered by providing [`Distinctness`]
    /// and [`Ordering`].
    #[instrument(level = "debug", skip_all)]
    pub fn add_distinct_selection_with_ordering(
        &mut self,
        path: &'p R::QueryPath<'q>,
        distinctness: Distinctness,
        ordering: Option<(Ordering, Option<NullOrdering>)>,
    ) -> usize
    where
        R::QueryPath<'q>: PostgresQueryPath,
    {
        if let Some(stored) = self.selections.get_mut(path) {
            if distinctness == Distinctness::Distinct
                && stored.distinctness == Distinctness::Indistinct
            {
                self.distinct_on.push(stored.column.clone());
                stored.distinctness = Distinctness::Distinct;
            }
            if stored.ordering.is_none()
                && let Some((ordering, nulls)) = ordering
            {
                self.sort_by.push(
                    SortBy::builder()
                        .expression(stored.column.clone())
                        .direction(ordering.into())
                        .maybe_nulls(nulls.map(Into::into))
                        .build(),
                );
                stored.ordering = Some((ordering, nulls));
            }
            stored.index
        } else {
            let expression = self.compile_path_column(path);
            self.selects.push(SelectExpression::Expression {
                expression: expression.clone(),
                output_name: None,
            });

            if distinctness == Distinctness::Distinct {
                self.distinct_on.push(expression.clone());
            }
            if let Some((ordering, nulls)) = ordering {
                self.sort_by.push(
                    SortBy::builder()
                        .expression(expression.clone())
                        .direction(ordering.into())
                        .maybe_nulls(nulls.map(Into::into))
                        .build(),
                );
            }

            let index = self.selects.len() - 1;
            self.selections.insert(
                path,
                PathSelection {
                    column: expression,
                    index,
                    distinctness,
                    ordering,
                },
            );
            index
        }
    }

    /// Adds a new path to the selection which can be used as cursor.
    ///
    /// # Errors
    ///
    /// Returns an error if cursors are disallowed due to other query constraints.
    #[instrument(level = "debug", skip_all)]
    pub fn add_cursor_selection(
        &mut self,
        path: &'p R::QueryPath<'q>,
        lhs: impl FnOnce(Expression) -> Expression,
        rhs: Option<Expression>,
        ordering: Ordering,
        null_ordering: Option<NullOrdering>,
    ) -> Result<usize, Report<SelectCompilerError>>
    where
        R::QueryPath<'q>: PostgresQueryPath,
    {
        if let Some(reason) = self.artifacts.cursor_disallowed_reason {
            bail!(SelectCompilerError::CursorDisallowed { reason });
        }
        // JSON-extracted keys are always nullable; plain columns consult the schema whitelist.
        let (terminating_column, json_field) = path.terminating_column();
        let non_null = json_field.is_none() && terminating_column.is_non_null();
        let column = self.compile_path_column(path);
        self.cursor.push(CursorKey {
            expression: lhs(column),
            value: rhs,
            ordering,
            nulls: null_ordering,
            non_null,
        });
        Ok(self.add_distinct_selection_with_ordering(
            path,
            Distinctness::Distinct,
            Some((ordering, null_ordering)),
        ))
    }

    /// Adds a new filter to the selection.
    ///
    /// # Errors
    ///
    /// Returns an error if the filter compilation fails.
    #[instrument(level = "info", skip_all)]
    pub fn add_filter<'f: 'q>(
        &mut self,
        filter: &'p Filter<'f, R>,
    ) -> Result<(), Report<SelectCompilerError>>
    where
        R::QueryPath<'f>: PostgresQueryPath,
    {
        let condition = self.compile_filter(filter)?;
        self.artifacts.condition_index += 1;
        self.conditions.push(condition);
        Ok(())
    }

    /// Transpiles the statement into SQL and the parameter to be passed to a prepared statement.
    ///
    /// Records the effective [`StatementShape`] on the span as `statement.shape`, which is the
    /// place to check whether a fence request actually engaged.
    #[instrument(
        level = "info",
        skip_all,
        fields(statement.shape = tracing::field::Empty)
    )]
    pub fn compile(&self) -> (String, &[&'p (dyn ToSql + Sync)]) {
        let statement = match self.shape {
            StatementShape::SinglePass => {
                tracing::Span::current().record("statement.shape", "single_pass");
                self.single_pass_statement()
            }
            StatementShape::KeysFirst => self.keys_first_or_fallback("keys_first", None),
            StatementShape::FencedKeysFirst => self
                .keys_first_or_fallback("fenced_keys_first", Some(Materialization::Materialized)),
        };
        (statement.transpile_to_string(), &self.artifacts.parameters)
    }

    /// Compiles the keys-first split, degrading to the single-pass layout with a logged
    /// reason when the statement does not qualify.
    fn keys_first_or_fallback(
        &self,
        shape: &'static str,
        materialization: Option<Materialization>,
    ) -> SelectStatement {
        match self.fetch_keys_then_hydrate_statement(materialization) {
            Ok(statement) => {
                tracing::Span::current().record("statement.shape", shape);
                statement
            }
            Err(fallback) => {
                tracing::Span::current().record("statement.shape", "single_pass");
                // An unpaged statement simply has nothing to split. Every other reason
                // silently loses the shape the caller opted into and deserves a warning.
                match fallback {
                    ShapeFallback::Unlimited | ShapeFallback::Unsorted => {
                        tracing::debug!(?fallback, "compiling a single-pass statement");
                    }
                    ShapeFallback::AsteriskSelect
                    | ShapeFallback::OpaqueExpression
                    | ShapeFallback::ToManyKeyJoin
                    | ShapeFallback::GeneratingHydrationJoin
                    | ShapeFallback::NoKeyColumns => {
                        tracing::warn!(?fallback, "falling back to a single-pass statement");
                    }
                }
                self.single_pass_statement()
            }
        }
    }

    /// Lays out the statement as one flat `SELECT` over all joins.
    fn single_pass_statement(&self) -> SelectStatement {
        let simple = SimpleSelect::builder()
            .maybe_quantifier(
                NonEmptyVec::try_from(self.distinct_on.clone())
                    .ok()
                    .map(SelectQuantifier::DistinctOn),
            )
            .selects(self.selects.clone())
            .from(Self::joined_table(&self.artifacts.joins))
            .maybe_where_clause(self.where_condition())
            .build();

        SelectStatement::builder()
            .maybe_with(self.with.clone())
            .select_clause(simple)
            .maybe_order_by(
                NonEmptyVec::try_from(self.sort_by.clone())
                    .ok()
                    .map(|sort_by| OrderByClause::builder().sort_by(sort_by).build()),
            )
            .maybe_limit(self.limit)
            .build()
    }

    /// Lays out the statement as the keys-first split, fenced when `materialization` says so,
    /// or reports why the statement does not qualify.
    fn fetch_keys_then_hydrate_statement(
        &self,
        materialization: Option<Materialization>,
    ) -> Result<SelectStatement, ShapeFallback> {
        let Some(limit) = self.limit else {
            return Err(ShapeFallback::Unlimited);
        };
        if self.sort_by.is_empty() {
            return Err(ShapeFallback::Unsorted);
        }

        let partition = self.partition_key_query_joins()?;
        let key_columns = self.collect_key_query_columns(&partition)?;
        let rewriter = KeyColumnRewriter::new(&partition.tables, &key_columns);
        let limited = TableName::from("limited");

        let mut common_table_expressions: Vec<CommonTableExpression> = self
            .with
            .as_ref()
            .map(|with| with.common_table_expressions.to_vec())
            .unwrap_or_default();
        debug_assert!(
            common_table_expressions
                .iter()
                .all(|cte| cte.name.as_str() != "roots" && cte.name.as_str() != "limited"),
            "carried CTE names must not collide with the fence CTEs"
        );
        common_table_expressions.push(self.key_query_cte(
            &partition,
            &key_columns,
            &rewriter,
            materialization,
        ));
        common_table_expressions.push(self.page_cte(&rewriter, limit));

        Ok(SelectStatement::builder()
            .with(
                WithClause::builder()
                    .recursive(self.with.as_ref().is_some_and(|with| with.recursive))
                    .common_table_expressions(
                        NonEmptyVec::try_from(common_table_expressions)
                            .expect("the key and page CTEs were pushed above"),
                    )
                    .build(),
            )
            .select_clause(self.hydration_select(&partition, &rewriter, &limited))
            .order_by(
                OrderByClause::builder()
                    .sort_by(self.rewritten_sort(&rewriter, Some(&limited)))
                    .build(),
            )
            .limit(limit)
            .build())
    }

    /// Splits the collected joins into the key query's and the hydration statement's share.
    /// The key query takes everything referenced by a filter, the cursor, or a sort key,
    /// closed transitively over the join conditions (a join's `ON` clause only references
    /// earlier joins, so one reverse pass suffices).
    fn partition_key_query_joins(&self) -> Result<KeyQueryPartition<'_>, ShapeFallback> {
        let mut required = HashSet::new();
        let mut opaque = false;
        for expression in self
            .conditions
            .iter()
            .chain(
                self.cursor
                    .iter()
                    .flat_map(|key| once(&key.expression).chain(key.value.as_ref())),
            )
            .chain(self.sort_by.iter().map(|sort| &sort.expression))
        {
            collect_referenced_tables(expression, &mut required, &mut opaque);
        }

        let mut in_key_query = vec![false; self.artifacts.joins.len()];
        for (slot, join) in in_key_query.iter_mut().zip(&self.artifacts.joins).rev() {
            if required.contains(&join.table.aliased_name(join.alias)) {
                *slot = true;
                for condition in &join.conditions {
                    collect_referenced_tables(condition, &mut required, &mut opaque);
                }
            }
        }
        if opaque {
            return Err(ShapeFallback::OpaqueExpression);
        }

        let mut key_joins = Vec::new();
        let mut hydrated_joins = Vec::new();
        for (join, in_key_query) in self.artifacts.joins.iter().zip(&in_key_query) {
            if *in_key_query {
                key_joins.push(join);
            } else {
                hydrated_joins.push(join);
            }
        }
        if key_joins.iter().any(|join| join.to_many) {
            return Err(ShapeFallback::ToManyKeyJoin);
        }
        if hydrated_joins
            .iter()
            .any(|join| matches!(join.join_type, JoinType::RightOuter | JoinType::FullOuter))
        {
            return Err(ShapeFallback::GeneratingHydrationJoin);
        }

        let tables = once(R::base_table().aliased_name(Alias::default()))
            .chain(
                key_joins
                    .iter()
                    .map(|join| join.table.aliased_name(join.alias)),
            )
            .collect();

        Ok(KeyQueryPartition {
            key_joins,
            hydrated_joins,
            tables,
        })
    }

    /// Collects every column the hydration statement reads from a key-query table, in
    /// first-seen order. Each becomes an output column of the key query.
    fn collect_key_query_columns(
        &self,
        partition: &KeyQueryPartition<'_>,
    ) -> Result<Vec<(TableName<'static>, ColumnName<'static>)>, ShapeFallback> {
        let mut key_columns = Vec::new();
        let mut seen = HashSet::new();
        let mut opaque = false;
        for expression in self
            .sort_by
            .iter()
            .map(|sort| &sort.expression)
            .chain(self.distinct_on.iter())
            .chain(self.selects.iter().filter_map(|select| match select {
                SelectExpression::Expression { expression, .. } => Some(expression),
                SelectExpression::Asterisk(_) => None,
            }))
            .chain(
                partition
                    .hydrated_joins
                    .iter()
                    .flat_map(|join| join.conditions.iter()),
            )
        {
            collect_key_columns(
                expression,
                &partition.tables,
                &mut key_columns,
                &mut seen,
                &mut opaque,
            );
        }
        if opaque {
            return Err(ShapeFallback::OpaqueExpression);
        }
        if self
            .selects
            .iter()
            .any(|select| matches!(select, SelectExpression::Asterisk(_)))
        {
            return Err(ShapeFallback::AsteriskSelect);
        }
        if key_columns.is_empty() {
            return Err(ShapeFallback::NoKeyColumns);
        }
        Ok(key_columns)
    }

    /// Builds the `roots` CTE: the key-query columns under the full filter and cursor
    /// conditions, `MATERIALIZED` on demand to fence its plan from the outer ordering demand.
    fn key_query_cte(
        &self,
        partition: &KeyQueryPartition<'_>,
        key_columns: &[(TableName<'static>, ColumnName<'static>)],
        rewriter: &KeyColumnRewriter<'_>,
        materialization: Option<Materialization>,
    ) -> CommonTableExpression {
        CommonTableExpression::builder()
            .name("roots")
            .statement(
                SimpleSelect::builder()
                    .selects(
                        key_columns
                            .iter()
                            .map(|(table, column)| {
                                let output = rewriter.output(table, column);
                                SelectExpression::Expression {
                                    expression: Expression::ColumnReference(ColumnReference {
                                        correlation: Some(TableReference::from(table.clone())),
                                        name: column.clone(),
                                    }),
                                    output_name: (output != column)
                                        .then(|| Identifier::from(output.as_str().to_owned())),
                                }
                            })
                            .collect::<Vec<_>>(),
                    )
                    .from(Self::joined_table(partition.key_joins.iter().copied()))
                    .maybe_where_clause(self.where_condition()),
            )
            .maybe_materialization(materialization)
            .build()
    }

    /// Builds the `limited` CTE: the sorted and limited page of `roots`.
    fn page_cte(&self, rewriter: &KeyColumnRewriter<'_>, limit: usize) -> CommonTableExpression {
        CommonTableExpression::builder()
            .name("limited")
            .statement(
                SelectStatement::builder()
                    .select_clause(
                        SimpleSelect::builder()
                            .selects(vec![SelectExpression::Asterisk(None)])
                            .from(FromItem::table(TableName::from("roots")).build()),
                    )
                    .order_by(
                        OrderByClause::builder()
                            .sort_by(self.rewritten_sort(rewriter, None))
                            .build(),
                    )
                    .limit(limit)
                    .build(),
            )
            .build()
    }

    /// Builds the hydration `SELECT`: the original projection and `DISTINCT ON` over
    /// `limited` plus the hydration joins, with all key-query references rewritten.
    fn hydration_select(
        &self,
        partition: &KeyQueryPartition<'_>,
        rewriter: &KeyColumnRewriter<'_>,
        limited: &TableName<'static>,
    ) -> SimpleSelect {
        let mut from = FromItem::table(limited.clone()).build();
        for join in &partition.hydrated_joins {
            from = from
                .join(join.join_type, join.source_item())
                .on(join
                    .conditions
                    .iter()
                    .map(|condition| rewriter.rewrite(condition, Some(limited)))
                    .collect::<Vec<_>>())
                .build();
        }

        SimpleSelect::builder()
            .maybe_quantifier(
                NonEmptyVec::try_from(
                    self.distinct_on
                        .iter()
                        .map(|expression| rewriter.rewrite(expression, Some(limited)))
                        .collect::<Vec<_>>(),
                )
                .ok()
                .map(SelectQuantifier::DistinctOn),
            )
            .selects(
                self.selects
                    .iter()
                    .map(|select| match select {
                        SelectExpression::Expression {
                            expression,
                            output_name,
                        } => SelectExpression::Expression {
                            expression: rewriter.rewrite(expression, Some(limited)),
                            output_name: output_name.clone(),
                        },
                        SelectExpression::Asterisk(_) => {
                            unreachable!(
                                "asterisk selects were ruled out while collecting the key columns"
                            )
                        }
                    })
                    .collect::<Vec<_>>(),
            )
            .from(from)
            .build()
    }

    /// The statement's sort keys with their key-query references rewritten.
    fn rewritten_sort(
        &self,
        rewriter: &KeyColumnRewriter<'_>,
        target: Option<&TableName<'static>>,
    ) -> NonEmptyVec<SortBy> {
        NonEmptyVec::try_from(
            self.sort_by
                .iter()
                .map(|sort| SortBy {
                    expression: rewriter.rewrite(&sort.expression, target),
                    direction: sort.direction,
                    nulls: sort.nulls,
                })
                .collect::<Vec<_>>(),
        )
        .expect("the sort keys were checked to be non-empty")
    }

    /// Assembles the `FROM` tree from the base table and the given joins.
    fn joined_table<'j>(joins: impl IntoIterator<Item = &'j CompiledJoin>) -> FromItem<'static> {
        let mut from = FromItem::table(R::base_table())
            .alias(R::base_table().aliased_name(Alias::default()))
            .build();
        for join in joins {
            from = from
                .join(join.join_type, join.source_item())
                .on(join.conditions.clone())
                .build();
        }
        from
    }

    /// Combines the collected filter conditions and the keyset-pagination continuation into the
    /// `WHERE` condition of the statement.
    fn where_condition(&self) -> Option<Expression> {
        let mut conditions = self.conditions.clone();
        conditions.extend(Self::cursor_condition(&self.cursor));
        Expression::conjunction(conditions)
    }

    /// Builds the keyset-pagination continuation: one alternative per sort key, each requiring
    /// all previous keys to be equal and the current key to be past the cursor value.
    ///
    /// Returns [`None`] only for an empty cursor. An exhausted cursor yields a never-matching
    /// `FALSE` so the next page comes back empty instead of replaying from the start.
    fn cursor_condition(cursor: &[CursorKey]) -> Option<Expression> {
        if cursor.is_empty() {
            return None;
        }

        let mut alternatives = Vec::new();
        for current in (0..cursor.len()).rev() {
            let mut criteria = Vec::new();
            for (idx, key) in cursor.iter().enumerate() {
                if idx == current {
                    // Without an explicit hint Postgres sorts nulls last for ascending and
                    // first for descending keys; the continuation has to mirror that default.
                    let nulls = key.nulls.unwrap_or(match key.ordering {
                        Ordering::Ascending => NullOrdering::Last,
                        Ordering::Descending => NullOrdering::First,
                    });

                    if let Some(value) = &key.value {
                        let comparison = match key.ordering {
                            Ordering::Ascending => {
                                Expression::greater(key.expression.clone(), value.clone())
                            }
                            Ordering::Descending => {
                                Expression::less(key.expression.clone(), value.clone())
                            }
                        };

                        match nulls {
                            // A provably non-nullable key has no `NULL` rows to continue into.
                            _ if key.non_null => criteria.push(comparison),
                            NullOrdering::First => criteria.push(comparison),
                            // With nulls sorted last, rows where the key is `NULL` also come
                            // after the cursor value.
                            NullOrdering::Last => criteria.push(Expression::any(vec![
                                comparison,
                                Expression::is_null(key.expression.clone()),
                            ])),
                        }
                    } else {
                        assert!(
                            !key.non_null,
                            "a non-nullable sort key cannot produce a `NULL` cursor value"
                        );
                        match nulls {
                            NullOrdering::First => {
                                criteria.push(Expression::is_not_null(key.expression.clone()));
                            }
                            // A `NULL` cursor value with nulls sorted last has no rows after it
                            // on this key, so the alternative is dropped entirely.
                            NullOrdering::Last => {
                                criteria.clear();
                                break;
                            }
                        }
                    }

                    break;
                }

                criteria.push(key.value.as_ref().map_or_else(
                    || Expression::is_null(key.expression.clone()),
                    |value| Expression::equal(key.expression.clone(), value.clone()),
                ));
            }
            if let Some(alternative) = Expression::conjunction(criteria) {
                alternatives.push(alternative);
            }
        }

        // With every alternative dropped the cursor sits at the end of a trailing `NULL` group
        // and no row sorts after it. The continuation has to be a never-matching condition (an
        // empty `OR` transpiles to `FALSE`) rather than absent, which would replay the first
        // page.
        Some(Expression::disjunction(alternatives).unwrap_or_else(|| Expression::any(Vec::new())))
    }

    /// Whether any relation joined so far can fan out the base rows.
    ///
    /// `false` guarantees the compiled query emits at most one row per base row, so a downstream
    /// deduplication can be safely skipped. Reflects all filters and selections added before
    /// the call.
    #[must_use]
    pub const fn has_to_many_join(&self) -> bool {
        self.artifacts.has_to_many_join
    }

    /// Compiles a [`Filter`] to an [`Expression`].
    ///
    /// # Errors
    ///
    /// Returns an error if the filter compilation fails.
    ///
    /// # Panics
    ///
    /// Panics when an embeddings table declares no grouping columns, though the static table
    /// list makes that unreachable.
    #[expect(clippy::too_many_lines)]
    #[instrument(level = "debug", skip_all)]
    pub fn compile_filter<'f: 'q>(
        &mut self,
        filter: &'p Filter<'f, R>,
    ) -> Result<Expression, Report<SelectCompilerError>>
    where
        R::QueryPath<'f>: PostgresQueryPath,
    {
        if let Some(condition) = self.compile_special_filter(filter) {
            return Ok(condition);
        }

        Ok(match filter {
            Filter::All(filters) => {
                Expression::all(self.compile_filter_group(filters, FilterGroup::All)?)
            }
            Filter::Any(filters) => {
                Expression::any(self.compile_filter_group(filters, FilterGroup::Any)?)
            }
            Filter::Not(filter) => self.compile_filter(filter)?.not(),
            Filter::Equal(lhs, rhs) => Expression::equal(
                self.compile_filter_expression(lhs)?.0,
                self.compile_filter_expression(rhs)?.0,
            ),
            Filter::NotEqual(lhs, rhs) => Expression::not_equal(
                self.compile_filter_expression(lhs)?.0,
                self.compile_filter_expression(rhs)?.0,
            ),
            Filter::Exists { path } => Expression::is_not_null(self.compile_path_column(path)),
            Filter::Greater(lhs, rhs) => Expression::greater(
                self.compile_filter_expression(lhs)?.0,
                self.compile_filter_expression(rhs)?.0,
            ),
            Filter::GreaterOrEqual(lhs, rhs) => Expression::greater_or_equal(
                self.compile_filter_expression(lhs)?.0,
                self.compile_filter_expression(rhs)?.0,
            ),
            Filter::Less(lhs, rhs) => Expression::less(
                self.compile_filter_expression(lhs)?.0,
                self.compile_filter_expression(rhs)?.0,
            ),
            Filter::LessOrEqual(lhs, rhs) => Expression::less_or_equal(
                self.compile_filter_expression(lhs)?.0,
                self.compile_filter_expression(rhs)?.0,
            ),
            Filter::CosineDistance(lhs, rhs, max) => match (lhs, rhs) {
                (
                    FilterExpression::Path { path },
                    FilterExpression::Parameter { parameter, convert },
                )
                | (
                    FilterExpression::Parameter { parameter, convert },
                    FilterExpression::Path { path },
                ) => {
                    let _span = tracing::info_span!("compile_cosine_distance").entered();
                    ensure!(
                        !self.artifacts.has_embeddings_filter,
                        SelectCompilerError::MultipleEmbeddings
                    );
                    // We don't support custom sorting yet and limit/cursor implicitly set an order.
                    // We special case the distance function to allow sorting by distance, so we
                    // need to make sure that we don't have a limit or cursor.

                    self.artifacts.cursor_disallowed_reason =
                        Some("Cannot use distance function with cursor");

                    // `convert` should be `None` as we don't support parameter conversion at this
                    // stage, yet.
                    ensure!(
                        convert.is_none(),
                        SelectCompilerError::ConvertDistanceParameter
                    );

                    let path_alias = self.add_join_statements(path);
                    let parameter_expression = self.compile_parameter(parameter).0;
                    let maximum_expression = self.compile_filter_expression(max)?.0;

                    let (embeddings_column, None) = path.terminating_column() else {
                        bail!(SelectCompilerError::UnsupportedEmbeddingPath);
                    };
                    let embeddings_table = embeddings_column.table();
                    let distance_expression = Expression::ColumnReference(
                        match embeddings_table {
                            Table::DataTypeEmbeddings => {
                                Column::DataTypeEmbeddings(DataTypeEmbeddings::Distance)
                            }
                            Table::PropertyTypeEmbeddings => {
                                Column::PropertyTypeEmbeddings(PropertyTypeEmbeddings::Distance)
                            }
                            Table::EntityTypeEmbeddings => {
                                Column::EntityTypeEmbeddings(EntityTypeEmbeddings::Distance)
                            }
                            Table::EntityEmbeddings => {
                                Column::EntityEmbeddings(EntityEmbeddings::Distance)
                            }
                            Table::OntologyIds
                            | Table::OntologyTemporalMetadata
                            | Table::OntologyOwnedMetadata
                            | Table::OntologyExternalMetadata
                            | Table::OntologyAdditionalMetadata
                            | Table::DataTypes
                            | Table::DataTypeConversions
                            | Table::DataTypeConversionAggregation
                            | Table::PropertyTypes
                            | Table::EntityTypes
                            | Table::EntityEditionCache
                            | Table::EntityIds
                            | Table::EntityDrafts
                            | Table::EntityTemporalMetadata
                            | Table::EntityEditions
                            | Table::EntityIsOfType
                            | Table::EntityHasLeftEntity
                            | Table::EntityHasRightEntity
                            | Table::EntityEdge
                            | Table::Action
                            | Table::ActionHierarchy
                            | Table::Policy
                            | Table::PolicyEdition
                            | Table::PolicyAction
                            | Table::UserActor
                            | Table::MachineActor
                            | Table::AiActor
                            | Table::Web
                            | Table::Team
                            | Table::Role
                            | Table::ActorRole
                            | Table::Reference(_) => {
                                bail!(SelectCompilerError::UnsupportedEmbeddingPath)
                            }
                        }
                        .aliased(path_alias),
                    );

                    if let Some(last_join) = self.artifacts.joins.last_mut() {
                        // The rewrite below replaces the topmost join with the distance
                        // subquery, which is only sound when that join is the embeddings join
                        // resolved for this path. A reused embeddings join buried under later
                        // joins (created by an earlier non-distance filter on the embedding
                        // path) cannot be rewritten.
                        ensure!(
                            last_join.table == embeddings_table && last_join.alias == path_alias,
                            SelectCompilerError::MultipleEmbeddings
                        );

                        let select_columns: &[_] = match embeddings_table {
                            Table::DataTypeEmbeddings => {
                                &[Column::DataTypeEmbeddings(DataTypeEmbeddings::OntologyId)]
                            }
                            Table::PropertyTypeEmbeddings => &[Column::PropertyTypeEmbeddings(
                                PropertyTypeEmbeddings::OntologyId,
                            )],
                            Table::EntityTypeEmbeddings => &[Column::EntityTypeEmbeddings(
                                EntityTypeEmbeddings::OntologyId,
                            )],
                            Table::EntityEmbeddings => &[
                                Column::EntityEmbeddings(EntityEmbeddings::WebId),
                                Column::EntityEmbeddings(EntityEmbeddings::EntityUuid),
                            ],
                            Table::OntologyIds
                            | Table::OntologyTemporalMetadata
                            | Table::OntologyOwnedMetadata
                            | Table::OntologyExternalMetadata
                            | Table::OntologyAdditionalMetadata
                            | Table::DataTypes
                            | Table::DataTypeConversions
                            | Table::DataTypeConversionAggregation
                            | Table::PropertyTypes
                            | Table::EntityTypes
                            | Table::EntityEditionCache
                            | Table::EntityIds
                            | Table::EntityDrafts
                            | Table::EntityTemporalMetadata
                            | Table::EntityEditions
                            | Table::EntityIsOfType
                            | Table::EntityHasLeftEntity
                            | Table::EntityHasRightEntity
                            | Table::EntityEdge
                            | Table::Action
                            | Table::ActionHierarchy
                            | Table::Policy
                            | Table::PolicyEdition
                            | Table::PolicyAction
                            | Table::UserActor
                            | Table::MachineActor
                            | Table::AiActor
                            | Table::Web
                            | Table::Team
                            | Table::Role
                            | Table::ActorRole
                            | Table::Reference(_) => unreachable!(),
                        };

                        last_join.source = JoinSource::Subquery(Box::new(SelectStatement::from(
                            SimpleSelect::builder()
                                .selects(
                                    select_columns
                                        .iter()
                                        .map(|&column| SelectExpression::Expression {
                                            expression: Expression::ColumnReference(column.into()),
                                            output_name: None,
                                        })
                                        .chain(once(SelectExpression::Expression {
                                            expression: Expression::Function(Function::Min(
                                                Box::new(Expression::cosine_distance(
                                                    Expression::ColumnReference(
                                                        embeddings_column.into(),
                                                    ),
                                                    parameter_expression,
                                                )),
                                            )),
                                            output_name: Some(Identifier::from("distance")),
                                        }))
                                        .collect::<Vec<_>>(),
                                )
                                .from(FromItem::table(embeddings_table))
                                .group_by(
                                    GroupByClause::builder().grouping_elements(
                                        NonEmptyVec::try_from(
                                            select_columns
                                                .iter()
                                                .map(|&column| {
                                                    GroupingElement::Expressions(NonEmptyVec::from(
                                                        Expression::ColumnReference(column.into()),
                                                    ))
                                                })
                                                .collect::<Vec<_>>(),
                                        )
                                        .expect(
                                            "every embeddings table groups by at least one column",
                                        ),
                                    ),
                                ),
                        )));
                        // The grouped subquery emits exactly one row per join key, so the
                        // original relation's fan-out no longer applies.
                        last_join.to_many = false;
                        self.artifacts.has_embeddings_filter = true;
                    }

                    self.sort_by.insert(
                        0,
                        SortBy::builder()
                            .expression(distance_expression.clone())
                            .direction(SortDirection::Ascending)
                            .build(),
                    );
                    self.selects.push(SelectExpression::Expression {
                        expression: distance_expression.clone(),
                        output_name: None,
                    });
                    self.distinct_on.push(distance_expression.clone());
                    Expression::less_or_equal(distance_expression, maximum_expression)
                }
                _ => bail!(SelectCompilerError::UnsupportedDistanceExpression),
            },
            Filter::In(lhs, rhs) => Expression::r#in(
                self.compile_filter_expression(lhs)?.0,
                self.compile_filter_expression_list(rhs).0,
            ),
            Filter::StartsWith(lhs, rhs) => {
                Self::ensure_scalar_text_operand(lhs)?;
                Self::ensure_scalar_text_operand(rhs)?;
                let (left_filter, left_parameter) = self.compile_filter_expression(lhs)?;
                let left_filter = if left_parameter == ParameterType::Any {
                    Expression::Function(Function::JsonExtractText(Box::new(left_filter)))
                } else {
                    left_filter
                };

                let (right_filter, right_parameter) = self.compile_filter_expression(rhs)?;
                let right_filter = if right_parameter == ParameterType::Any {
                    Expression::Function(Function::JsonExtractText(Box::new(right_filter)))
                } else {
                    right_filter
                };

                Expression::starts_with(left_filter, right_filter)
            }
            Filter::EndsWith(lhs, rhs) => {
                Self::ensure_scalar_text_operand(lhs)?;
                Self::ensure_scalar_text_operand(rhs)?;
                let (left_filter, left_parameter) = self.compile_filter_expression(lhs)?;
                let left_filter = if left_parameter == ParameterType::Any {
                    Expression::Function(Function::JsonExtractText(Box::new(left_filter)))
                } else {
                    left_filter
                };

                let (right_filter, right_parameter) = self.compile_filter_expression(rhs)?;
                let right_filter = if right_parameter == ParameterType::Any {
                    Expression::Function(Function::JsonExtractText(Box::new(right_filter)))
                } else {
                    right_filter
                };

                Expression::ends_with(left_filter, right_filter)
            }
            Filter::ContainsSegment(lhs, rhs) => {
                Self::ensure_scalar_text_operand(lhs)?;
                Self::ensure_scalar_text_operand(rhs)?;
                let (left_filter, left_parameter) = self.compile_filter_expression(lhs)?;
                let left_filter = if left_parameter == ParameterType::Any {
                    Expression::Function(Function::JsonExtractText(Box::new(left_filter)))
                } else {
                    left_filter
                };

                let (right_filter, right_parameter) = self.compile_filter_expression(rhs)?;
                let right_filter = if right_parameter == ParameterType::Any {
                    Expression::Function(Function::JsonExtractText(Box::new(right_filter)))
                } else {
                    right_filter
                };

                Expression::contains_segment(left_filter, right_filter)
            }
        })
    }

    /// Rejects operands on paths terminating in materialized text-array columns.
    ///
    /// Equality filters on such paths compile to array predicates, but string operations
    /// have no scalar column to operate on.
    fn ensure_scalar_text_operand<'f: 'q>(
        operand: &FilterExpression<'f, R>,
    ) -> Result<(), Report<SelectCompilerError>>
    where
        R::QueryPath<'f>: PostgresQueryPath,
    {
        if let FilterExpression::Path { path } = operand {
            let (column, json_field) = path.terminating_column();
            ensure!(
                json_field.is_some() || !Self::is_text_array_column(column),
                SelectCompilerError::UnsupportedTextArrayOperation
            );
        }
        Ok(())
    }

    /// Whether the column holds an array of textual values ([`BaseUrl`] and
    /// [`VersionedUrl`] columns transpile to `text[]`).
    ///
    /// [`BaseUrl`]: ParameterType::BaseUrl
    /// [`VersionedUrl`]: ParameterType::VersionedUrl
    fn is_text_array_column(column: Column) -> bool {
        matches!(
            column.parameter_type(),
            ParameterType::Vector(inner) if matches!(
                *inner,
                ParameterType::Text | ParameterType::BaseUrl | ParameterType::VersionedUrl
            )
        )
    }

    /// Decomposes an equality (`Equal`/`NotEqual`) or membership (`In(parameter, path)`)
    /// filter on a path terminating in a materialized text-array column.
    ///
    /// Returns the path, the text parameter, and whether the filter tests for containment
    /// (`true`) or its absence (`false`).
    fn cached_array_equality<'f: 'q>(
        filter: &'p Filter<'f, R>,
    ) -> Option<(&'p R::QueryPath<'f>, &'p Parameter<'f>, bool)>
    where
        R::QueryPath<'f>: PostgresQueryPath,
    {
        let (lhs, rhs, equals) = match filter {
            Filter::Equal(lhs, rhs) => (lhs, rhs, true),
            Filter::NotEqual(lhs, rhs) => (lhs, rhs, false),
            Filter::In(
                FilterExpression::Parameter {
                    parameter: parameter @ Parameter::Text(_),
                    convert: None,
                },
                FilterExpressionList::Path { path },
            ) => {
                let (column, json_field) = path.terminating_column();
                return (json_field.is_none() && Self::is_text_array_column(column))
                    .then_some((path, parameter, true));
            }
            Filter::All(_)
            | Filter::Any(_)
            | Filter::Not(_)
            | Filter::Exists { .. }
            | Filter::Greater(..)
            | Filter::GreaterOrEqual(..)
            | Filter::Less(..)
            | Filter::LessOrEqual(..)
            | Filter::CosineDistance(..)
            | Filter::In(..)
            | Filter::StartsWith(..)
            | Filter::EndsWith(..)
            | Filter::ContainsSegment(..) => return None,
        };
        match (lhs, rhs) {
            (
                FilterExpression::Path { path },
                FilterExpression::Parameter {
                    parameter: parameter @ Parameter::Text(_),
                    convert: None,
                },
            )
            | (
                FilterExpression::Parameter {
                    parameter: parameter @ Parameter::Text(_),
                    convert: None,
                },
                FilterExpression::Path { path },
            ) => {
                let (column, json_field) = path.terminating_column();
                (json_field.is_none() && Self::is_text_array_column(column))
                    .then_some((path, parameter, equals))
            }
            _ => None,
        }
    }

    /// Compiles equality filters on a path backed by a materialized array column into a
    /// single array predicate on that column.
    ///
    /// A single parameter compiles to a containment check (`<column> @> ARRAY[$n]::text[]`,
    /// negated for inequalities). Multiple parameters gathered from one `All`/`Any` group
    /// bundle into one predicate over the whole value set:
    ///
    /// | group | equalities          | inequalities              |
    /// |-------|---------------------|---------------------------|
    /// | `All` | `@>` (contains all) | `NOT(&&)` (contains none) |
    /// | `Any` | `&&` (contains any) | `NOT(@>)` (misses one)    |
    ///
    /// A single array predicate replaces per-value joins through the type tables and lets
    /// a GIN index on the materialized column serve the positive forms.
    fn compile_cached_array_predicate<'f: 'q>(
        &mut self,
        column: ColumnReference<'static>,
        parameters: &[&'p Parameter<'f>],
        equals: bool,
        group: FilterGroup,
    ) -> Expression
    where
        R::QueryPath<'f>: PostgresQueryPath,
    {
        let column_reference = Expression::ColumnReference(column);
        let array = Expression::Function(Function::ArrayLiteral {
            elements: parameters
                .iter()
                .map(|parameter| self.compile_parameter(parameter).0)
                .collect(),
            element_type: PostgresType::Text,
        });
        // For a single value `@>` and `&&` coincide, so the group connective is irrelevant.
        if parameters.len() == 1 {
            let contains = Expression::array_contains(column_reference, array);
            return if equals { contains } else { contains.not() };
        }
        match (group, equals) {
            (FilterGroup::All, true) => Expression::array_contains(column_reference, array),
            (FilterGroup::All, false) => Expression::overlap(column_reference, array).not(),
            (FilterGroup::Any, true) => Expression::overlap(column_reference, array),
            (FilterGroup::Any, false) => Expression::array_contains(column_reference, array).not(),
        }
    }

    /// Compiles the filters of an `All`/`Any` group, bundling equality filters backed by
    /// the same materialized array column into a single array predicate.
    ///
    /// Bundles are keyed on the *aliased* column: paths terminating in the same column
    /// through different join chains (e.g. an entity's own types vs. a linked entity's
    /// types) resolve to different aliases and stay separate predicates.
    fn compile_filter_group<'f: 'q>(
        &mut self,
        filters: &'p [Filter<'f, R>],
        group: FilterGroup,
    ) -> Result<Vec<Expression>, Report<SelectCompilerError>>
    where
        R::QueryPath<'f>: PostgresQueryPath,
    {
        struct ArrayPredicateGroup<'c, 'p> {
            column: ColumnReference<'static>,
            equals: bool,
            parameters: Vec<&'c Parameter<'p>>,
        }

        let mut bundles: Vec<ArrayPredicateGroup<'p, 'f>> = Vec::new();
        let mut expressions = Vec::new();
        for filter in filters {
            if let Some((array_path, parameter, equals)) = Self::cached_array_equality(filter) {
                let alias = self.add_join_statements(array_path);
                let column = array_path.terminating_column().0.aliased(alias);
                if let Some(bundle) = bundles
                    .iter_mut()
                    .find(|bundle| bundle.column == column && bundle.equals == equals)
                {
                    bundle.parameters.push(parameter);
                } else {
                    bundles.push(ArrayPredicateGroup {
                        column,
                        equals,
                        parameters: vec![parameter],
                    });
                }
            } else {
                expressions.push(self.compile_filter(filter)?);
            }
        }
        for bundle in &bundles {
            expressions.push(self.compile_cached_array_predicate(
                bundle.column.clone(),
                &bundle.parameters,
                bundle.equals,
                group,
            ));
        }
        Ok(expressions)
    }

    /// Compiles the `path` to a condition, which is searching for the latest version.
    // Warning: This adds a CTE to the statement, which is overwriting the `ontology_ids` table.
    //          When more CTEs are needed, a test should be added to cover both CTEs in one
    //          statement to ensure compatibility
    // TODO: Remove CTE to allow limit or cursor selection
    //   see https://linear.app/hash/issue/H-1442
    #[instrument(level = "info", skip_all)]
    fn compile_latest_ontology_version_filter<'f: 'q>(
        &mut self,
        path: &R::QueryPath<'f>,
        operator: EqualityOperator,
    ) -> Expression
    where
        R::QueryPath<'f>: PostgresQueryPath,
    {
        self.artifacts.cursor_disallowed_reason =
            Some("Cannot use latest version filter with cursor");

        let version_column = Column::OntologyIds(OntologyIds::Version);
        let alias = Alias {
            condition_index: 0,
            chain_depth: 0,
            number: 0,
        };

        // Add a WITH expression selecting the partitioned version
        let latest_version_cte = CommonTableExpression::builder()
            .name(Table::OntologyIds)
            .statement(
                SimpleSelect::builder()
                    .selects(vec![
                        SelectExpression::Asterisk(None),
                        SelectExpression::Expression {
                            expression: Expression::window(
                                Expression::Function(Function::Max(Box::new(
                                    Expression::ColumnReference(version_column.aliased(alias)),
                                ))),
                                WindowDefinition::builder().partition_by(
                                    Expression::ColumnReference(
                                        Column::OntologyIds(OntologyIds::BaseUrl).aliased(alias),
                                    ),
                                ),
                            ),
                            output_name: Some(Identifier::from("latest_version")),
                        },
                    ])
                    .from(
                        FromItem::table(version_column.table())
                            .alias(version_column.table().aliased_name(alias))
                            .build(),
                    ),
            );
        match &mut self.with {
            Some(with) => with.push(latest_version_cte),
            with @ None => {
                *with = Some(
                    WithClause::builder()
                        .common_table_expressions(latest_version_cte)
                        .build(),
                );
            }
        }

        let alias = self.add_join_statements(path);
        // Join the table of `path` and compare the version to the latest version
        let latest_version_expression = Expression::ColumnReference(
            Column::OntologyIds(OntologyIds::LatestVersion).aliased(alias),
        );
        let version_expression = Expression::ColumnReference(version_column.aliased(alias));

        match operator {
            EqualityOperator::Equal => {
                Expression::equal(version_expression, latest_version_expression)
            }
            EqualityOperator::NotEqual => {
                Expression::not_equal(version_expression, latest_version_expression)
            }
        }
    }

    /// Searches for [`Filter`]s, which requires special treatment and returns the corresponding
    /// condition if any.
    ///
    /// The following [`Filter`]s will be special cased:
    /// - Comparing the `"version"` field on [`Table::OntologyIds`] with `"latest"` for equality.
    /// - Equality and membership filters on paths terminating in materialized text-array columns,
    ///   compiled to array predicates (see [`Self::compile_cached_array_predicate`]).
    fn compile_special_filter<'f: 'q>(&mut self, filter: &'p Filter<'f, R>) -> Option<Expression>
    where
        R::QueryPath<'f>: PostgresQueryPath,
    {
        if let Some((array_path, parameter, equals)) = Self::cached_array_equality(filter) {
            let alias = self.add_join_statements(array_path);
            let column = array_path.terminating_column().0.aliased(alias);
            // A lone filter has a single parameter, so the group connective is irrelevant.
            return Some(self.compile_cached_array_predicate(
                column,
                &[parameter],
                equals,
                FilterGroup::All,
            ));
        }

        match filter {
            Filter::Equal(lhs, rhs) | Filter::NotEqual(lhs, rhs) => match (lhs, rhs) {
                (
                    FilterExpression::Path { path },
                    FilterExpression::Parameter {
                        parameter: Parameter::Text(parameter),
                        convert: None,
                    },
                )
                | (
                    FilterExpression::Parameter {
                        parameter: Parameter::Text(parameter),
                        convert: None,
                    },
                    FilterExpression::Path { path },
                ) => match (path.terminating_column().0, filter, parameter.as_ref()) {
                    (Column::OntologyIds(OntologyIds::Version), Filter::Equal(..), "latest") => {
                        Some(
                            self.compile_latest_ontology_version_filter(
                                path,
                                EqualityOperator::Equal,
                            ),
                        )
                    }
                    (Column::OntologyIds(OntologyIds::Version), Filter::NotEqual(..), "latest") => {
                        Some(self.compile_latest_ontology_version_filter(
                            path,
                            EqualityOperator::NotEqual,
                        ))
                    }
                    _ => None,
                },
                _ => None,
            },
            Filter::All(_)
            | Filter::Any(_)
            | Filter::Not(_)
            | Filter::Exists { .. }
            | Filter::Greater(..)
            | Filter::GreaterOrEqual(..)
            | Filter::Less(..)
            | Filter::LessOrEqual(..)
            | Filter::CosineDistance(..)
            | Filter::In(..)
            | Filter::StartsWith(..)
            | Filter::EndsWith(..)
            | Filter::ContainsSegment(..) => None,
        }
    }

    #[instrument(level = "debug", skip_all)]
    pub fn compile_path_column<'f: 'q>(&mut self, path: &'p R::QueryPath<'f>) -> Expression
    where
        R::QueryPath<'f>: PostgresQueryPath,
    {
        let (column, json_field) = path.terminating_column();
        let parameter = json_field.map(|field| {
            let (field, parameter) = field.into_owned(self.artifacts.parameters.len() + 1);
            if let Some(parameter) = parameter {
                self.artifacts.parameters.push(parameter);
            }
            field
        });

        let alias = self.add_join_statements(path);

        if let Some(hook) = self.table_hooks.get(&column.table().into()) {
            let conditions = hook(self, alias);
            self.conditions.extend(conditions);
        }

        let mut column_expression = Expression::ColumnReference(column.aliased(alias));
        if let Some(hook) = self.column_hooks.get(&column) {
            column_expression = hook(self, column_expression);
        }

        match parameter {
            None => column_expression,
            Some(JsonField::JsonPath(path)) => {
                unreachable!("JsonPath `{path}` should be handled by now")
            }
            Some(JsonField::JsonPathParameter(index)) => {
                Expression::Function(Function::JsonPathQueryFirst(
                    Box::new(column_expression),
                    Box::new(Expression::Cast(
                        Box::new(Expression::Cast(
                            Box::new(Expression::Parameter(index)),
                            PostgresType::Text,
                        )),
                        PostgresType::JsonPath,
                    )),
                ))
            }
            Some(JsonField::StaticText(field)) => {
                Expression::Function(Function::JsonExtractAsText(
                    Box::new(column_expression),
                    PathToken::Field(Cow::Borrowed(field)),
                ))
            }
            Some(JsonField::ArrayElement(index)) => Expression::ArrayElement {
                expr: Box::new(column_expression),
                index,
            },
            Some(JsonField::Label { inheritance_depth }) => {
                if let Some(label_path) =
                    <R as QueryRecord>::QueryPath::label_property_path(inheritance_depth)
                {
                    Expression::Function(Function::JsonExtractPath(vec![
                        column_expression,
                        Expression::Function(Function::JsonExtractAsText(
                            Box::new(Expression::ColumnReference(
                                Column::EntityTypes(EntityTypes::Schema)
                                    .aliased(self.add_join_statements(&label_path)),
                            )),
                            PathToken::Field(Cow::Borrowed("labelProperty")),
                        )),
                    ]))
                } else {
                    column_expression
                }
            }
        }
    }

    pub fn add_parameter(&mut self, parameter: &'p (dyn ToSql + Sync)) -> Expression {
        self.artifacts.parameters.push(parameter);
        Expression::Parameter(self.artifacts.parameters.len())
    }

    #[instrument(level = "debug", skip_all)]
    pub fn compile_parameter<'f: 'p>(
        &mut self,
        parameter: &'p Parameter<'f>,
    ) -> (Expression, ParameterType) {
        let parameter_type = match parameter {
            Parameter::Decimal(number) => {
                self.artifacts.parameters.push(number);
                ParameterType::Decimal
            }
            Parameter::Text(text) => {
                self.artifacts.parameters.push(text);
                ParameterType::Text
            }
            Parameter::Boolean(bool) => {
                self.artifacts.parameters.push(bool);
                ParameterType::Boolean
            }
            Parameter::Vector(vector) => {
                self.artifacts.parameters.push(vector);
                ParameterType::Vector(Box::new(ParameterType::Decimal))
            }
            Parameter::Any(json) => {
                self.artifacts.parameters.push(json);
                ParameterType::Any
            }
            Parameter::Uuid(uuid) => {
                self.artifacts.parameters.push(uuid);
                ParameterType::Uuid
            }
            Parameter::OntologyTypeVersion(version) => {
                self.artifacts.parameters.push(&**version);
                ParameterType::OntologyTypeVersion
            }
            Parameter::Timestamp(timestamp) => {
                self.artifacts.parameters.push(timestamp);
                ParameterType::Timestamp
            }
        };

        (
            Expression::Parameter(self.artifacts.parameters.len()),
            parameter_type,
        )
    }

    #[instrument(level = "debug", skip_all)]
    /// Compiles a [`FilterExpression`] to an [`Expression`] and its parameter type.
    ///
    /// # Errors
    ///
    /// Returns [`SelectCompilerError::PendingParameterConversion`] when the parameter still
    /// carries a conversion; conversions have to be resolved before compilation.
    pub fn compile_filter_expression<'f: 'q>(
        &mut self,
        expression: &'p FilterExpression<'f, R>,
    ) -> Result<(Expression, ParameterType), Report<SelectCompilerError>>
    where
        R::QueryPath<'f>: PostgresQueryPath,
    {
        Ok(match expression {
            FilterExpression::Path { path } => {
                let (column, json_field) = path.terminating_column();
                let parameter_type =
                    if let Some(JsonField::StaticText(_) | JsonField::ArrayElement(_)) = json_field
                    {
                        ParameterType::Text
                    } else {
                        column.parameter_type()
                    };
                (self.compile_path_column(path), parameter_type)
            }
            FilterExpression::Parameter { parameter, convert } => {
                ensure!(
                    convert.is_none(),
                    SelectCompilerError::PendingParameterConversion
                );
                self.compile_parameter(parameter)
            }
        })
    }

    #[instrument(level = "debug", skip_all)]
    pub fn compile_filter_expression_list<'f: 'q>(
        &mut self,
        expression: &'p FilterExpressionList<'f, R>,
    ) -> (Expression, ParameterType)
    where
        R::QueryPath<'f>: PostgresQueryPath,
    {
        match expression {
            FilterExpressionList::Path { path } => {
                let (column, json_field) = path.terminating_column();
                let parameter_type =
                    if let Some(JsonField::StaticText(_) | JsonField::ArrayElement(_)) = json_field
                    {
                        ParameterType::Text
                    } else {
                        column.parameter_type()
                    };
                (self.compile_path_column(path), parameter_type)
            }
            FilterExpressionList::ParameterList { parameters } => {
                self.compile_parameter_list(parameters)
            }
        }
    }

    #[instrument(level = "debug", skip_all)]
    pub fn compile_parameter_list<'f: 'p>(
        &mut self,
        parameters: &'p ParameterList<'f>,
    ) -> (Expression, ParameterType) {
        let parameter_type = match parameters {
            ParameterList::DataTypeIds(uuids) => {
                self.artifacts.parameters.push(uuids);
                ParameterType::Uuid
            }
            ParameterList::PropertyTypeIds(uuids) => {
                self.artifacts.parameters.push(uuids);
                ParameterType::Uuid
            }
            ParameterList::EntityTypeIds(uuids) => {
                self.artifacts.parameters.push(uuids);
                ParameterType::Uuid
            }
            ParameterList::EntityEditionIds(uuids) => {
                self.artifacts.parameters.push(uuids);
                ParameterType::Uuid
            }
            ParameterList::EntityUuids(uuids) => {
                self.artifacts.parameters.push(uuids);
                ParameterType::Uuid
            }
            ParameterList::WebIds(web_ids) => {
                self.artifacts.parameters.push(web_ids);
                ParameterType::Uuid
            }
        };
        (
            Expression::Parameter(self.artifacts.parameters.len()),
            parameter_type,
        )
    }

    /// Joins a chain of [`Relation`]s and returns the table name of the last joined table.
    ///
    /// Joining the tables attempts to deduplicate join operations. As soon as a new filter was
    /// compiled, each subsequent call will result in a new join-chain.
    ///
    /// Every condition a join is created with references only the join itself and earlier
    /// joins, which [`Self::partition_key_query_joins`] relies on for its single reverse pass.
    ///
    /// [`Relation`]: super::table::Relation
    #[instrument(level = "debug", skip_all)]
    fn add_join_statements<'f: 'q>(&mut self, path: &R::QueryPath<'f>) -> Alias
    where
        R::QueryPath<'f>: PostgresQueryPath,
    {
        let mut current_alias = Alias::default();

        if let Some(hook) = self.table_hooks.get(&R::base_table().name()) {
            let conditions = hook(self, current_alias);
            self.conditions.extend(conditions);
        }

        let mut is_outer_join_chain = false;
        for relation in path.relations() {
            if relation.is_to_many() {
                self.artifacts.has_to_many_join = true;
            }
            for foreign_key_reference in relation.joins() {
                let join_type = if is_outer_join_chain {
                    JoinType::LeftOuter
                } else {
                    let join_type = foreign_key_reference.join_type();
                    if join_type != JoinType::Inner {
                        is_outer_join_chain = true;
                    }
                    join_type
                };

                let join_table = foreign_key_reference.table();
                let mut join_alias = Alias {
                    condition_index: self.artifacts.condition_index,
                    chain_depth: current_alias.chain_depth + 1,
                    number: 0,
                };
                let mut conditions = foreign_key_reference.conditions(current_alias, join_alias);

                let mut found = None;
                let mut max_number = 0;

                for (existing_index, existing) in self.artifacts.joins.iter().enumerate().rev() {
                    // Check for exact match to reuse existing join
                    if existing.table.name() == join_table.name() && existing.alias == join_alias {
                        // We only need to check the join conditions, not the join type or
                        // additional conditions. This is enough to reuse an existing join
                        // statement.
                        if existing.conditions.starts_with(&conditions) {
                            // We already have a join statement for this column, so we can reuse
                            // it.
                            current_alias = existing.alias;
                            found = Some(existing_index);
                            break;
                        }
                    }

                    // Track maximum number for joins with same table name and alias prefix
                    if existing.table.name() == join_table.name()
                        && (existing.alias.condition_index, existing.alias.chain_depth)
                            == (join_alias.condition_index, join_alias.chain_depth)
                    {
                        max_number = max_number.max(existing.alias.number + 1);
                    }
                }

                if let Some(existing_index) = found {
                    // A fanning-out relation taints the reused join as well.
                    if relation.is_to_many() {
                        self.artifacts
                            .joins
                            .get_mut(existing_index)
                            .expect("the reuse index originates from enumerating the joins")
                            .to_many = true;
                    }
                } else {
                    if max_number > 0 {
                        join_alias.number = max_number;
                        // Recalculate conditions with the updated alias
                        conditions = foreign_key_reference.conditions(current_alias, join_alias);
                    }

                    // We don't have a join statement for this column yet, so we need to create one.
                    current_alias = join_alias;
                    conditions.extend(relation.additional_conditions(join_table, join_alias));
                    if let Some(hook) = self.table_hooks.get(&join_table.name()) {
                        conditions.extend(hook(self, join_alias));
                    }

                    self.artifacts.joins.push(CompiledJoin {
                        table: join_table,
                        alias: join_alias,
                        join_type,
                        source: JoinSource::Table,
                        conditions,
                        to_many: relation.is_to_many(),
                    });
                }
            }
        }

        current_alias
    }
}

/// Entity-specific methods for property masking.
impl<'p, 'q: 'p> SelectCompiler<'p, 'q, Entity> {
    /// Configures property masking for Entity queries.
    ///
    /// When enabled, protected properties (e.g., email) will be removed from the
    /// properties JSONB in SELECT statements, unless the actor is the entity owner.
    ///
    /// This method automatically adds the necessary table joins and determines
    /// the correct aliases internally.
    pub fn with_property_masking(
        &mut self,
        property_protection_filter: &'p PropertyProtectionFilter<'p, 'q>,
    ) {
        if property_protection_filter.is_empty() {
            return;
        }

        // Store reference for lazy evaluation - parameters bound only when columns are selected
        self.property_protection_filter = Some(property_protection_filter);

        self.column_hooks.insert(
            Column::EntityEditions(EntityEditions::Properties),
            Self::remove_property_keys_for_column,
        );
        self.column_hooks.insert(
            Column::EntityEditions(EntityEditions::PropertyMetadata),
            Self::remove_property_keys_for_column,
        );
    }

    fn remove_property_keys_for_column(compiler: &mut Self, column: Expression) -> Expression {
        // Build masking expression lazily on first use
        if compiler.property_keys_to_remove.is_none()
            && let Some(filter) = compiler.property_protection_filter
        {
            compiler.property_keys_to_remove = Some(Expression::concatenate(
                filter
                    .iter()
                    .map(|(property_url, filter)| {
                        // Compile the condition - this will bind all necessary parameters
                        let condition = compiler
                            .compile_filter(filter)
                            .expect("filter should compile");

                        Expression::CaseWhen {
                            conditions: vec![(
                                condition,
                                Expression::Function(Function::ArrayLiteral {
                                    elements: vec![compiler.compile_parameter(property_url).0],
                                    element_type: PostgresType::Text,
                                }),
                            )],
                            else_result: Some(Box::new(Expression::Function(
                                Function::ArrayLiteral {
                                    elements: vec![],
                                    element_type: PostgresType::Text,
                                },
                            ))),
                        }
                    })
                    .collect(),
            ));
        }

        if let Some(keys) = compiler.property_keys_to_remove.clone() {
            // Wrap in parens so that subsequent JSON operators (-> / ->>) bind to the
            // result of the subtraction, not to `keys`. In PostgreSQL, -> has higher
            // precedence than -, so `col - keys -> 'f'` would parse as `col - (keys -> 'f')`.
            Expression::grouped(Expression::subtract(column, keys))
        } else {
            column
        }
    }
}
