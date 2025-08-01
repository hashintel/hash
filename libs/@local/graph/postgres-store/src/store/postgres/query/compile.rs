use alloc::borrow::Cow;
use core::{iter::once, mem};
use std::collections::{HashMap, HashSet};

use error_stack::{Report, bail, ensure};
use hash_graph_store::{
    filter::{
        Filter, FilterExpression, Parameter, ParameterList, ParameterType, PathToken, QueryRecord,
    },
    query::{NullOrdering, Ordering},
    subgraph::temporal_axes::QueryTemporalAxes,
};
use hash_graph_temporal_versioning::TimeAxis;
use postgres_types::ToSql;
use tracing::instrument;

use super::expression::JoinType;
use crate::store::postgres::query::{
    Alias, AliasedTable, Column, Condition, Distinctness, EqualityOperator, Expression, Function,
    JoinExpression, OrderByExpression, PostgresQueryPath, PostgresRecord, SelectExpression,
    SelectStatement, Table, Transpile as _, WhereExpression, WindowStatement, WithExpression,
    expression::{GroupByExpression, PostgresType},
    statement::FromItem,
    table::{
        DataTypeEmbeddings, DatabaseColumn as _, EntityEmbeddings, EntityTemporalMetadata,
        EntityTypeEmbeddings, EntityTypes, JsonField, OntologyIds, OntologyTemporalMetadata,
        PropertyTypeEmbeddings,
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

pub struct TableInfo {
    tables: HashSet<AliasedTable>,
    pinned_timestamp_index: Option<usize>,
    variable_interval_index: Option<usize>,
}

pub struct CompilerArtifacts<'p> {
    parameters: Vec<&'p (dyn ToSql + Sync)>,
    condition_index: usize,
    required_tables: HashSet<AliasedTable>,
    table_info: TableInfo,
    cursor_disallowed_reason: Option<&'static str>,
}

struct PathSelection {
    column: Expression,
    index: usize,
    distinctness: Distinctness,
    ordering: Option<(Ordering, Option<NullOrdering>)>,
}

pub struct SelectCompiler<'p, 'q: 'p, T: QueryRecord> {
    statement: SelectStatement,
    artifacts: CompilerArtifacts<'p>,
    temporal_axes: Option<&'p QueryTemporalAxes>,
    include_drafts: bool,
    table_hooks: HashMap<Table, fn(&mut Self, Alias)>,
    selections: HashMap<&'p T::QueryPath<'q>, PathSelection>,
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum SelectCompilerError {
    #[display("Cannot convert parameter for distance function")]
    ConvertDistanceParameter,
    #[display("Only a single embedding for the same path is allowed")]
    MultipleEmbeddings,
    #[display("Only embeddings are supported for cosine distance")]
    UnsupportedEmbeddingPath,
    #[display(
        "Cosine distance is only supported with exactly one `path` and one `parameter` expression."
    )]
    UnsupportedDistanceExpression,
    #[display("Cannot add a cursor: {reason}")]
    CursorDisallowed { reason: &'static str },
}

