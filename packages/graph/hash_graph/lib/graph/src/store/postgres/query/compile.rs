use std::{borrow::Cow, collections::HashSet, fmt::Display, marker::PhantomData};

use postgres_types::ToSql;
use tokio_postgres::row::RowIndex;

use crate::store::{
    postgres::query::{
        expression::Constant,
        table::{Entities, EntityTypes, JsonField, Relation, TypeIds},
        Alias, AliasedColumn, AliasedTable, Column, Condition, Distinctness, EqualityOperator,
        Expression, Function, JoinExpression, OrderByExpression, Ordering, PostgresQueryPath,
        PostgresRecord, SelectExpression, SelectStatement, Table, Transpile, WhereExpression,
        WindowStatement, WithExpression,
    },
    query::{Filter, FilterExpression, Parameter},
};

// # Lifetime guidance
// - 'c relates to the lifetime of the `SelectCompiler` (most constrained by the SelectStatement)
// - 'p relates to the lifetime of the parameters, should be the longest living as they have to
//   outlive the transpiling process

pub struct CompilerArtifacts<'p> {
    parameters: Vec<&'p (dyn ToSql + Sync)>,
    condition_index: usize,
    required_tables: HashSet<AliasedTable>,
}

pub struct SelectCompiler<'c, 'p, T> {
    statement: SelectStatement<'c>,
    artifacts: CompilerArtifacts<'p>,
    _marker: PhantomData<fn(*const T)>,
}

