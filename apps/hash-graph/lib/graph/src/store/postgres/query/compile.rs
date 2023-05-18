use std::{collections::HashSet, fmt::Display, marker::PhantomData};

use postgres_types::ToSql;
use tokio_postgres::row::RowIndex;

use crate::{
    store::{
        postgres::query::{
            table::{EntityTemporalMetadata, OntologyIds},
            Alias, AliasedColumn, AliasedTable, Column, Condition, Distinctness, EqualityOperator,
            Expression, Function, JoinExpression, OrderByExpression, Ordering, PostgresQueryPath,
            PostgresRecord, SelectExpression, SelectStatement, Table, Transpile, WhereExpression,
            WindowStatement, WithExpression,
        },
        query::{Filter, FilterExpression, Parameter, ParameterType},
    },
    subgraph::temporal_axes::QueryTemporalAxes,
};

// # Lifetime guidance
// - 'c relates to the lifetime of the `SelectCompiler` (most constrained by the SelectStatement)
// - 'p relates to the lifetime of the parameters, should be the longest living as they have to
//   outlive the transpiling process

pub struct TemporalTableInfo {
    tables: HashSet<AliasedTable>,
    pinned_timestamp_index: usize,
    variable_interval_index: usize,
}

pub struct CompilerArtifacts<'p> {
    parameters: Vec<&'p (dyn ToSql + Sync)>,
    condition_index: usize,
    required_tables: HashSet<AliasedTable>,
    temporal_tables: Option<TemporalTableInfo>,
}

pub struct SelectCompiler<'p, T> {
    statement: SelectStatement,
    artifacts: CompilerArtifacts<'p>,
    temporal_axes: Option<&'p QueryTemporalAxes>,
    _marker: PhantomData<fn(*const T)>,
}

impl<'p, R: PostgresRecord> SelectCompiler<'p, R> {
    /// Creates a new, empty compiler.
    pub fn new(temporal_axes: Option<&'p QueryTemporalAxes>) -> Self {
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
            },
            artifacts: CompilerArtifacts {
                parameters: Vec::new(),
                condition_index: 0,
                required_tables: HashSet::new(),
                temporal_tables: None,
            },
            temporal_axes,
            _marker: PhantomData,
        }
    }

    /// Creates a new compiler, which will select everything using the asterisk (`*`).
    pub fn with_asterisk(temporal_axes: Option<&'p QueryTemporalAxes>) -> Self {
        let mut default = Self::new(temporal_axes);
        default
            .statement
            .selects
            .push(SelectExpression::new(Expression::Asterisk, None));
        default
    }

    fn pin_entity_table(&mut self, alias: Alias) {
        if let Some(temporal_axes) = self.temporal_axes {
            let table = Table::EntityTemporalMetadata.aliased(alias);
            let temporal_table_info = self.artifacts.temporal_tables.get_or_insert_with(|| {
                match temporal_axes {
                    QueryTemporalAxes::DecisionTime { pinned, variable } => {
                        self.artifacts.parameters.push(&pinned.timestamp);
                        self.artifacts.parameters.push(&variable.interval);
                    }
                    QueryTemporalAxes::TransactionTime { pinned, variable } => {
                        self.artifacts.parameters.push(&pinned.timestamp);
                        self.artifacts.parameters.push(&variable.interval);
                    }
                };

                TemporalTableInfo {
                    tables: HashSet::new(),
                    pinned_timestamp_index: self.artifacts.parameters.len() - 1,
                    variable_interval_index: self.artifacts.parameters.len(),
                }
            });

            if !temporal_table_info.tables.contains(&table) {
                // Adds the pinned timestamp condition, so for the projected decision time, we use
                // the transaction time and vice versa.
                self.statement.where_expression.add_condition(
                    Condition::TimeIntervalContainsTimestamp(
                        Expression::Column(
                            Column::EntityTemporalMetadata(EntityTemporalMetadata::from_time_axis(
                                temporal_axes.pinned_time_axis(),
                            ))
                            .aliased(alias),
                        ),
                        Expression::Parameter(temporal_table_info.pinned_timestamp_index),
                    ),
                );
                self.statement
                    .where_expression
                    .add_condition(Condition::Overlap(
                        Expression::Column(
                            Column::EntityTemporalMetadata(EntityTemporalMetadata::from_time_axis(
                                temporal_axes.variable_time_axis(),
                            ))
                            .aliased(alias),
                        ),
                        Expression::Parameter(temporal_table_info.variable_interval_index),
                    ));
                temporal_table_info.tables.insert(table);
            }
        }
    }

    /// Adds a new path to the selection.
    ///
    /// Optionally, the added selection can be distinct or ordered by providing [`Distinctness`]
    /// and [`Ordering`].
    pub fn add_selection_path<'q>(
        &mut self,
        path: &'p R::QueryPath<'q>,
    ) -> impl RowIndex + Display + Copy
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
    ) -> impl RowIndex + Display + Copy
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
    // Warning: This adds a CTE to the statement, which is overwriting the `ontology_ids` table.
    // When          more CTEs are needed, a test should be added to cover both CTEs in one
    // statement to          ensure compatibility
    fn compile_latest_ontology_version_filter<'q>(
        &mut self,
        path: &R::QueryPath<'q>,
        operator: EqualityOperator,
    ) -> Condition
    where
        R::QueryPath<'q>: PostgresQueryPath,
    {
        let version_column = Column::OntologyIds(OntologyIds::Version).aliased(Alias {
            condition_index: 0,
            chain_depth: 0,
            number: 0,
        });

        // Add a WITH expression selecting the partitioned version
        self.statement
            .with
            .add_statement(Table::OntologyIds, SelectStatement {
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
            });

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

        if matches!(column, Column::EntityTemporalMetadata(_)) {
            self.pin_entity_table(alias);
        }
        column.aliased(alias)
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
            FilterExpression::Parameter(parameter) => {
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
                };
                (
                    Expression::Parameter(self.artifacts.parameters.len()),
                    parameter_type,
                )
            }
        }
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

        if current_table.table == Table::EntityTemporalMetadata {
            self.pin_entity_table(current_table.alias);
        }

        for relation in path.relations() {
            for foreign_key_reference in relation.joins() {
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

                    if current_table.table == Table::EntityTemporalMetadata {
                        self.pin_entity_table(current_table.alias);
                    }
                }
            }
        }

        self.artifacts.required_tables.insert(current_table);
        current_table.alias
    }
}
