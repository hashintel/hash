//! Peephole rewrites over compiled filters.
//!
//! A peephole here is a filter shape whose direct compilation would be wrong or wasteful: an
//! equality on an array-backed column would compare arrays where the filter means containment, a
//! `version = "latest"` equality would bind the text `"latest"` against an int8 column, and a
//! disjunction of identity tuples plans as one index-scan branch per tuple. [`PeepholeOptimizer`]
//! recognizes those shapes and compiles the rewrite, and every other filter compiles as written.
//!
//! [`PeepholeOptimizer::recognize`] yields at most one [`Peephole`] per filter, so no filter is
//! rewritten twice, and a filter classified as a plain equality is one no rewrite claims.

use error_stack::Report;
use hash_graph_store::filter::{
    Filter, FilterExpression, FilterExpressionList, Parameter, QueryRecord,
};

use super::{FilterGroup, SelectCompiler, SelectCompilerError};
use crate::store::postgres::query::{
    Alias, Column, ColumnName, ColumnReference, Correlation, EqualityOperator, Expression,
    FromItem, Function, Identifier, PostgresQueryPath, PostgresRecord, SelectExpression,
    SelectStatement, Table, TableReference, Transpile as _, WindowStatement,
    postgres_type::PostgresType,
    table::{DatabaseColumn, FilterColumn as _, OntologyIds},
};

/// One member of an unnested tuple row, named by its 1-based position.
///
/// The vocabulary is positional because the bundled columns are arbitrary: the tuple's width is
/// its group's column count. Each member carries the stored type of the column it stands for,
/// which types the array its values arrive in.
#[derive(Debug, Clone, PartialEq, Eq)]
struct TupleElement {
    /// The member's 1-based position among the bundle's columns.
    position: usize,
    /// The stored type of the column this member carries values for.
    element_type: PostgresType,
}

impl DatabaseColumn<'_> for TupleElement {
    fn name(&self) -> ColumnName<'static> {
        format!("elem_{}", self.position).into()
    }

    fn postgres_type(&self) -> PostgresType {
        self.element_type.clone()
    }
}

/// The unnested tuple rows inside a column-tuple membership predicate.
const UNNEST_CORRELATION: Correlation<TupleElement> = Correlation::new("unnest");

/// One parallel-array unnest of aligned tuples, standing as `"unnest_c_d_n"("elem_1", …)` at the
/// arrays' shared width.
fn from_unnest(
    reference: impl Into<TableReference<'static>>,
    arrays: Vec<Expression>,
    members: &[TupleElement],
) -> FromItem<'static> {
    debug_assert_eq!(
        arrays.len(),
        members.len(),
        "every unnested array needs its member alias: an unaliased array would silently lose its \
         column name and the statement would fail at the server",
    );

    FromItem::function(Function::Unnest(arrays))
        .alias(reference)
        .column_aliases(members.iter().map(DatabaseColumn::name).collect())
        .build()
}

/// Orientation-normalizes an equality's operands into its path and its parameter.
///
/// `None` when either side is neither, and when the parameter carries a conversion, whose
/// compiled form no rewrite reproduces.
const fn equality_halves<'params, 'filter, R: QueryRecord>(
    lhs: &'params FilterExpression<'filter, R>,
    rhs: &'params FilterExpression<'filter, R>,
) -> Option<(&'params R::QueryPath<'filter>, &'params Parameter<'filter>)> {
    if let (
        FilterExpression::Path { path },
        FilterExpression::Parameter {
            parameter,
            convert: None,
        },
    )
    | (
        FilterExpression::Parameter {
            parameter,
            convert: None,
        },
        FilterExpression::Path { path },
    ) = (lhs, rhs)
    {
        Some((path, parameter))
    } else {
        None
    }
}

