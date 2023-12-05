use std::collections::{HashMap, HashSet};

use postgres_types::ToSql;
use temporal_versioning::TimeAxis;

use crate::{
    store::{
        postgres::query::{
            table::{
                EntityEditions, EntityTemporalMetadata, OntologyIds, OntologyTemporalMetadata,
            },
            Alias, AliasedColumn, AliasedTable, Column, Condition, Constant, Distinctness,
            EqualityOperator, Expression, Function, JoinExpression, OrderByExpression, Ordering,
            PostgresQueryPath, PostgresRecord, SelectExpression, SelectStatement, Table, Transpile,
            WhereExpression, WindowStatement, WithExpression,
        },
        query::{Filter, FilterExpression, Parameter, ParameterList, ParameterType},
    },
    subgraph::temporal_axes::QueryTemporalAxes,
};

// # Lifetime guidance
// - 'c relates to the lifetime of the `SelectCompiler` (most constrained by the SelectStatement)
// - 'p relates to the lifetime of the parameters, should be the longest living as they have to
//   outlive the transpiling process

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
    uses_cursor: bool,
}

pub struct SelectCompiler<'p, T> {
    statement: SelectStatement,
    artifacts: CompilerArtifacts<'p>,
    temporal_axes: Option<&'p QueryTemporalAxes>,
    table_hooks: HashMap<Table, fn(&mut Self, Alias)>,
}

impl<'p, R: PostgresRecord> SelectCompiler<'p, R> {
    /// Creates a new, empty compiler.
    pub fn new(temporal_axes: Option<&'p QueryTemporalAxes>, include_drafts: bool) -> Self {
        let mut table_hooks = HashMap::<_, fn(&mut Self, Alias)>::new();

        if temporal_axes.is_some() {
            table_hooks.insert(
                Table::EntityTemporalMetadata,
                Self::pin_entity_temporal_metadata_table,
            );
            table_hooks.insert(Table::OntologyTemporalMetadata, Self::pin_ontology_table);
        }
        if !include_drafts {
            table_hooks.insert(Table::EntityEditions, Self::filter_drafts);
        }

        Self {
            statement: SelectStatement {
                with: WithExpression::default(),
                distinct: Vec::new(),
                selects: Vec::new(),
                from: R::base_table().aliased(Alias {
                    condition_index: 0,
                    chain_depth: 0,
                    number: 0,
                }),
                joins: Vec::new(),
                where_expression: WhereExpression::default(),
                order_by_expression: OrderByExpression::default(),
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
                uses_cursor: false,
            },
            temporal_axes,
            table_hooks,
        }
    }

    /// Creates a new compiler, which will select everything using the asterisk (`*`).
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

    pub fn set_limit(&mut self, limit: usize) {
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
        if let Some(temporal_axes) = self.temporal_axes {
            if self
                .artifacts
                .table_info
                .tables
                .insert(Table::OntologyTemporalMetadata.aliased(alias))
            {
                let transaction_time_index =
                    self.time_index(temporal_axes, TimeAxis::TransactionTime);
                match temporal_axes {
                    QueryTemporalAxes::DecisionTime { .. } => {
                        self.statement.where_expression.add_condition(
                            Condition::TimeIntervalContainsTimestamp(
                                Expression::Column(
                                    Column::OntologyTemporalMetadata(
                                        OntologyTemporalMetadata::TransactionTime,
                                    )
                                    .aliased(alias),
                                ),
                                Expression::Parameter(transaction_time_index),
                            ),
                        );
                    }
                    QueryTemporalAxes::TransactionTime { .. } => {
                        self.statement
                            .where_expression
                            .add_condition(Condition::Overlap(
                                Expression::Column(
                                    Column::OntologyTemporalMetadata(
                                        OntologyTemporalMetadata::TransactionTime,
                                    )
                                    .aliased(alias),
                                ),
                                Expression::Parameter(transaction_time_index),
                            ));
                    }
                };
            }
        }
    }

    fn filter_drafts(&mut self, alias: Alias) {
        if self
            .artifacts
            .table_info
            .tables
            .insert(Table::EntityEditions.aliased(alias))
        {
            self.statement
                .where_expression
                .add_condition(Condition::Equal(
                    Some(Expression::Column(
                        Column::EntityEditions(EntityEditions::Draft).aliased(alias),
                    )),
                    Some(Expression::Constant(Constant::Boolean(false))),
                ));
        }
    }

    fn pin_entity_temporal_metadata_table(&mut self, alias: Alias) {
        if let Some(temporal_axes) = self.temporal_axes {
            if self
                .artifacts
                .table_info
                .tables
                .insert(Table::EntityTemporalMetadata.aliased(alias))
            {
                let pinned_axis = temporal_axes.pinned_time_axis();
                let variable_axis = temporal_axes.variable_time_axis();
                let pinned_time_index = self.time_index(temporal_axes, pinned_axis);
                let variable_time_index = self.time_index(temporal_axes, variable_axis);

                // Adds the pinned timestamp condition, so for the projected decision time, we use
                // the transaction time and vice versa.
                self.statement.where_expression.add_condition(
                    Condition::TimeIntervalContainsTimestamp(
                        Expression::Column(
                            Column::EntityTemporalMetadata(EntityTemporalMetadata::from_time_axis(
                                pinned_axis,
                            ))
                            .aliased(alias),
                        ),
                        Expression::Parameter(pinned_time_index),
                    ),
                );
                self.statement
                    .where_expression
                    .add_condition(Condition::Overlap(
                        Expression::Column(
                            Column::EntityTemporalMetadata(EntityTemporalMetadata::from_time_axis(
                                variable_axis,
                            ))
                            .aliased(alias),
                        ),
                        Expression::Parameter(variable_time_index),
                    ));
            }
        }
    }

