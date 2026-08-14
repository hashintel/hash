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

mod tuple;

use error_stack::Report;
use hash_graph_store::filter::{
    Filter, FilterExpression, FilterExpressionList, Parameter, QueryRecord,
};

use self::tuple::ColumnTupleGroup;
use super::{FilterGroup, SelectCompiler, SelectCompilerError};
use crate::store::postgres::query::{
    Alias, Column, ColumnReference, EqualityOperator, Expression, FromItem, Function, Identifier,
    PostgresQueryPath, PostgresRecord, SelectExpression, SelectStatement, Table, WindowStatement,
    postgres_type::PostgresType,
    table::{DatabaseColumn as _, FilterColumn as _, OntologyIds},
};

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
                    ColumnTupleGroup::bundle(
                        self.compiler,
                        halves,
                        &mut tuple_bundles,
                        &mut expressions,
                    );
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
            expressions.push(bundle.compile(self.compiler, index));
        }

        Ok(expressions)
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