/// The bundle for one recognized column set.
///
/// The columns stand in canonical order, and each tuple holds one parameter per column,
/// aligned to that order.
struct ColumnTupleGroup<'params, 'filter> {
    /// The tuple's columns in canonical order, each with its stored type.
    columns: Vec<(ColumnReference<'static>, PostgresType)>,
    tuples: Vec<Vec<&'params Parameter<'filter>>>,
}

/// One recognized equality with its joins resolved, keyed for canonical ordering.
struct ResolvedEquality<'params, 'filter> {
    /// The aliased column's transpiled form, the sort and bundle-match key.
    identity: String,
    column: ColumnReference<'static>,
    element_type: PostgresType,
    parameter: &'params Parameter<'filter>,
}

/// Flattens a group's children through redundant connective boundaries.
///
/// A child sharing the group's connective contributes its own children in its place, and a group
/// of the opposite connective holding exactly one member contributes that member (`All([x])`,
/// `Any([x])` and `x` decide alike). Both expansions shrink the tree, so the walk reaches their
/// fixed point in one pass. An empty group keeps its identity (`All([])` holds, `Any([])`
/// refuses) and stays a child.
fn flattened_children<'params, 'filter, R: QueryRecord>(
    group: FilterGroup,
    children: &'params [Filter<'filter, R>],
) -> Vec<&'params Filter<'filter, R>> {
    let mut flat = Vec::with_capacity(children.len());
    let mut pending: Vec<&'params Filter<'filter, R>> = children.iter().rev().collect();

    while let Some(filter) = pending.pop() {
        match (group, filter) {
            (FilterGroup::All, Filter::All(inner)) | (FilterGroup::Any, Filter::Any(inner)) => {
                pending.extend(inner.iter().rev());
            }
            (FilterGroup::All, Filter::Any(inner)) | (FilterGroup::Any, Filter::All(inner))
                if let [only] = inner.as_slice() =>
            {
                pending.push(only);
            }
            _ => flat.push(filter),
        }
    }

    flat
}

/// One rewritable filter shape, decomposed into the operands its rewrite uses.
enum Peephole<'params, 'filter, R: QueryRecord> {
    /// An equality or inequality pinning the ontology `version` column to the text `"latest"`,
    /// compiled as a comparison against the partition-wide maximum version.
    LatestOntologyVersion {
        path: &'params R::QueryPath<'filter>,
        operator: EqualityOperator,
    },
    /// An equality or membership over a materialized text-array column, compiled as an array
    /// predicate, because a direct comparison would compare whole arrays where the filter means
    /// containment.
    ArrayContainment {
        path: &'params R::QueryPath<'filter>,
        parameter: &'params Parameter<'filter>,
        operator: EqualityOperator,
    },
    /// An `All` group where every child pins a plain scalar column to a parameter: a candidate
    /// for row-membership bundling when its `Any`-group siblings share the column set.
    ColumnTuple(Vec<(&'params R::QueryPath<'filter>, &'params Parameter<'filter>)>),
}

/// The peephole pass over one compiler.
///
/// A rewrite resolves joins and binds parameters through the compiler it borrows, so a rewritten
/// filter leaves the same artifacts behind as a plain one, and a filter no rewrite claims
/// compiles as written.
pub(super) struct PeepholeOptimizer<'compiler, 'params, 'query: 'params, R: QueryRecord> {
    compiler: &'compiler mut SelectCompiler<'params, 'query, R>,
}

