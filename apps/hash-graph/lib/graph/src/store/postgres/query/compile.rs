use std::{borrow::Cow, collections::HashSet, fmt::Display, marker::PhantomData};

use postgres_types::ToSql;
use tokio_postgres::row::RowIndex;

use crate::{
    store::{
        postgres::query::{
            expression::Constant,
            table::{
                DataTypes, Entities, EntityTypes, JsonField, OntologyIds, PropertyTypes, Relation,
            },
            Alias, AliasedColumn, AliasedTable, Column, Condition, Distinctness, EqualityOperator,
            Expression, Function, JoinExpression, OrderByExpression, Ordering, PostgresQueryPath,
            PostgresRecord, SelectExpression, SelectStatement, Table, Transpile, WhereExpression,
            WindowStatement, WithExpression,
        },
        query::{Filter, FilterExpression, Parameter},
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

pub struct SelectCompiler<'c, 'p, T> {
    statement: SelectStatement<'c>,
    artifacts: CompilerArtifacts<'p>,
    temporal_axes: &'p QueryTemporalAxes,
    _marker: PhantomData<fn(*const T)>,
}

impl<'c, 'p: 'c, R: PostgresRecord> SelectCompiler<'c, 'p, R> {
    /// Creates a new, empty compiler.
    pub fn new(temporal_axes: &'p QueryTemporalAxes) -> Self {
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
    pub fn with_asterisk(temporal_axes: &'p QueryTemporalAxes) -> Self {
        let mut default = Self::new(temporal_axes);
        default
            .statement
            .selects
            .push(SelectExpression::new(Expression::Asterisk, None));
        default
    }

    fn pin_entity_table(&mut self, alias: Alias) {
        let table = Table::Entities.aliased(alias);
        let temporal_table_info = self.artifacts.temporal_tables.get_or_insert_with(|| {
            match self.temporal_axes {
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
            // Adds the pinned timestamp condition, so for the projected decision time, we use the
            // transaction time and vice versa.
            self.statement.where_expression.add_condition(
                Condition::TimeIntervalContainsTimestamp(
                    Expression::Column(
                        Column::Entities(Entities::from_time_axis(
                            self.temporal_axes.pinned_time_axis(),
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
                        Column::Entities(Entities::from_time_axis(
                            self.temporal_axes.variable_time_axis(),
                        ))
                        .aliased(alias),
                    ),
                    Expression::Parameter(temporal_table_info.variable_interval_index),
                ));
            temporal_table_info.tables.insert(table);
        }
    }

    /// Adds a new path to the selection.
    ///
    /// Optionally, the added selection can be distinct or ordered by providing [`Distinctness`]
    /// and [`Ordering`].
    pub fn add_selection_path(
        &mut self,
        path: &'c R::QueryPath<'_>,
    ) -> impl RowIndex + Display + Copy {
        let alias = self.add_join_statements(path);
        self.statement.selects.push(SelectExpression::from_column(
            path.terminating_column().aliased(alias),
            None,
        ));
        self.statement.selects.len() - 1
    }

    /// Adds a new path to the selection.
    ///
    /// Optionally, the added selection can be distinct or ordered by providing [`Distinctness`]
    /// and [`Ordering`].
    pub fn add_distinct_selection_with_ordering(
        &mut self,
        path: &'c R::QueryPath<'_>,
        distinctness: Distinctness,
        ordering: Option<Ordering>,
    ) -> impl RowIndex + Display + Copy {
        let column = path
            .terminating_column()
            .aliased(self.add_join_statements(path));
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
    pub fn add_filter<'f: 'p>(&mut self, filter: &'p Filter<'f, R>) {
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
    pub fn compile_filter<'f: 'p>(&mut self, filter: &'p Filter<'f, R>) -> Condition<'c> {
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
                    .map(|expression| self.compile_filter_expression(expression)),
                rhs.as_ref()
                    .map(|expression| self.compile_filter_expression(expression)),
            ),
            Filter::NotEqual(lhs, rhs) => Condition::NotEqual(
                lhs.as_ref()
                    .map(|expression| self.compile_filter_expression(expression)),
                rhs.as_ref()
                    .map(|expression| self.compile_filter_expression(expression)),
            ),
        }
    }

    /// Compiles the `path` to a condition, which is searching for the latest version.
    // Warning: This adds a CTE to the statement, which is overwriting the `ontology_ids` table.
    // When          more CTEs are needed, a test should be added to cover both CTEs in one
    // statement to          ensure compatibility
    fn compile_latest_ontology_version_filter(
        &mut self,
        path: &R::QueryPath<'_>,
        operator: EqualityOperator,
    ) -> Condition<'c> {
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
                                Column::OntologyIds(OntologyIds::BaseUri)
                                    .aliased(version_column.alias),
                            ),
                        ),
                        Some(Cow::Borrowed("latest_version")),
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

    fn compile_latest_entity_version_filter(
        &mut self,
        path: &R::QueryPath<'_>,
        operator: EqualityOperator,
    ) -> Condition<'c> {
        let alias = self.add_join_statements(path);
        self.pin_entity_table(alias);
        // Adds the variable interval condition, so we use the same time axis as specified in the
        // temporal axes.
        let condition = Condition::TimeIntervalContainsTimestamp(
            Expression::Column(
                Column::Entities(Entities::from_time_axis(
                    self.temporal_axes.variable_time_axis(),
                ))
                .aliased(alias),
            ),
            Expression::Function(Function::Now),
        );

        match operator {
            EqualityOperator::Equal => condition,
            EqualityOperator::NotEqual => Condition::Not(Box::new(condition)),
        }
    }

    /// Searches for [`Filter`]s, which requires special treatment and returns the corresponding
    /// condition if any.
    ///
    /// The following [`Filter`]s will be special cased:
    /// - Comparing the `"version"` field on [`Table::OntologyIds`] with `"latest"` for equality.
    fn compile_special_filter<'f: 'p>(&mut self, filter: &Filter<'f, R>) -> Option<Condition<'c>> {
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
                    (Column::Entities(Entities::ProjectedTime), Filter::Equal(..), "latest") => {
                        Some(
                            self.compile_latest_entity_version_filter(
                                path,
                                EqualityOperator::Equal,
                            ),
                        )
                    }
                    (Column::Entities(Entities::ProjectedTime), Filter::NotEqual(..), "latest") => {
                        Some(
                            self.compile_latest_entity_version_filter(
                                path,
                                EqualityOperator::NotEqual,
                            ),
                        )
                    }
                    _ => None,
                },
                _ => None,
            },
            _ => None,
        }
    }

    pub fn compile_path_column(&mut self, path: &'p R::QueryPath<'_>) -> AliasedColumn<'c> {
        let column = match path.terminating_column() {
            Column::DataTypes(DataTypes::Schema(Some(JsonField::JsonPath(field)))) => {
                self.artifacts.parameters.push(field);
                Column::DataTypes(DataTypes::Schema(Some(JsonField::JsonPathParameter(
                    self.artifacts.parameters.len(),
                ))))
            }
            Column::PropertyTypes(PropertyTypes::Schema(Some(JsonField::JsonPath(field)))) => {
                self.artifacts.parameters.push(field);
                Column::PropertyTypes(PropertyTypes::Schema(Some(JsonField::JsonPathParameter(
                    self.artifacts.parameters.len(),
                ))))
            }
            Column::EntityTypes(EntityTypes::Schema(Some(JsonField::JsonPath(field)))) => {
                self.artifacts.parameters.push(field);
                Column::EntityTypes(EntityTypes::Schema(Some(JsonField::JsonPathParameter(
                    self.artifacts.parameters.len(),
                ))))
            }
            Column::Entities(Entities::Properties(Some(JsonField::JsonPath(field)))) => {
                self.artifacts.parameters.push(field);
                Column::Entities(Entities::Properties(Some(JsonField::JsonPathParameter(
                    self.artifacts.parameters.len(),
                ))))
            }
            column => column,
        };

        let alias = self.add_join_statements(path);

        if matches!(column, Column::Entities(_)) {
            self.pin_entity_table(alias);
        }
        column.aliased(alias)
    }

    pub fn compile_filter_expression<'f: 'p>(
        &mut self,
        expression: &'p FilterExpression<'f, R>,
    ) -> Expression<'c> {
        match expression {
            FilterExpression::Path(path) => {
                let column = self.compile_path_column(path);
                // TODO: Remove special casing when correctly resolving time intervals in subgraphs.
                //   see https://app.asana.com/0/0/1203701389454316/f
                if column.column == Column::Entities(Entities::ProjectedTime) {
                    Expression::Function(Function::Lower(Box::new(Expression::Column(
                        Column::Entities(Entities::from_time_axis(
                            self.temporal_axes.variable_time_axis(),
                        ))
                        .aliased(column.alias),
                    ))))
                } else {
                    Expression::Column(column)
                }
            }
            FilterExpression::Parameter(parameter) => {
                match parameter {
                    Parameter::Number(number) => self.artifacts.parameters.push(number),
                    Parameter::Text(text) => self.artifacts.parameters.push(text),
                    Parameter::Boolean(bool) => self.artifacts.parameters.push(bool),
                    Parameter::Any(json) => self.artifacts.parameters.push(json),
                    Parameter::Uuid(uuid) => self.artifacts.parameters.push(uuid),
                    Parameter::OntologyTypeVersion(version) => {
                        self.artifacts.parameters.push(version);
                    }
                }
                Expression::Parameter(self.artifacts.parameters.len())
            }
        }
    }

    fn add_special_relation_conditions(
        &mut self,
        relation: Relation,
        base_alias: Alias,
        joined_table: AliasedTable,
    ) {
        match relation {
            Relation::EntityTypeLinks => {
                self.artifacts.required_tables.insert(joined_table);
                self.statement
                    .where_expression
                    .add_condition(Condition::NotEqual(
                        Some(Expression::Function(Function::JsonExtractPath(vec![
                            Expression::Column(
                                Column::EntityTypes(EntityTypes::Schema(None)).aliased(base_alias),
                            ),
                            Expression::Constant(Constant::String("links")),
                            Expression::Column(
                                Column::EntityTypes(EntityTypes::Schema(Some(
                                    JsonField::StaticText("$id"),
                                )))
                                .aliased(joined_table.alias),
                            ),
                        ]))),
                        None,
                    ));
            }
            Relation::EntityTypeInheritance => {
                self.artifacts.required_tables.insert(joined_table);
                self.statement
                    .where_expression
                    .add_condition(Condition::NotEqual(
                        Some(Expression::Function(Function::JsonContains(
                            Box::new(Expression::Column(
                                Column::EntityTypes(EntityTypes::Schema(Some(
                                    JsonField::StaticJson("allOf"),
                                )))
                                .aliased(base_alias),
                            )),
                            Box::new(Expression::Function(Function::JsonBuildArray(vec![
                                Expression::Function(Function::JsonBuildObject(vec![(
                                    Expression::Constant(Constant::String("$ref")),
                                    Expression::Column(
                                        Column::EntityTypes(EntityTypes::Schema(Some(
                                            JsonField::StaticText("$id"),
                                        )))
                                        .aliased(joined_table.alias),
                                    ),
                                )])),
                            ]))),
                        ))),
                        None,
                    ));
            }
            _ => {}
        }
    }

    /// Joins a chain of [`Relation`]s and returns the table name of the last joined table.
    ///
    /// Joining the tables attempts to deduplicate [`JoinExpression`]s. As soon as a new filter was
    /// compiled, each subsequent call will result in a new join-chain.
    ///
    /// [`Relation`]: super::table::Relation
    fn add_join_statements(&mut self, path: &R::QueryPath<'_>) -> Alias {
        let mut current_table = self.statement.from;

        if current_table.table == Table::Entities {
            self.pin_entity_table(current_table.alias);
        }

        for relation in path.relations() {
            let current_alias = current_table.alias;
            for (current_column, join_column) in relation.joins() {
                let mut current_column = current_column.aliased(current_table.alias);
                let mut join_column = join_column.aliased(Alias {
                    condition_index: self.artifacts.condition_index,
                    chain_depth: current_table.alias.chain_depth + 1,
                    number: 0,
                });

                // If we join on the same column as the previous join, we can reuse the that join.
                // For example, if we join on `entities.entity_type_ontology_id =
                // entity_type.ontology_id` and then on `entity_type.ontology_id =
                // ontology_ids.ontology_id`, we can merge the two joins into `entities.
                // entity_type_ontology_id = ontology_ids.ontology_id`. We, however, need to
                // make sure, that we only alter a join statement with a table we don't require
                // anymore.
                if let Some(last_join) = self.statement.joins.pop() {
                    // Check if we are joining on the same column as the previous join
                    if last_join.join == current_column
                        && !self
                            .artifacts
                            .required_tables
                            .contains(&last_join.join.table())
                    {
                        current_column = last_join.on;
                    } else {
                        self.statement.joins.push(last_join);
                    }
                }

                let mut found = false;
                for existing in &self.statement.joins {
                    if existing.join.table() == join_column.table() {
                        if existing.on == current_column && existing.join == join_column {
                            // We already have a join statement for this column, so we can reuse it.
                            current_table = existing.join.table();
                            found = true;
                            break;
                        }
                        // We already have a join statement for this table, but it's on a different
                        // column. We need to create a new join statement later on with a new,
                        // unique alias.
                        join_column.alias.number += 1;
                    }
                }

                if !found {
                    let join_expression = JoinExpression::new(join_column, current_column);
                    // We don't have a join statement for this column yet, so we need to create one.
                    current_table = join_expression.join.table();
                    self.statement.joins.push(join_expression);

                    if matches!(join_column.column, Column::Entities(_)) {
                        self.pin_entity_table(current_table.alias);
                    }
                }
            }
            self.add_special_relation_conditions(relation, current_alias, current_table);
        }

        self.artifacts.required_tables.insert(current_table);
        current_table.alias
    }
}