impl<'p, 'q: 'p, R: PostgresRecord> SelectCompiler<'p, 'q, R> {
    /// Creates a new, empty compiler.
    pub fn new(temporal_axes: Option<&'p QueryTemporalAxes>, include_drafts: bool) -> Self {
        let mut table_hooks = HashMap::<_, fn(&mut Self, Alias)>::new();

        if temporal_axes.is_some() {
            table_hooks.insert(Table::OntologyTemporalMetadata, Self::pin_ontology_table);
        }
        if temporal_axes.is_some() || !include_drafts {
            table_hooks.insert(
                Table::EntityTemporalMetadata,
                Self::filter_temporal_metadata,
            );
        }

        Self {
            statement: SelectStatement {
                with: WithExpression::default(),
                distinct: Vec::new(),
                selects: Vec::new(),
                from: FromItem::Table {
                    table: R::base_table(),
                    alias: Some(Alias {
                        condition_index: 0,
                        chain_depth: 0,
                        number: 0,
                    }),
                },
                joins: Vec::new(),
                where_expression: WhereExpression::default(),
                order_by_expression: OrderByExpression::default(),
                group_by_expression: GroupByExpression::default(),
                limit: None,
            },
            artifacts: CompilerArtifacts {
                parameters: Vec::new(),
                condition_index: 0,
                required_tables: HashSet::new(),
                table_info: TableInfo {
                    tables: HashSet::new(),
                    pinned_timestamp_index: None,
                    variable_interval_index: None,
                },
                cursor_disallowed_reason: None,
            },
            temporal_axes,
            table_hooks,
            include_drafts,
            selections: HashMap::new(),
        }
    }

    /// Creates a new compiler, which will select everything using the asterisk (`*`).
    #[must_use]
    pub fn with_asterisk(
        temporal_axes: Option<&'p QueryTemporalAxes>,
        include_drafts: bool,
    ) -> Self {
        let mut default = Self::new(temporal_axes, include_drafts);
        default
            .statement
            .selects
            .push(SelectExpression::new(Expression::Asterisk, None));
        default
    }

    pub const fn set_limit(&mut self, limit: usize) {
        self.statement.limit = Some(limit);
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

    fn pin_ontology_table(&mut self, alias: Alias) {
        let table = Table::OntologyTemporalMetadata.aliased(alias);
        if let Some(temporal_axes) = self.temporal_axes
            && self.artifacts.table_info.tables.insert(table)
        {
            let transaction_time_index = self.time_index(temporal_axes, TimeAxis::TransactionTime);
            match temporal_axes {
                QueryTemporalAxes::DecisionTime { .. } => {
                    self.add_condition(
                        Condition::TimeIntervalContainsTimestamp(
                            Expression::ColumnReference {
                                column: Column::OntologyTemporalMetadata(
                                    OntologyTemporalMetadata::TransactionTime,
                                ),
                                table_alias: Some(alias),
                            },
                            Expression::Parameter(transaction_time_index),
                        ),
                        Some(table),
                    );
                }
                QueryTemporalAxes::TransactionTime { .. } => {
                    self.add_condition(
                        Condition::Overlap(
                            Expression::ColumnReference {
                                column: Column::OntologyTemporalMetadata(
                                    OntologyTemporalMetadata::TransactionTime,
                                ),
                                table_alias: Some(alias),
                            },
                            Expression::Parameter(transaction_time_index),
                        ),
                        Some(table),
                    );
                }
            }
        }
    }

    fn filter_temporal_metadata(&mut self, alias: Alias) {
        let table = Table::EntityTemporalMetadata.aliased(alias);
        if self.artifacts.table_info.tables.insert(table) {
            if !self.include_drafts {
                self.add_condition(
                    Condition::Equal(
                        Some(Expression::ColumnReference {
                            column: Column::EntityTemporalMetadata(EntityTemporalMetadata::DraftId),
                            table_alias: Some(alias),
                        }),
                        None,
                    ),
                    Some(table),
                );
            }

            if let Some(temporal_axes) = self.temporal_axes {
                let pinned_axis = temporal_axes.pinned_time_axis();
                let variable_axis = temporal_axes.variable_time_axis();
                let pinned_time_index = self.time_index(temporal_axes, pinned_axis);
                let variable_time_index = self.time_index(temporal_axes, variable_axis);

                // Adds the pinned timestamp condition, so for the projected decision time, we use
                // the transaction time and vice versa.
                self.add_condition(
                    Condition::TimeIntervalContainsTimestamp(
                        Expression::ColumnReference {
                            column: Column::EntityTemporalMetadata(
                                EntityTemporalMetadata::from_time_axis(pinned_axis),
                            ),
                            table_alias: Some(alias),
                        },
                        Expression::Parameter(pinned_time_index),
                    ),
                    Some(table),
                );
                self.add_condition(
                    Condition::Overlap(
                        Expression::ColumnReference {
                            column: Column::EntityTemporalMetadata(
                                EntityTemporalMetadata::from_time_axis(variable_axis),
                            ),
                            table_alias: Some(alias),
                        },
                        Expression::Parameter(variable_time_index),
                    ),
                    Some(table),
                );
            }
        }
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
                self.statement.distinct.push(stored.column.clone());
                stored.distinctness = Distinctness::Distinct;
            }
            if stored.ordering.is_none()
                && let Some((ordering, nulls)) = ordering
            {
                self.statement
                    .order_by_expression
                    .push(stored.column.clone(), ordering, nulls);
                stored.ordering = Some((ordering, nulls));
            }
            stored.index
        } else {
            let expression = self.compile_path_column(path);
            self.statement
                .selects
                .push(SelectExpression::new(expression.clone(), None));

            if distinctness == Distinctness::Distinct {
                self.statement.distinct.push(expression.clone());
            }
            if let Some((ordering, nulls)) = ordering {
                self.statement
                    .order_by_expression
                    .push(expression.clone(), ordering, nulls);
            }

            let index = self.statement.selects.len() - 1;
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

    fn add_condition(&mut self, condition: Condition, table: Option<AliasedTable>) {
        // If a table is provided and we have a join on that table, we add the condition to the
        // join.
        if let Some(join) = table.and_then(|table| {
            self.statement
                .joins
                .iter_mut()
                .find(|join| join.table == table)
        }) {
            join.additional_conditions.push(condition);
        } else {
            self.statement.where_expression.add_condition(condition);
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
        let column = self.compile_path_column(path);
        self.statement
            .where_expression
            .add_cursor(lhs(column), rhs, ordering, null_ordering);
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
        self.add_condition(condition, None);
        Ok(())
    }

    /// Transpiles the statement into SQL and the parameter to be passed to a prepared statement.
    #[instrument(level = "info", skip_all)]
    pub fn compile(&self) -> (String, &[&'p (dyn ToSql + Sync)]) {
        (
            self.statement.transpile_to_string(),
            &self.artifacts.parameters,
        )
    }

    /// Compiles a [`Filter`] to a `Condition`.
    ///
    /// # Errors
    ///
    /// Returns an error if the filter compilation fails.
    #[expect(clippy::too_many_lines)]
    #[instrument(level = "debug", skip_all)]
    pub fn compile_filter<'f: 'q>(
        &mut self,
        filter: &'p Filter<'f, R>,
    ) -> Result<Condition, Report<SelectCompilerError>>
    where
        R::QueryPath<'f>: PostgresQueryPath,
    {
        if let Some(condition) = self.compile_special_filter(filter) {
            return Ok(condition);
        }

        Ok(match filter {
            Filter::All(filters) => Condition::All(
                filters
                    .iter()
                    .map(|filter| self.compile_filter(filter))
                    .collect::<Result<_, _>>()?,
            ),
            Filter::Any(filters) => Condition::Any(
                filters
                    .iter()
                    .map(|filter| self.compile_filter(filter))
                    .collect::<Result<_, _>>()?,
            ),
            Filter::Not(filter) => Condition::Not(Box::new(self.compile_filter(filter)?)),
            Filter::Equal(lhs, rhs) => Condition::Equal(
                lhs.as_ref()
                    .map(|expression| self.compile_filter_expression(expression).0),
                rhs.as_ref()
                    .map(|expression| self.compile_filter_expression(expression).0),
            ),
            Filter::NotEqual(lhs, rhs) => Condition::NotEqual(
                lhs.as_ref()
                    .map(|expression| self.compile_filter_expression(expression).0),
                rhs.as_ref()
                    .map(|expression| self.compile_filter_expression(expression).0),
            ),
            Filter::Greater(lhs, rhs) => Condition::Greater(
                self.compile_filter_expression(lhs).0,
                self.compile_filter_expression(rhs).0,
            ),
            Filter::GreaterOrEqual(lhs, rhs) => Condition::GreaterOrEqual(
                self.compile_filter_expression(lhs).0,
                self.compile_filter_expression(rhs).0,
            ),
            Filter::Less(lhs, rhs) => Condition::Less(
                self.compile_filter_expression(lhs).0,
                self.compile_filter_expression(rhs).0,
            ),
            Filter::LessOrEqual(lhs, rhs) => Condition::LessOrEqual(
                self.compile_filter_expression(lhs).0,
                self.compile_filter_expression(rhs).0,
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
                    let maximum_expression = self.compile_filter_expression(max).0;

                    let (embeddings_column, None) = path.terminating_column() else {
                        bail!(SelectCompilerError::UnsupportedEmbeddingPath);
                    };
                    let embeddings_table = embeddings_column.table();
                    let embeddings_alias = Alias {
                        condition_index: 0,
                        chain_depth: 0,
                        number: 0,
                    };
                    let distance_expression = Expression::ColumnReference {
                        column: match embeddings_table {
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
                            | Table::FirstTitleForEntity
                            | Table::LastTitleForEntity
                            | Table::FirstLabelForEntity
                            | Table::LastLabelForEntity
                            | Table::EntityIds
                            | Table::EntityDrafts
                            | Table::EntityTemporalMetadata
                            | Table::EntityEditions
                            | Table::EntityIsOfType
                            | Table::EntityIsOfTypeIds
                            | Table::EntityHasLeftEntity
                            | Table::EntityHasRightEntity
                            | Table::Reference(_) => {
                                bail!(SelectCompilerError::UnsupportedEmbeddingPath)
                            }
                        },
                        table_alias: Some(path_alias),
                    };

                    if let Some(last_join) = self.statement.joins.last_mut() {
                        ensure!(
                            matches!(
                                last_join.table.table,
                                Table::DataTypeEmbeddings
                                    | Table::PropertyTypeEmbeddings
                                    | Table::EntityTypeEmbeddings
                                    | Table::EntityEmbeddings
                            ) || last_join.statement.is_some(),
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
                            | Table::FirstTitleForEntity
                            | Table::LastTitleForEntity
                            | Table::FirstLabelForEntity
                            | Table::LastLabelForEntity
                            | Table::EntityIds
                            | Table::EntityDrafts
                            | Table::EntityTemporalMetadata
                            | Table::EntityEditions
                            | Table::EntityIsOfType
                            | Table::EntityIsOfTypeIds
                            | Table::EntityHasLeftEntity
                            | Table::EntityHasRightEntity
                            | Table::Reference(_) => unreachable!(),
                        };

                        last_join.statement = Some(SelectStatement {
                            with: WithExpression::default(),
                            distinct: vec![],
                            selects: select_columns
                                .iter()
                                .map(|&column| {
                                    SelectExpression::new(
                                        Expression::ColumnReference {
                                            column,
                                            table_alias: Some(embeddings_alias),
                                        },
                                        None,
                                    )
                                })
                                .chain(once(SelectExpression::new(
                                    Expression::Function(Function::Min(Box::new(
                                        Expression::CosineDistance(
                                            Box::new(Expression::ColumnReference {
                                                column: embeddings_column,
                                                table_alias: Some(embeddings_alias),
                                            }),
                                            Box::new(parameter_expression),
                                        ),
                                    ))),
                                    Some("distance"),
                                )))
                                .collect(),
                            from: FromItem::Table {
                                table: embeddings_table,
                                alias: Some(embeddings_alias),
                            },
                            joins: vec![],
                            where_expression: WhereExpression::default(),
                            order_by_expression: OrderByExpression::default(),
                            group_by_expression: GroupByExpression {
                                expressions: select_columns
                                    .iter()
                                    .map(|&column| Expression::ColumnReference {
                                        column,
                                        table_alias: Some(embeddings_alias),
                                    })
                                    .collect(),
                            },
                            limit: None,
                        });
                    }

                    self.statement.order_by_expression.insert_front(
                        distance_expression.clone(),
                        Ordering::Ascending,
                        None,
                    );
                    self.statement
                        .selects
                        .push(SelectExpression::new(distance_expression.clone(), None));
                    self.statement.distinct.push(distance_expression.clone());
                    Condition::LessOrEqual(distance_expression, maximum_expression)
                }
                _ => bail!(SelectCompilerError::UnsupportedDistanceExpression),
            },
            Filter::In(lhs, rhs) => Condition::In(
                self.compile_filter_expression(lhs).0,
                self.compile_parameter_list(rhs).0,
            ),
            Filter::StartsWith(lhs, rhs) => {
                let (left_filter, left_parameter) = self.compile_filter_expression(lhs);
                let left_filter = if left_parameter == ParameterType::Any {
                    Expression::Function(Function::JsonExtractText(Box::new(left_filter)))
                } else {
                    left_filter
                };

                let (right_filter, right_parameter) = self.compile_filter_expression(rhs);
                let right_filter = if right_parameter == ParameterType::Any {
                    Expression::Function(Function::JsonExtractText(Box::new(right_filter)))
                } else {
                    right_filter
                };

                Condition::StartsWith(left_filter, right_filter)
            }
            Filter::EndsWith(lhs, rhs) => {
                let (left_filter, left_parameter) = self.compile_filter_expression(lhs);
                let left_filter = if left_parameter == ParameterType::Any {
                    Expression::Function(Function::JsonExtractText(Box::new(left_filter)))
                } else {
                    left_filter
                };

                let (right_filter, right_parameter) = self.compile_filter_expression(rhs);
                let right_filter = if right_parameter == ParameterType::Any {
                    Expression::Function(Function::JsonExtractText(Box::new(right_filter)))
                } else {
                    right_filter
                };

                Condition::EndsWith(left_filter, right_filter)
            }
            Filter::ContainsSegment(lhs, rhs) => {
                let (left_filter, left_parameter) = self.compile_filter_expression(lhs);
                let left_filter = if left_parameter == ParameterType::Any {
                    Expression::Function(Function::JsonExtractText(Box::new(left_filter)))
                } else {
                    left_filter
                };

                let (right_filter, right_parameter) = self.compile_filter_expression(rhs);
                let right_filter = if right_parameter == ParameterType::Any {
                    Expression::Function(Function::JsonExtractText(Box::new(right_filter)))
                } else {
                    right_filter
                };

                Condition::ContainsSegment(left_filter, right_filter)
            }
        })
    }

    /// Compiles the `path` to a condition, which is searching for the latest version.
    // Warning: This adds a CTE to the statement, which is overwriting the `ontology_ids` table.
    //          When more CTEs are needed, a test should be added to cover both CTEs in one
    //          statement to ensure compatibility
    // TODO: Remove CTE to allow limit or cursor selection
    //   see https://linear.app/hash/issue/H-1442
    #[instrument(level = "debug", skip_all)]
    fn compile_latest_ontology_version_filter<'f: 'q>(
        &mut self,
        path: &R::QueryPath<'f>,
        operator: EqualityOperator,
    ) -> Condition
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
        self.statement.with.add_statement(
            Table::OntologyIds,
            SelectStatement {
                with: WithExpression::default(),
                distinct: Vec::new(),
                selects: vec![
                    SelectExpression::new(Expression::Asterisk, None),
                    SelectExpression::new(
                        Expression::Window(
                            Box::new(Expression::Function(Function::Max(Box::new(
                                Expression::ColumnReference {
                                    column: version_column,
                                    table_alias: Some(alias),
                                },
                            )))),
                            WindowStatement::partition_by(Expression::ColumnReference {
                                column: Column::OntologyIds(OntologyIds::BaseUrl),
                                table_alias: Some(alias),
                            }),
                        ),
                        Some("latest_version"),
                    ),
                ],
                from: FromItem::Table {
                    table: version_column.table(),
                    alias: Some(alias),
                },
                joins: vec![],
                where_expression: WhereExpression::default(),
                order_by_expression: OrderByExpression::default(),
                group_by_expression: GroupByExpression::default(),
                limit: None,
            },
        );

        let alias = self.add_join_statements(path);
        // Join the table of `path` and compare the version to the latest version
        let latest_version_expression = Some(Expression::ColumnReference {
            column: Column::OntologyIds(OntologyIds::LatestVersion),
            table_alias: Some(alias),
        });
        let version_expression = Some(Expression::ColumnReference {
            column: version_column,
            table_alias: Some(alias),
        });

        match operator {
            EqualityOperator::Equal => {
                Condition::Equal(version_expression, latest_version_expression)
            }
            EqualityOperator::NotEqual => {
                Condition::NotEqual(version_expression, latest_version_expression)
            }
        }
    }

    /// Searches for [`Filter`]s, which requires special treatment and returns the corresponding
    /// condition if any.
    ///
    /// The following [`Filter`]s will be special cased:
    /// - Comparing the `"version"` field on [`Table::OntologyIds`] with `"latest"` for equality.
    #[instrument(level = "info", skip(self, filter))]
    fn compile_special_filter<'f: 'q>(&mut self, filter: &'p Filter<'f, R>) -> Option<Condition>
    where
        R::QueryPath<'f>: PostgresQueryPath,
    {
        match filter {
            Filter::Equal(lhs, rhs) | Filter::NotEqual(lhs, rhs) => match (lhs, rhs) {
                (
                    Some(FilterExpression::Path { path }),
                    Some(FilterExpression::Parameter {
                        parameter: Parameter::Text(parameter),
                        convert: None,
                    }),
                )
                | (
                    Some(FilterExpression::Parameter {
                        parameter: Parameter::Text(parameter),
                        convert: None,
                    }),
                    Some(FilterExpression::Path { path }),
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

        if let Some(hook) = self.table_hooks.get(&column.table()) {
            hook(self, alias);
        }

        let column_expression = Expression::ColumnReference {
            column,
            table_alias: Some(alias),
        };

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
            Some(JsonField::Label { inheritance_depth }) => {
                if let Some(label_path) =
                    <R as QueryRecord>::QueryPath::label_property_path(inheritance_depth)
                {
                    Expression::Function(Function::JsonExtractPath(vec![
                        column_expression,
                        Expression::Function(Function::JsonExtractAsText(
                            Box::new(Expression::ColumnReference {
                                column: Column::EntityTypes(EntityTypes::Schema),
                                table_alias: Some(self.add_join_statements(&label_path)),
                            }),
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
                self.artifacts.parameters.push(version);
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
    pub fn compile_filter_expression<'f: 'q>(
        &mut self,
        expression: &'p FilterExpression<'f, R>,
    ) -> (Expression, ParameterType)
    where
        R::QueryPath<'f>: PostgresQueryPath,
    {
        match expression {
            FilterExpression::Path { path } => {
                let (column, json_field) = path.terminating_column();
                let parameter_type = if let Some(JsonField::StaticText(_)) = json_field {
                    ParameterType::Text
                } else {
                    column.parameter_type()
                };
                (self.compile_path_column(path), parameter_type)
            }
            FilterExpression::Parameter { parameter, convert } => {
                if convert.is_some() {
                    unimplemented!("Cannot convert parameter at this stage");
                }
                self.compile_parameter(parameter)
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
    /// Joining the tables attempts to deduplicate [`JoinExpression`]s. As soon as a new filter was
    /// compiled, each subsequent call will result in a new join-chain.
    ///
    /// [`Relation`]: super::table::Relation
    #[instrument(level = "debug", skip_all)]
    fn add_join_statements<'f: 'q>(&mut self, path: &R::QueryPath<'f>) -> Alias
    where
        R::QueryPath<'f>: PostgresQueryPath,
    {
        let mut current_table = AliasedTable {
            table: R::base_table(),
            alias: Alias {
                condition_index: 0,
                chain_depth: 0,
                number: 0,
            },
        };

        if let Some(hook) = self.table_hooks.get(&current_table.table) {
            hook(self, current_table.alias);
        }

        let mut is_outer_join_chain = false;
        for relation in path.relations() {
            let foreign_key_join = relation.joins();
            for foreign_key_reference in foreign_key_join {
                let mut join_expression = JoinExpression::from_foreign_key(
                    foreign_key_reference,
                    current_table.alias,
                    Alias {
                        condition_index: self.artifacts.condition_index,
                        chain_depth: current_table.alias.chain_depth + 1,
                        number: 0,
                    },
                );

                if is_outer_join_chain {
                    join_expression.join = JoinType::LeftOuter;
                } else if join_expression.join != JoinType::Inner {
                    is_outer_join_chain = true;
                } else {
                    // Join is Inner type, keep as-is
                }

                // TODO: If we join on the same column as the previous join, we can reuse the that
                //       join. For example, if we join on
                //       `entities.entity_type_ontology_id = entity_type.ontology_id` and then on
                //       `entity_type.ontology_id = ontology_ids.ontology_id`, we can merge the two
                //       joins into `entities. entity_type_ontology_id = ontology_ids.ontology_id`.
                //       We, however, need to make sure, that we only alter a join statement with a
                //       table we don't require anymore.
                //       The following code is a first attempt at this, but it is not working yet.
                //   see https://linear.app/hash/issue/H-3015
                // if let Some(last_join) = self.statement.joins.pop() {
                //     // Check if we are joining on the same column as the previous join
                //     if last_join.join == current_column
                //         && !self
                //             .artifacts
                //             .required_tables
                //             .contains(&last_join.join.table())
                //     {
                //         current_column = last_join.on;
                //     } else {
                //         self.statement.joins.push(last_join);
                //     }
                // }

                let mut found = false;
                for existing in &self.statement.joins {
                    if existing.table == join_expression.table {
                        // We only need to check the join conditions, not the join type or
                        // additional conditions. This is enough to reuse an existing join
                        // statement.
                        if existing.on == join_expression.on
                            && existing.on_alias == join_expression.on_alias
                        {
                            // We already have a join statement for this column, so we can reuse it.
                            current_table = existing.table;
                            found = true;
                            break;
                        }
                        // We already have a join statement for this table, but it's on a different
                        // column. We need to create a new join statement later on with a new,
                        // unique alias.
                        join_expression.table.alias.number += 1;
                    } else if let (Table::Reference(lhs), Table::Reference(rhs)) =
                        (&existing.table.table, &join_expression.table.table)
                        && mem::discriminant(lhs) == mem::discriminant(rhs)
                        && existing.table.alias == join_expression.table.alias
                    {
                        // We have a join statement for the same table but with different
                        // conditions.
                        join_expression.table.alias.number += 1;
                    } else {
                        // No alias conflict, continue with existing alias
                    }
                }

                if !found {
                    // We don't have a join statement for this column yet, so we need to create one.
                    current_table = join_expression.table;
                    self.statement.joins.push(join_expression);

                    for condition in relation.additional_conditions(current_table) {
                        self.add_condition(condition, Some(current_table));
                    }

                    if let Some(hook) = self.table_hooks.get(&current_table.table) {
                        hook(self, current_table.alias);
                    }
                }
            }
        }

        self.artifacts.required_tables.insert(current_table);
        current_table.alias
    }
}
