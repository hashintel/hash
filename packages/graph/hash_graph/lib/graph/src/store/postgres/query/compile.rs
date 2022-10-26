use std::{borrow::Cow, marker::PhantomData};

use postgres_types::ToSql;

use crate::store::{
    postgres::query::{
        Column, ColumnAccess, Condition, EdgeJoinDirection, EqualityOperator, Expression, Function,
        JoinExpression, OrderByExpression, Ordering, Path, PostgresQueryRecord, SelectExpression,
        SelectStatement, Table, TableAlias, TableName, Transpile, WhereExpression, WindowStatement,
        WithExpression,
    },
    query::{Filter, FilterExpression, Parameter},
};

pub struct CompilerArtifacts<'f> {
    parameters: Vec<&'f (dyn ToSql + Sync)>,
    current_alias: TableAlias,
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
                current_alias: TableAlias {
                    condition_index: 0,
                    chain_depth: 0,
                },
            },
            _marker: PhantomData,
        }
    }

    /// Creates a new compiler, which will default to select the paths returned from
    /// [`PostgresQueryRecord::default_selection_paths()`].
    pub fn with_default_selection() -> Self {
        let mut default = Self::new();
        for path in T::default_selection_paths() {
            default.add_selection_path(path, false, None);
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
    /// Optionally, a path can be ordered by passing an [`Ordering`] alongside the path. Also, when
    /// `distinct` is `true`, this path will be selected distinctly.
    pub fn add_selection_path(
        &mut self,
        path: &'q T::Path<'q>,
        distinct: bool,
        ordering: Option<Ordering>,
    ) {
        let table = self.add_join_statements(path.tables());
        let column = Column {
            table,
            access: path.column_access(),
        };
        if distinct {
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
    }

    /// Adds a new filter to the selection.
    pub fn add_filter(&mut self, filter: &'f Filter<'q, T>) {
        let condition = self.compile_filter(filter);
        self.artifacts.current_alias.condition_index += 1;
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
        path: &'q T::Path<'q>,
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
        version_column.table = self.add_join_statements(path.tables());
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
                    table: self.add_join_statements(path.tables()),
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
                }
                Expression::Parameter(self.artifacts.parameters.len())
            }
        }
    }

    /// Joins the list of [`Table`]s as [`JoinExpression`]s.
    ///
    /// Joining the tables attempts to deduplicate [`JoinExpression`]s. As soon as a new filter was
    /// compiled, each subsequent call will result in a new join-chain.
    fn add_join_statements(
        &mut self,
        tables: impl IntoIterator<Item = (TableName, EdgeJoinDirection)>,
    ) -> Table {
        let mut current_table = T::base_table();
        let mut current_edge_direction = EdgeJoinDirection::SourceOnTarget;
        for (table_name, edge_direction) in tables {
            if table_name == T::base_table().name && self.artifacts.current_alias.chain_depth == 0 {
                // Avoid joining the same initial table
                current_edge_direction = edge_direction;
                continue;
            }

            let table = Table {
                name: table_name,
                alias: Some(self.artifacts.current_alias),
            };

            let join = JoinExpression::from_tables(table, current_table, current_edge_direction);

            if let Some(join_statement) = self
                .statement
                .joins
                .iter()
                .find(|existing| **existing == join)
            {
                current_table = join_statement.join;
            } else {
                self.statement.joins.push(join);
                current_table = table;
            }
            current_edge_direction = edge_direction;
            self.artifacts.current_alias.chain_depth += 1;
        }
        self.artifacts.current_alias.chain_depth = 0;
        current_table
    }
}