impl<'c, 'p: 'c, R: PostgresRecord> SelectCompiler<'c, 'p, R> {
    /// Creates a new, empty compiler.
    pub fn new() -> Self {
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
            },
            _marker: PhantomData,
        }
    }

    /// Creates a new compiler, which will select everything using the asterisk (`*`).
    pub fn with_asterisk() -> Self {
        let mut default = Self::new();
        default
            .statement
            .selects
            .push(SelectExpression::new(Expression::Asterisk, None));
        default
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
    // Warning: This adds a CTE to the statement, which is overwriting the `type_ids` table. When
    //          more CTEs are needed, a test should be added to cover both CTEs in one statement to
    //          ensure compatibility
    fn compile_latest_ontology_version_filter(
        &mut self,
        path: &R::QueryPath<'_>,
        operator: EqualityOperator,
    ) -> Condition<'c> {
        let version_column = Column::TypeIds(TypeIds::Version).aliased(Alias {
            condition_index: 0,
            chain_depth: 0,
            number: 0,
        });

        // Add a WITH expression selecting the partitioned version
        self.statement
            .with
            .add_statement(Table::TypeIds, SelectStatement {
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
                                Column::TypeIds(TypeIds::BaseUri).aliased(version_column.alias),
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
            Column::TypeIds(TypeIds::LatestVersion).aliased(alias),
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
        self.statement
            .where_expression
            .add_condition(Condition::RangeContains(
                Expression::Column(Column::Entities(Entities::DecisionTime).aliased(alias)),
                Expression::Function(Function::Now),
            ));
        let transaction_time_condition = Condition::RangeContains(
            Expression::Column(Column::Entities(Entities::TransactionTime).aliased(alias)),
            Expression::Function(Function::Now),
        );

        match operator {
            EqualityOperator::Equal => transaction_time_condition,
            EqualityOperator::NotEqual => Condition::Not(Box::new(transaction_time_condition)),
        }
    }

    /// Searches for [`Filter`]s, which requires special treatment and returns the corresponding
    /// condition if any.
    ///
    /// The following [`Filter`]s will be special cased:
    /// - Comparing the `"version"` field on [`Table::TypeIds`] with `"latest"` for equality.
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
                    (Column::TypeIds(TypeIds::Version), Filter::Equal(..), "latest") => Some(
                        self.compile_latest_ontology_version_filter(path, EqualityOperator::Equal),
                    ),
                    (Column::TypeIds(TypeIds::Version), Filter::NotEqual(..), "latest") => {
                        Some(self.compile_latest_ontology_version_filter(
                            path,
                            EqualityOperator::NotEqual,
                        ))
                    }
                    (
                        Column::Entities(Entities::LowerTransactionTime),
                        Filter::Equal(..),
                        "latest",
                    ) => Some(
                        self.compile_latest_entity_version_filter(path, EqualityOperator::Equal),
                    ),
                    (
                        Column::Entities(Entities::LowerTransactionTime),
                        Filter::NotEqual(..),
                        "latest",
                    ) => Some(
                        self.compile_latest_entity_version_filter(path, EqualityOperator::NotEqual),
                    ),
                    _ => None,
                },
                _ => None,
            },
            _ => None,
        }
    }

    pub fn compile_path_column(&mut self, path: &'p R::QueryPath<'_>) -> AliasedColumn<'c> {
        let column = path.terminating_column();
        let column =
            if let Column::Entities(Entities::Properties(Some(JsonField::Text(field)))) = column {
                self.artifacts.parameters.push(field);
                Column::Entities(Entities::Properties(Some(JsonField::Parameter(
                    self.artifacts.parameters.len(),
                ))))
            } else {
                column
            };

        let alias = self.add_join_statements(path);

        // TODO: Remove special casing when adjusting structural queries
        //   see https://app.asana.com/0/0/1203491211535116/f
        if matches!(column, Column::Entities(_)) {
            self.statement
                .where_expression
                .add_condition(Condition::RangeContains(
                    Expression::Column(Column::Entities(Entities::DecisionTime).aliased(alias)),
                    Expression::Function(Function::Now),
                ));
        }

        column.aliased(alias)
    }

    pub fn compile_filter_expression<'f: 'p>(
        &mut self,
        expression: &'p FilterExpression<'f, R>,
    ) -> Expression<'c> {
        match expression {
            FilterExpression::Path(path) => {
                // TODO: Remove special casing when adjusting structural queries
                //   see https://app.asana.com/0/0/1203491211535116/f
                let column = self.compile_path_column(path);
                if column.column == Column::Entities(Entities::LowerTransactionTime) {
                    Expression::Function(Function::Lower(Box::new(Expression::Column(column))))
                } else {
                    Expression::Column(column)
                }
            }
            FilterExpression::Parameter(parameter) => {
                match parameter {
                    Parameter::Number(number) => self.artifacts.parameters.push(number),
                    Parameter::Text(text) => self.artifacts.parameters.push(text),
                    Parameter::Boolean(bool) => self.artifacts.parameters.push(bool),
                    Parameter::Uuid(uuid) => self.artifacts.parameters.push(uuid),
                    Parameter::SignedInteger(integer) => self.artifacts.parameters.push(integer),
                    Parameter::Timestamp(timestamp) => self.artifacts.parameters.push(timestamp),
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
                                Column::EntityTypes(EntityTypes::Schema(Some(JsonField::Text(
                                    &Cow::Borrowed("$id"),
                                ))))
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
                                Column::EntityTypes(EntityTypes::Schema(Some(JsonField::Json(
                                    &Cow::Borrowed("allOf"),
                                ))))
                                .aliased(base_alias),
                            )),
                            Box::new(Expression::Function(Function::JsonBuildArray(vec![
                                Expression::Function(Function::JsonBuildObject(vec![(
                                    Expression::Constant(Constant::String("$ref")),
                                    Expression::Column(
                                        Column::EntityTypes(EntityTypes::Schema(Some(
                                            JsonField::Text(&Cow::Borrowed("$id")),
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

        for relation in path.relations() {
            let current_alias = current_table.alias;
            for (current_column, join_column) in relation.joins() {
                let current_column = current_column.aliased(current_table.alias);
                let mut join_column = join_column.aliased(Alias {
                    condition_index: self.artifacts.condition_index,
                    chain_depth: current_table.alias.chain_depth + 1,
                    number: 0,
                });

                // If we join on the same column as the previous join, we can reuse the that join.
                // For example, if we join on `entities.entity_type_version_id =
                // entity_type.version_id` and then on `entity_type.version_id =
                // type_ids.version_id`, we can merge the two joins into `entities.
                // entity_type_version_id = type_ids.version_id`. We, however, need to
                // make sure, that we only alter a join statement with a table we don't require
                // anymore.
                if let Some(last_join) = self.statement.joins.last_mut() {
                    // Check if we are joining on the same column as the previous join
                    if last_join.join == current_column
                        && !self
                            .artifacts
                            .required_tables
                            .contains(&last_join.join.table())
                    {
                        last_join.join.table().table = join_column.table().table;
                        last_join.join.column = join_column.column;
                        current_table = last_join.join.table();

                        if let [.., previous_join, this_join] = self.statement.joins.as_slice() {
                            // It's possible that we just duplicated the last two join statements,
                            // so remove the last one.
                            if previous_join == this_join {
                                self.statement.joins.pop();
                            }
                        }

                        continue;
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

                    // TODO: Remove special casing when adjusting structural queries
                    //   see https://app.asana.com/0/0/1203491211535116/f
                    if matches!(current_column.column, Column::Entities(_)) {
                        self.statement
                            .where_expression
                            .add_condition(Condition::RangeContains(
                                Expression::Column(
                                    Column::Entities(Entities::DecisionTime).aliased(current_alias),
                                ),
                                Expression::Function(Function::Now),
                            ));
                    }
                }
            }
            self.add_special_relation_conditions(relation, current_alias, current_table);
        }

        self.artifacts.required_tables.insert(current_table);
        current_table.alias
    }
}
