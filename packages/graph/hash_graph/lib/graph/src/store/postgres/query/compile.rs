use std::{borrow::Cow, collections::HashSet, fmt::Display, marker::PhantomData};

use postgres_types::ToSql;
use tokio_postgres::row::RowIndex;

use crate::store::{
    postgres::query::{
        Column, ColumnAccess, Condition, Distinctness, EqualityOperator, Expression, Function,
        JoinExpression, OrderByExpression, Ordering, Path, PostgresQueryRecord, Relation,
        SelectExpression, SelectStatement, Table, TableAlias, TableName, Transpile,
        WhereExpression, WindowStatement, WithExpression,
    },
    query::{Filter, FilterExpression, Parameter},
};

pub struct CompilerArtifacts<'f> {
    parameters: Vec<&'f (dyn ToSql + Sync)>,
    condition_index: usize,
    required_tables: HashSet<Table>,
}

pub struct SelectCompiler<'f, 'q, T> {
    statement: SelectStatement<'q>,
    artifacts: CompilerArtifacts<'f>,
    _marker: PhantomData<fn(&'f T)>,
}

impl<'f: 'q, 'q, T: PostgresQueryRecord<'q>> SelectCompiler<'f, 'q, T> {
    /// Creates a new, empty compiler.
    pub fn new() -> Self {
        Self {
            statement: SelectStatement {
                with: WithExpression::default(),
                distinct: Vec::new(),
                selects: Vec::new(),
                from: T::base_table(),
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

    /// Creates a new compiler, which will default to select the paths returned from
    /// [`PostgresQueryRecord::default_selection_paths()`].
    pub fn with_default_selection() -> Self {
        let mut default = Self::new();
        for path in T::default_selection_paths() {
            default.add_selection_path(path);
        }
        default
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
    pub fn add_selection_path(&mut self, path: &'q T::Path<'q>) -> impl RowIndex + Display + Copy {
        let table = self.add_join_statements(path.relations());
        self.statement.selects.push(SelectExpression::from_column(
            Column {
                table,
                access: path.column_access(),
            },
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
        path: &'q T::Path<'q>,
        distinctness: Distinctness,
        ordering: Option<Ordering>,
    ) -> impl RowIndex + Display + Copy {
        let table = self.add_join_statements(path.relations());
        let column = Column {
            table,
            access: path.column_access(),
        };
        if distinctness == Distinctness::Distinct {
            self.statement.distinct.push(column.clone());
        }
        if let Some(ordering) = ordering {
            self.statement
                .order_by_expression
                .push(column.clone(), ordering);
        }
        self.statement
            .selects
            .push(SelectExpression::from_column(column, None));
        self.statement.selects.len() - 1
    }

    /// Adds a new filter to the selection.
    pub fn add_filter(&mut self, filter: &'f Filter<'q, T>) {
        let condition = self.compile_filter(filter);
        self.artifacts.condition_index += 1;
        self.statement.where_expression.add_condition(condition);
    }

    /// Transpiles the statement into SQL and the parameter to be passed to a prepared statement.
    pub fn compile(&self) -> (String, &[&'f (dyn ToSql + Sync)]) {
        (
            self.statement.transpile_to_string(),
            &self.artifacts.parameters,
        )
    }

    /// Compiles a [`Filter`] to a `Condition`.
    pub fn compile_filter(&mut self, filter: &'f Filter<'q, T>) -> Condition<'q> {
        if let Some(condition) = self.compile_special_filter(filter) {
            return condition;
        }

        let condition = match filter {
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
        };
        condition
    }

    /// Compiles the `path` to a condition, which is searching for the latest version.
    // Warning: This adds a CTE to the statement, which is overwriting the `type_ids` table. When
    //          more CTEs are needed, a test should be added to cover both CTEs in one statement to
    //          ensure compatibility
    fn compile_latest_version_filter(
        &mut self,
        path: &'f T::Path<'q>,
        operator: EqualityOperator,
    ) -> Condition<'q> {
        let mut version_column = Column {
            table: Table {
                name: path.terminating_table_name(),
                alias: None,
            },
            access: path.column_access(),
        };
        // Depending on the table name of the path the partition table is selected
        let partition_column = match version_column.table.name {
            TableName::TypeIds => Column {
                table: version_column.table,
                access: ColumnAccess::Table { column: "base_uri" },
            },
            TableName::Entities => Column {
                table: version_column.table,
                access: ColumnAccess::Table {
                    column: "entity_id",
                },
            },
            _ => unreachable!(),
        };

        // Add a WITH expression selecting the partitioned version
        self.statement
            .with
            .add_statement(version_column.table.name, SelectStatement {
                with: WithExpression::default(),
                distinct: Vec::new(),
                selects: vec![
                    SelectExpression::new(Expression::Asterisk, None),
                    SelectExpression::new(
                        Expression::Window(
                            Box::new(Expression::Function(Box::new(Function::Max(
                                Expression::Column(version_column.clone()),
                            )))),
                            WindowStatement::partition_by(partition_column),
                        ),
                        Some(Cow::Borrowed("latest_version")),
                    ),
                ],
                from: Table {
                    name: version_column.table.name,
                    alias: None,
                },
                joins: vec![],
                where_expression: WhereExpression::default(),
                order_by_expression: OrderByExpression::default(),
            });

        // Join the table of `path` and compare the version to the latest version
        version_column.table = self.add_join_statements(path.relations());
        let latest_version_expression = Some(Expression::Column(Column {
            table: version_column.table,
            access: ColumnAccess::Table {
                column: "latest_version",
            },
        }));
        let version_expression = Some(Expression::Column(version_column));

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
    /// - Comparing the `"version"` field on [`TableName::TypeIds`] with `"latest"` for equality.
    fn compile_special_filter(&mut self, filter: &'f Filter<'q, T>) -> Option<Condition<'q>> {
        match filter {
            Filter::Equal(lhs, rhs) | Filter::NotEqual(lhs, rhs) => match (lhs, rhs) {
                (
                    Some(FilterExpression::Path(path)),
                    Some(FilterExpression::Parameter(Parameter::Text(parameter))),
                )
                | (
                    Some(FilterExpression::Parameter(Parameter::Text(parameter))),
                    Some(FilterExpression::Path(path)),
                ) => {
                    match (
                        path.terminating_table_name(),
                        path.column_access().column(),
                        filter,
                        parameter.as_ref(),
                    ) {
                        (
                            TableName::TypeIds | TableName::Entities,
                            "version",
                            Filter::Equal(..),
                            "latest",
                        ) => {
                            Some(self.compile_latest_version_filter(path, EqualityOperator::Equal))
                        }
                        (
                            TableName::TypeIds | TableName::Entities,
                            "version",
                            Filter::NotEqual(..),
                            "latest",
                        ) => Some(
                            self.compile_latest_version_filter(path, EqualityOperator::NotEqual),
                        ),
                        _ => None,
                    }
                }
                _ => None,
            },
            _ => None,
        }
    }

    pub fn compile_filter_expression(
        &mut self,
        expression: &'f FilterExpression<'q, T>,
    ) -> Expression<'q> {
        match expression {
            FilterExpression::Path(path) => {
                let access = if let Some(field) = path.user_provided_path() {
                    self.artifacts.parameters.push(field);
                    ColumnAccess::JsonParameter {
                        column: path.column_access().column(),
                        index: self.artifacts.parameters.len(),
                    }
                } else {
                    path.column_access()
                };
                Expression::Column(Column {
                    table: self.add_join_statements(path.relations()),
                    access,
                })
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

    /// Joins a chain of [`Relation`]s and returns the table name of the last joined table.
    ///
    /// Joining the tables attempts to deduplicate [`JoinExpression`]s. As soon as a new filter was
    /// compiled, each subsequent call will result in a new join-chain.
    fn add_join_statements(&mut self, tables: impl IntoIterator<Item = Relation<'q>>) -> Table {
        let mut current_table = T::base_table();
        let mut chain_depth = 0;
        for Relation {
            current_column_access,
            join_table_name,
            join_column_access,
        } in tables
        {
            let current_column = Column {
                table: current_table,
                access: current_column_access,
            };
            let join_table = Table {
                name: join_table_name,
                alias: Some(TableAlias {
                    condition_index: self.artifacts.condition_index,
                    chain_depth,
                }),
            };
            let join_column = Column {
                table: join_table,
                access: join_column_access,
            };

            // If we join on the same column as the previous join, we can reuse the that join. For
            // example, if we join on `entities.entity_type_version_id = entity_type.version_id` and
            // then on `entity_type.version_id = type_ids.version_id`, we can merge the two joins
            // into `entities.entity_type_version_id = type_ids.version_id`. We, however, need to
            // make sure, that we only alter a join statement with a table we don't require anymore.
            if let Some(last_join) = self.statement.joins.last_mut() {
                // Check if we are joining on the same column as the previous join
                if last_join.join == current_column
                    && !self
                        .artifacts
                        .required_tables
                        .contains(&last_join.join.table)
                {
                    last_join.join.table.name = join_column.table.name;
                    last_join.join.access = join_column.access;
                    current_table = last_join.join.table;

                    if let [.., previous_join, this_join] = self.statement.joins.as_slice() {
                        // It's possible that we just duplicated the last two join statements, so
                        // remove the last one.
                        if previous_join == this_join {
                            self.statement.joins.pop();
                        }
                    }

                    continue;
                }
            }

            let join_expression = JoinExpression::new(join_column, current_column);

            if let Some(join_statement) = self
                .statement
                .joins
                .iter()
                .find(|existing| **existing == join_expression)
            {
                current_table = join_statement.join.table;
            } else {
                self.statement.joins.push(join_expression);
                current_table = join_table;
            }
            chain_depth += 1;
        }
        self.artifacts.required_tables.insert(current_table);
        current_table
    }
}