impl<'compiler, 'params, 'query: 'params, R: PostgresRecord>
    PeepholeOptimizer<'compiler, 'params, 'query, R>
{
    pub(super) const fn new(compiler: &'compiler mut SelectCompiler<'params, 'query, R>) -> Self {
        Self { compiler }
    }

    /// Classifies a filter, yielding at most one rewrite with its operands.
    ///
    /// Priority is the match order, and a filter no arm claims compiles as written.
    fn recognize<'filter: 'query>(
        &self,
        filter: &'params Filter<'filter, R>,
    ) -> Option<Peephole<'params, 'filter, R>>
    where
        R::QueryPath<'filter>: PostgresQueryPath,
    {
        match filter {
            Filter::Equal(lhs, rhs) => Self::equality_peephole(lhs, rhs, EqualityOperator::Equal),
            Filter::NotEqual(lhs, rhs) => {
                Self::equality_peephole(lhs, rhs, EqualityOperator::NotEqual)
            }
            Filter::In(
                FilterExpression::Parameter {
                    parameter: parameter @ Parameter::Text(_),
                    convert: None,
                },
                FilterExpressionList::Path { path },
            ) => {
                let (column, None) = path.terminating_column() else {
                    return None;
                };

                column
                    .is_text_array()
                    .then_some(Peephole::ArrayContainment {
                        path,
                        parameter,
                        operator: EqualityOperator::Equal,
                    })
            }
            Filter::All(children) => {
                let members = flattened_children(FilterGroup::All, children);
                if members.len() < 2 {
                    return None;
                }

                members
                    .into_iter()
                    .map(|child| self.plain_column_equality(child))
                    .collect::<Option<Vec<_>>>()
                    .map(Peephole::ColumnTuple)
            }
            Filter::Any(_)
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

    /// Classifies the `Equal`/`NotEqual` shapes, in priority order.
    ///
    /// A plain scalar equality is no rewrite by itself and returns `None`.
    fn equality_peephole<'filter: 'query>(
        lhs: &'params FilterExpression<'filter, R>,
        rhs: &'params FilterExpression<'filter, R>,
        operator: EqualityOperator,
    ) -> Option<Peephole<'params, 'filter, R>>
    where
        R::QueryPath<'filter>: PostgresQueryPath,
    {
        let (path, parameter) = equality_halves(lhs, rhs)?;
        let (column, None) = path.terminating_column() else {
            return None;
        };

        if let Parameter::Text(text) = parameter
            && text.as_ref() == "latest"
            && matches!(column, Column::OntologyIds(OntologyIds::Version))
        {
            return Some(Peephole::LatestOntologyVersion { path, operator });
        }

        if matches!(parameter, Parameter::Text(_)) && column.is_text_array() {
            return Some(Peephole::ArrayContainment {
                path,
                parameter,
                operator,
            });
        }

        None
    }

    /// Decomposes an equality filter pinning a plain scalar column to a parameter: the unit
    /// [`Peephole::ColumnTuple`] builds on.
    ///
    /// `None` when [`recognize`](Self::recognize) claims the filter (a rewritten filter must
    /// never be rebuilt as the direct equality whose meaning the rewrite exists to change), when
    /// the path reaches into a JSON document rather than a whole column, when the column is
    /// array-backed (an equality there means containment and belongs to the array predicates),
    /// and when the column carries a column hook (the tuple forms build their column references
    /// directly, which would silently skip the hook's rewrite). A refused group compiles
    /// through [`SelectCompiler::compile_filter`], which handles all four.
    fn plain_column_equality<'filter: 'query>(
        &self,
        filter: &'params Filter<'filter, R>,
    ) -> Option<(&'params R::QueryPath<'filter>, &'params Parameter<'filter>)>
    where
        R::QueryPath<'filter>: PostgresQueryPath,
    {
        let Filter::Equal(lhs, rhs) = filter else {
            return None;
        };

        if self.recognize(filter).is_some() {
            return None;
        }

        let (path, parameter) = equality_halves(lhs, rhs)?;
        let (column, None) = path.terminating_column() else {
            return None;
        };

        (!matches!(column.postgres_type(), PostgresType::Array(_))
            && !self.compiler.column_hooks.contains_key(&column))
        .then_some((path, parameter))
    }

    /// Rewrites a filter whose shape stands alone, or returns `None` for the plain compile.
    ///
    /// [`Peephole::ColumnTuple`] returns `None` here: a lone tuple gains nothing over its own
    /// conjunction, and tuples fuse only among the siblings of an `Any` group, in
    /// [`compile_group`](Self::compile_group).
    pub(super) fn try_filter<'filter: 'query>(
        &mut self,
        filter: &'params Filter<'filter, R>,
    ) -> Option<Expression>
    where
        R::QueryPath<'filter>: PostgresQueryPath,
    {
        match self.recognize(filter)? {
            Peephole::LatestOntologyVersion { path, operator } => {
                Some(self.latest_ontology_version(path, operator))
            }
            Peephole::ArrayContainment {
                path,
                parameter,
                operator,
            } => {
                let alias = self.compiler.add_join_statements(path);
                let column = path.terminating_column().0.aliased(alias);

                // A lone filter has a single parameter, so the group connective is irrelevant.
                Some(self.array_predicate(column, &[parameter], operator, FilterGroup::All))
            }
            Peephole::ColumnTuple(_) => None,
        }
    }

    /// Compiles the filters of an `All`/`Any` group, fusing siblings that share a backing
    /// shape into one predicate: equality filters backed by the same materialized array
    /// column collapse into a single array predicate, and, in an `Any` group only,
    /// column-equality `All` tuples over one aliased table collapse into a single
    /// row-membership predicate over unnested arrays.
    ///
    /// Bundles are keyed on the *aliased* column or column set: paths terminating in the
    /// same column through different join chains (e.g. an entity's own types vs. a linked
    /// entity's types) resolve to different aliases and stay separate predicates.
    pub(super) fn compile_group<'filter: 'query>(
        &mut self,
        filters: &'params [Filter<'filter, R>],
        group: FilterGroup,
    ) -> Result<Vec<Expression>, Report<SelectCompilerError>>
    where
        R::QueryPath<'filter>: PostgresQueryPath,
    {
        struct ArrayPredicateGroup<'params, 'filter> {
            column: ColumnReference<'static>,
            operator: EqualityOperator,
            parameters: Vec<&'params Parameter<'filter>>,
        }

        let mut array_bundles: Vec<ArrayPredicateGroup<'params, 'filter>> = Vec::new();
        let mut tuple_bundles: Vec<ColumnTupleGroup<'params, 'filter>> = Vec::new();
        let mut expressions = Vec::new();
        for filter in flattened_children(group, filters) {
            match self.recognize(filter) {
                Some(Peephole::ArrayContainment {
                    path,
                    parameter,
                    operator,
                }) => {
                    let alias = self.compiler.add_join_statements(path);
                    let column = path.terminating_column().0.aliased(alias);
                    if let Some(bundle) = array_bundles
                        .iter_mut()
                        .find(|bundle| bundle.column == column && bundle.operator == operator)
                    {
                        bundle.parameters.push(parameter);
                    } else {
                        array_bundles.push(ArrayPredicateGroup {
                            column,
                            operator,
                            parameters: vec![parameter],
                        });
                    }
                }
                Some(Peephole::ColumnTuple(halves)) if group == FilterGroup::Any => {
                    self.bundle_column_tuple(halves, &mut tuple_bundles, &mut expressions);
                }
                Some(Peephole::LatestOntologyVersion { .. } | Peephole::ColumnTuple(_)) | None => {
                    expressions.push(self.compiler.compile_filter(filter)?);
                }
            }
        }

        for bundle in &array_bundles {
            expressions.push(self.array_predicate(
                bundle.column.clone(),
                &bundle.parameters,
                bundle.operator,
                group,
            ));
        }

        for (index, bundle) in tuple_bundles.into_iter().enumerate() {
            let ColumnTupleGroup { columns, tuples } = bundle;
            if let [tuple] = tuples.as_slice() {
                // One tuple gains nothing over its own conjunction, and the direct form lets the
                // columns' own indexes serve it without an unnest.
                let conjunction = self.tuple_conjunction(
                    columns
                        .into_iter()
                        .map(|(reference, _)| reference)
                        .zip(tuple.iter().copied()),
                );
                expressions.push(conjunction);
            } else {
                expressions.push(self.tuple_membership(columns, &tuples, index));
            }
        }

        Ok(expressions)
    }

    /// Resolves a recognized tuple's halves into canonical order, then either merges the
    /// tuple into the bundle keyed on exactly its column set or pushes its direct
    /// conjunction.
    ///
    /// Sorting by the column's transpiled identity makes the tuple order canonical, so
    /// bundles match by plain equality with their parameters already aligned, whatever
    /// order the group wrote the equalities in.
    fn bundle_column_tuple<'filter: 'query>(
        &mut self,
        tuple: Vec<(&'params R::QueryPath<'filter>, &'params Parameter<'filter>)>,
        tuple_bundles: &mut Vec<ColumnTupleGroup<'params, 'filter>>,
        expressions: &mut Vec<Expression>,
    ) where
        R::QueryPath<'filter>: PostgresQueryPath,
    {
        let mut halves = tuple
            .into_iter()
            .map(|(path, parameter)| {
                let (column, _) = path.terminating_column();
                let element_type = column.postgres_type();
                let alias = self.compiler.add_join_statements(path);
                let column = column.aliased(alias);

                ResolvedEquality {
                    identity: column.transpile_to_string(),
                    column,
                    element_type,
                    parameter,
                }
            })
            .collect::<Vec<_>>();
        halves.sort_by(|left, right| left.identity.cmp(&right.identity));

        // A repeated column stays a plain conjunction, and a tuple standing on more than one table
        // stays direct on purpose, because a cross-table membership is a condition above
        // the join, which the planner answers by materializing the whole join first
        // (measured at 14x the disjunction's execution time on a two-table pair). The
        // boundary is one aliased table, base or joined, since same-table memberships on a
        // joined alias measured index-driven.
        let bundleable = halves.array_windows::<2>().all(|[left, right]| {
            left.identity != right.identity && left.column.correlation == right.column.correlation
        });

        if bundleable {
            let columns = halves
                .iter()
                .map(|half| (half.column.clone(), half.element_type.clone()))
                .collect::<Vec<_>>();

            let parameters = halves
                .into_iter()
                .map(|half| half.parameter)
                .collect::<Vec<_>>();

            if let Some(bundle) = tuple_bundles
                .iter_mut()
                .find(|bundle| bundle.columns == columns)
            {
                bundle.tuples.push(parameters);
            } else {
                tuple_bundles.push(ColumnTupleGroup {
                    columns,
                    tuples: vec![parameters],
                });
            }
        } else {
            // Excluded shapes build from the resolved halves; see `tuple_conjunction` for why they
            // are never re-compiled.
            let conjunction = self
                .tuple_conjunction(halves.into_iter().map(|half| (half.column, half.parameter)));
            expressions.push(conjunction);
        }
    }

    /// Builds the direct conjunction of `column = parameter` equalities from resolved
    /// tuple halves, in the order given (the recognizer's canonical column order).
    ///
    /// Shapes the recognizer gathers and then excludes (a lone tuple, a repeated column,
    /// columns on more than one table) compile from the halves already resolved:
    /// re-compiling the filter would resolve the same joins a second time, which leaves
    /// the first resolution orphaned in the FROM clause when a join was number-bumped.
    /// The recognizer admits no hooked, array-backed, JSON-reaching or otherwise rewritten
    /// column, so the direct equality means what the re-compile's expression would have
    /// meant. The match holds up to member order and operand orientation, since this
    /// conjunction is canonical where the plain path keeps the group's own order and
    /// normalizes a reversed `parameter == path`.
    fn tuple_conjunction<'filter: 'params>(
        &mut self,
        halves: impl IntoIterator<Item = (ColumnReference<'static>, &'params Parameter<'filter>)>,
    ) -> Expression {
        Expression::all(
            halves
                .into_iter()
                .map(|(column, parameter)| {
                    let (expression, _) = self.compiler.compile_parameter(parameter);

                    Expression::equal(Expression::ColumnReference(column), expression)
                })
                .collect(),
        )
    }

    /// Compiles column tuple equalities gathered from one `Any` group into a single
    /// row-membership predicate over the unnested tuple arrays.
    ///
    /// The N-way disjunction it replaces plans as a `BitmapOr` with one index-scan branch
    /// per tuple, whose planner memory grows linearly and whose planning time grows
    /// quadratically in the tuple count. The membership form keeps one parameter per tuple
    /// member and hands the planner one semi-join over the unnested rows in place of N
    /// branches, so a duplicate tuple cannot multiply result rows, and it stays a `WHERE`
    /// condition instead of adding a join. Each array's cast names its own column's stored
    /// type, so the parameters arrive exactly as the direct equality would have bound them.
    fn tuple_membership<'filter: 'query>(
        &mut self,
        columns: Vec<(ColumnReference<'static>, PostgresType)>,
        tuples: &[Vec<&'params Parameter<'filter>>],
        bundle_index: usize,
    ) -> Expression
    where
        R::QueryPath<'filter>: PostgresQueryPath,
    {
        // The condition index separates unnest aliases across conditions and the bundle index
        // separates them within one, so two rewrites in one statement render distinct names.
        let unnest = UNNEST_CORRELATION.at(Alias {
            condition_index: self.compiler.artifacts.condition_index,
            chain_depth: 0,
            number: bundle_index,
        });
        let members: Vec<_> = columns
            .iter()
            .enumerate()
            .map(|(index, (_, element_type))| TupleElement {
                position: index + 1,
                element_type: element_type.clone(),
            })
            .collect();

        let mut elements: Vec<Vec<_>> = vec![Vec::new(); members.len()];
        for tuple in tuples {
            for (member_elements, parameter) in elements.iter_mut().zip(tuple) {
                let (expression, _) = self.compiler.compile_parameter(parameter);
                member_elements.push(expression);
            }
        }

        // Unequal member counts would not fail: `UNNEST` pads the short arrays with
        // NULLs, and the query would silently return wrong rows.
        debug_assert!(
            elements
                .iter()
                .all(|member_elements| member_elements.len() == tuples.len()),
            "every tuple member must contribute one element per tuple"
        );

        // ROW(<a>, <b>, …) = ANY(SELECT "unnest_c_d_n"."elem_1", …
        //                        FROM UNNEST(ARRAY[$n, …]::<a>[], ARRAY[$m, …]::<b>[], …)
        //                        AS "unnest_c_d_n"("elem_1", …))
        Expression::Row(
            columns
                .into_iter()
                .map(|(reference, _)| Expression::ColumnReference(reference))
                .collect(),
        )
        .r#in(Expression::Select(Box::new(
            SelectStatement::builder()
                .selects(
                    members
                        .iter()
                        .map(|member| SelectExpression::new(unnest.column(member)))
                        .collect(),
                )
                .from(from_unnest(
                    unnest,
                    elements
                        .into_iter()
                        .zip(&members)
                        .map(|(elements, member)| {
                            Expression::Function(Function::ArrayLiteral {
                                elements,
                                element_type: member.element_type.clone(),
                            })
                        })
                        .collect(),
                    &members,
                ))
                .build(),
        )))
    }

    /// Compiles equality filters backed by one materialized array column into a single
    /// array predicate.
    fn array_predicate<'filter: 'query>(
        &mut self,
        column: ColumnReference<'static>,
        parameters: &[&'params Parameter<'filter>],
        operator: EqualityOperator,
        group: FilterGroup,
    ) -> Expression
    where
        R::QueryPath<'filter>: PostgresQueryPath,
    {
        let column_reference = Expression::ColumnReference(column);
        let array = Expression::Function(Function::ArrayLiteral {
            elements: parameters
                .iter()
                .map(|parameter| self.compiler.compile_parameter(parameter).0)
                .collect(),
            element_type: PostgresType::Text,
        });

        // For a single value `@>` and `&&` coincide, so the group connective is irrelevant.
        if parameters.len() == 1 {
            let contains = Expression::array_contains(column_reference, array);

            return match operator {
                EqualityOperator::Equal => contains,
                EqualityOperator::NotEqual => contains.not(),
            };
        }

        let func: fn(Expression, Expression) -> Expression = match (group, operator) {
            (FilterGroup::All, EqualityOperator::Equal) => Expression::array_contains,
            (FilterGroup::All, EqualityOperator::NotEqual) => {
                |lhs, rhs| Expression::overlap(lhs, rhs).not()
            }
            (FilterGroup::Any, EqualityOperator::Equal) => Expression::overlap,
            (FilterGroup::Any, EqualityOperator::NotEqual) => {
                |lhs, rhs| Expression::array_contains(lhs, rhs).not()
            }
        };

        (func)(column_reference, array)
    }

    /// Compiles the `path` to a condition, which is searching for the latest version.
    // Warning: This adds a CTE to the statement, which shadows the `ontology_ids` table.
    //          The CTE list is a plain push: two `version == "latest"` filters in one
    //          statement emit this CTE twice under one name, and Postgres rejects the
    //          statement (`WITH query name "ontology_ids" specified more than once`). The
    //          defect predates the tuple recognizer and goes away with the CTE's removal
    //          (H-1442 below).
    // TODO: Remove CTE to allow limit or cursor selection
    //   see https://linear.app/hash/issue/H-1442
    fn latest_ontology_version<'filter: 'query>(
        &mut self,
        path: &R::QueryPath<'filter>,
        operator: EqualityOperator,
    ) -> Expression
    where
        R::QueryPath<'filter>: PostgresQueryPath,
    {
        self.compiler.artifacts.cursor_disallowed_reason =
            Some("Cannot use latest version filter with cursor");

        let version_column = Column::OntologyIds(OntologyIds::Version);
        let alias = Alias {
            condition_index: 0,
            chain_depth: 0,
            number: 0,
        };

        // Add a WITH expression selecting the partitioned version
        self.compiler.statement.with.add_statement(
            Table::OntologyIds,
            SelectStatement::builder()
                .selects(vec![
                    SelectExpression::Asterisk(None),
                    SelectExpression::Expression {
                        expression: Expression::Function(Function::Max(Box::new(
                            Expression::ColumnReference(version_column.aliased(alias)),
                        )))
                        .window(WindowStatement::partition_by(Expression::ColumnReference(
                            Column::OntologyIds(OntologyIds::BaseUrl).aliased(alias),
                        ))),
                        alias: Some(Identifier::from("latest_version")),
                    },
                ])
                .from(
                    FromItem::table(version_column.table())
                        .alias(version_column.table().aliased(alias))
                        .build(),
                )
                .build(),
        );

        // Join the table of `path` and compare the version to the latest version
        let alias = self.compiler.add_join_statements(path);

        let func: fn(Expression, ColumnReference<'static>) -> Expression = match operator {
            EqualityOperator::Equal => Expression::equal,
            EqualityOperator::NotEqual => Expression::not_equal,
        };

        (func)(
            Expression::ColumnReference(version_column.aliased(alias)),
            Column::OntologyIds(OntologyIds::LatestVersion).aliased(alias),
        )
    }
}