    /// Adds a new path to the selection.
    ///
    /// Optionally, the added selection can be distinct or ordered by providing [`Distinctness`]
    /// and [`Ordering`].
    pub fn add_selection_path<'q>(&mut self, path: &'p R::QueryPath<'q>) -> usize
    where
        R::QueryPath<'q>: PostgresQueryPath,
    {
        let column = self.compile_path_column(path);
        self.statement
            .selects
            .push(SelectExpression::from_column(column, None));
        self.statement.selects.len() - 1
    }

    /// Adds a new path to the selection.
    ///
    /// Optionally, the added selection can be distinct or ordered by providing [`Distinctness`]
    /// and [`Ordering`].
    pub fn add_distinct_selection_with_ordering<'q>(
        &mut self,
        path: &'p R::QueryPath<'q>,
        distinctness: Distinctness,
        ordering: Option<Ordering>,
    ) -> usize
    where
        R::QueryPath<'q>: PostgresQueryPath,
    {
        let column = self.compile_path_column(path);
        if distinctness == Distinctness::Distinct {
            self.statement.distinct.push(column);
        }
        if let Some(ordering) = ordering {
            self.statement.order_by_expression.push(column, ordering);
        }
        self.statement
            .selects
            .push(SelectExpression::from_column(column, None));
        self.statement.selects.len() - 1
    }

    /// Adds a new path to the selection which can be used as cursor.
    pub fn add_cursor_selection<'q: 'p>(
        &mut self,
        path: &'p R::QueryPath<'q>,
        ordering: Ordering,
        condition: impl FnOnce(Expression) -> Condition,
    ) -> usize
    where
        R::QueryPath<'q>: PostgresQueryPath,
    {
        let column = self.compile_path_column(path);
        self.statement.distinct.push(column);
        self.statement.order_by_expression.push(column, ordering);
        self.statement
            .where_expression
            .add_condition(condition(Expression::Column(column)));
        self.statement
            .selects
            .push(SelectExpression::from_column(column, None));
        self.artifacts.uses_cursor = true;
        self.statement.selects.len() - 1
    }

    /// Adds a new filter to the selection.
    pub fn add_filter<'f: 'p>(&mut self, filter: &'p Filter<'f, R>)
    where
        R::QueryPath<'f>: PostgresQueryPath,
    {
        let condition = self.compile_filter(filter);
        self.artifacts.condition_index += 1;
        self.statement.where_expression.add_condition(condition);
    }

    /// Transpiles the statement into SQL and the parameter to be passed to a prepared statement.
    pub fn compile(&self) -> (String, &[&'p (dyn ToSql + Sync)]) {
        (
            self.statement.transpile_to_string(),
            &self.artifacts.parameters,
        )
    }

    /// Compiles a [`Filter`] to a `Condition`.
    pub fn compile_filter<'f: 'p>(&mut self, filter: &'p Filter<'f, R>) -> Condition
    where
        R::QueryPath<'f>: PostgresQueryPath,
    {
        if let Some(condition) = self.compile_special_filter(filter) {
            return condition;
        }

        match filter {
            Filter::All(filters) => Condition::All(
                filters
                    .iter()
                    .map(|filter| self.compile_filter(filter))
                    .collect(),
            ),
            Filter::Any(filters) => Condition::Any(
                filters
                    .iter()
                    .map(|filter| self.compile_filter(filter))
                    .collect(),
            ),
            Filter::Not(filter) => Condition::Not(Box::new(self.compile_filter(filter))),
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
        }
    }

    /// Compiles the `path` to a condition, which is searching for the latest version.
    ///
    ///  # Panics
    ///
    /// This function will panic if the statement has a limit or uses a cursor.
    // Warning: This adds a CTE to the statement, which is overwriting the `ontology_ids` table.
    //          When more CTEs are needed, a test should be added to cover both CTEs in one
    //          statement to ensure compatibility
    // TODO: Remove CTE to allow limit or cursor selection
    //   see https://linear.app/hash/issue/H-1442
    fn compile_latest_ontology_version_filter<'q>(
        &mut self,
        path: &R::QueryPath<'q>,
        operator: EqualityOperator,
    ) -> Condition
    where
        R::QueryPath<'q>: PostgresQueryPath,
    {
        assert!(
            self.statement.limit.is_none() && !self.artifacts.uses_cursor,
            "Cannot use latest version filter with limit or cursor",
        );

        let version_column = Column::OntologyIds(OntologyIds::Version).aliased(Alias {
            condition_index: 0,
            chain_depth: 0,
            number: 0,
        });

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
                                Expression::Column(version_column),
                            )))),
                            WindowStatement::partition_by(
                                Column::OntologyIds(OntologyIds::BaseUrl)
                                    .aliased(version_column.alias),
                            ),
                        ),
                        Some("latest_version"),
                    ),
                ],
                from: version_column.table(),
                joins: vec![],
                where_expression: WhereExpression::default(),
                order_by_expression: OrderByExpression::default(),
                limit: None,
            },
        );

        let alias = self.add_join_statements(path);
        // Join the table of `path` and compare the version to the latest version
        let latest_version_expression = Some(Expression::Column(
            Column::OntologyIds(OntologyIds::LatestVersion).aliased(alias),
        ));
        let version_expression = Some(Expression::Column(version_column.column.aliased(alias)));

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
    fn compile_special_filter<'f: 'p>(&mut self, filter: &Filter<'f, R>) -> Option<Condition>
    where
        R::QueryPath<'f>: PostgresQueryPath,
    {
        match filter {
            Filter::Equal(lhs, rhs) | Filter::NotEqual(lhs, rhs) => match (lhs, rhs) {
                (
                    Some(FilterExpression::Path(path)),
                    Some(FilterExpression::Parameter(Parameter::Text(parameter))),
                )
                | (
                    Some(FilterExpression::Parameter(Parameter::Text(parameter))),
                    Some(FilterExpression::Path(path)),
                ) => match (path.terminating_column(), filter, parameter.as_ref()) {
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
            _ => None,
        }
    }

    pub fn compile_path_column<'q>(&mut self, path: &'p R::QueryPath<'q>) -> AliasedColumn
    where
        R::QueryPath<'q>: PostgresQueryPath,
    {
        let (column, parameter) = path
            .terminating_column()
            .into_owned(self.artifacts.parameters.len() + 1);

        if let Some(parameter) = parameter {
            self.artifacts.parameters.push(parameter);
        };

        let alias = self.add_join_statements(path);

        if let Some(hook) = self.table_hooks.get(&column.table()) {
            hook(self, alias);
        }

        column.aliased(alias)
    }

    pub fn compile_parameter<'f: 'p>(
        &mut self,
        parameter: &'p Parameter<'f>,
    ) -> (Expression, ParameterType) {
        let parameter_type = match parameter {
            Parameter::Number(number) => {
                self.artifacts.parameters.push(number);
                ParameterType::Number
            }
            Parameter::Text(text) => {
                self.artifacts.parameters.push(text);
                ParameterType::Text
            }
            Parameter::Boolean(bool) => {
                self.artifacts.parameters.push(bool);
                ParameterType::Boolean
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

    pub fn compile_filter_expression<'f: 'p>(
        &mut self,
        expression: &'p FilterExpression<'f, R>,
    ) -> (Expression, ParameterType)
    where
        R::QueryPath<'f>: PostgresQueryPath,
    {
        match expression {
            FilterExpression::Path(path) => {
                let column = self.compile_path_column(path);
                let parameter_type = column.column.parameter_type();
                (Expression::Column(column), parameter_type)
            }
            FilterExpression::Parameter(parameter) => self.compile_parameter(parameter),
        }
    }

    pub fn compile_parameter_list<'f: 'p>(
        &mut self,
        parameters: &'p ParameterList<'f>,
    ) -> (Expression, ParameterType) {
        let parameter_type = match parameters {
            ParameterList::Uuid(uuids) => {
                self.artifacts.parameters.push(uuids);
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
    fn add_join_statements<'q>(&mut self, path: &R::QueryPath<'q>) -> Alias
    where
        R::QueryPath<'q>: PostgresQueryPath,
    {
        let mut current_table = self.statement.from;

        if let Some(hook) = self.table_hooks.get(&current_table.table) {
            hook(self, current_table.alias);
        }

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

                // TODO: If we join on the same column as the previous join, we can reuse the that
                //       join. For example, if we join on
                //       `entities.entity_type_ontology_id = entity_type.ontology_id` and then on
                //       `entity_type.ontology_id = ontology_ids.ontology_id`, we can merge the two
                //       joins into `entities. entity_type_ontology_id = ontology_ids.ontology_id`.
                //       We, however, need to make sure, that we only alter a join statement with a
                //       table we don't require anymore.
                //       The following code is a first attempt at this, but it is not working yet.
                //  see: https://app.asana.com/0/0/1204165137291093/f
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
                        if *existing == join_expression {
                            // We already have a join statement for this column, so we can reuse it.
                            current_table = existing.table;
                            found = true;
                            break;
                        }
                        // We already have a join statement for this table, but it's on a different
                        // column. We need to create a new join statement later on with a new,
                        // unique alias.
                        join_expression.table.alias.number += 1;
                    }
                }

                if !found {
                    // We don't have a join statement for this column yet, so we need to create one.
                    current_table = join_expression.table;
                    self.statement.joins.push(join_expression);

                    for condition in relation.additional_conditions(current_table) {
                        self.statement.where_expression.add_condition(condition);
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
