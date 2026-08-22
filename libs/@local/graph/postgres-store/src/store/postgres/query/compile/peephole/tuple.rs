//! Column-tuple bundling and its row-membership compilation.
//!
//! An `Any` group whose `All` members each pin one set of plain scalar columns states a row
//! membership over value tuples. [`ColumnTupleGroup`] gathers those members in canonical column
//! order and compiles the group to one membership predicate over unnested arrays, binding each
//! column's values as a single array parameter, so neither the statement text nor the parameter
//! count changes with the tuple count.

use hash_graph_store::filter::Parameter;
use postgres_types::ToSql;

use crate::store::postgres::query::{
    Alias, ColumnName, ColumnReference, Correlation, Expression, FromItem, Function,
    PostgresQueryPath, PostgresRecord, SelectCompiler, SelectExpression, SimpleSelect, TableName,
    Transpile as _, postgres_type::PostgresType, table::DatabaseColumn,
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
    reference: impl Into<TableName<'static>>,
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

/// Collects member `position` of every tuple into one owned array value.
///
/// `None` reports a bundle the single-parameter form cannot bind: members of mixed variants, or
/// a variant no SQL array element carries. The caller then binds every member as its own
/// parameter inside an array literal, which every variant supports.
fn column_array(
    tuples: &[Vec<&Parameter<'_>>],
    position: usize,
) -> Option<Box<dyn ToSql + Sync + Send>> {
    fn collect<T>(
        tuples: &[Vec<&Parameter<'_>>],
        position: usize,
        extract: impl Fn(&Parameter<'_>) -> Option<T>,
    ) -> Option<Vec<T>> {
        tuples
            .iter()
            .map(|tuple| tuple.get(position).copied().and_then(&extract))
            .collect()
    }

    match tuples.first()?.get(position)? {
        Parameter::Uuid(_) => collect(tuples, position, |parameter| match parameter {
            Parameter::Uuid(uuid) => Some(*uuid),
            Parameter::Boolean(_)
            | Parameter::Decimal(_)
            | Parameter::Text(_)
            | Parameter::Vector(_)
            | Parameter::Any(_)
            | Parameter::OntologyTypeVersion(_)
            | Parameter::Timestamp(_) => None,
        })
        .map(|values| Box::new(values) as Box<dyn ToSql + Sync + Send>),
        Parameter::Text(_) => collect(tuples, position, |parameter| match parameter {
            Parameter::Text(text) => Some(text.to_string()),
            Parameter::Boolean(_)
            | Parameter::Decimal(_)
            | Parameter::Vector(_)
            | Parameter::Any(_)
            | Parameter::Uuid(_)
            | Parameter::OntologyTypeVersion(_)
            | Parameter::Timestamp(_) => None,
        })
        .map(|values| Box::new(values) as Box<dyn ToSql + Sync + Send>),
        Parameter::Boolean(_) => collect(tuples, position, |parameter| match parameter {
            Parameter::Boolean(boolean) => Some(*boolean),
            Parameter::Decimal(_)
            | Parameter::Text(_)
            | Parameter::Vector(_)
            | Parameter::Any(_)
            | Parameter::Uuid(_)
            | Parameter::OntologyTypeVersion(_)
            | Parameter::Timestamp(_) => None,
        })
        .map(|values| Box::new(values) as Box<dyn ToSql + Sync + Send>),
        Parameter::Decimal(_) => collect(tuples, position, |parameter| match parameter {
            Parameter::Decimal(number) => Some(number.clone()),
            Parameter::Boolean(_)
            | Parameter::Text(_)
            | Parameter::Vector(_)
            | Parameter::Any(_)
            | Parameter::Uuid(_)
            | Parameter::OntologyTypeVersion(_)
            | Parameter::Timestamp(_) => None,
        })
        .map(|values| Box::new(values) as Box<dyn ToSql + Sync + Send>),
        Parameter::Timestamp(_) => collect(tuples, position, |parameter| match parameter {
            Parameter::Timestamp(timestamp) => Some(*timestamp),
            Parameter::Boolean(_)
            | Parameter::Decimal(_)
            | Parameter::Text(_)
            | Parameter::Vector(_)
            | Parameter::Any(_)
            | Parameter::Uuid(_)
            | Parameter::OntologyTypeVersion(_) => None,
        })
        .map(|values| Box::new(values) as Box<dyn ToSql + Sync + Send>),
        Parameter::OntologyTypeVersion(_) => {
            collect(tuples, position, |parameter| match parameter {
                Parameter::OntologyTypeVersion(version) => Some(version.as_ref().clone()),
                Parameter::Boolean(_)
                | Parameter::Decimal(_)
                | Parameter::Text(_)
                | Parameter::Vector(_)
                | Parameter::Any(_)
                | Parameter::Uuid(_)
                | Parameter::Timestamp(_) => None,
            })
            .map(|values| Box::new(values) as Box<dyn ToSql + Sync + Send>)
        }
        Parameter::Vector(_) | Parameter::Any(_) => None,
    }
}

/// One recognized equality with its joins resolved, keyed for canonical ordering.
struct ResolvedEquality<'params, 'filter> {
    /// The aliased column's transpiled form, the sort and bundle-match key.
    identity: String,
    column: ColumnReference<'static>,
    element_type: PostgresType,
    parameter: &'params Parameter<'filter>,
}

/// The bundle for one recognized column set.
///
/// The columns stand in canonical order, and each tuple holds one parameter per column,
/// aligned to that order.
pub(super) struct ColumnTupleGroup<'params, 'filter> {
    /// The tuple's columns in canonical order, each with its stored type.
    columns: Vec<(ColumnReference<'static>, PostgresType)>,
    tuples: Vec<Vec<&'params Parameter<'filter>>>,
}

impl<'params, 'filter> ColumnTupleGroup<'params, 'filter> {
    /// Resolves a recognized tuple's halves into canonical order, then either merges the
    /// tuple into the bundle keyed on exactly its column set or pushes its direct
    /// conjunction.
    ///
    /// Sorting by the column's transpiled identity makes the tuple order canonical, so
    /// bundles match by plain equality with their parameters already aligned, whatever
    /// order the group wrote the equalities in.
    pub(super) fn bundle<'query, R>(
        compiler: &mut SelectCompiler<'params, 'query, R>,
        tuple: Vec<(&'params R::QueryPath<'filter>, &'params Parameter<'filter>)>,
        bundles: &mut Vec<Self>,
        expressions: &mut Vec<Expression>,
    ) where
        'query: 'params,
        'filter: 'query,
        R: PostgresRecord,
        R::QueryPath<'filter>: PostgresQueryPath,
    {
        let mut halves = tuple
            .into_iter()
            .map(|(path, parameter)| {
                let (column, _) = path.terminating_column();
                let element_type = column.postgres_type();
                let alias = compiler.add_join_statements(path);
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

            if let Some(bundle) = bundles.iter_mut().find(|bundle| bundle.columns == columns) {
                bundle.tuples.push(parameters);
            } else {
                bundles.push(Self {
                    columns,
                    tuples: vec![parameters],
                });
            }
        } else {
            // Excluded shapes build from the resolved halves; see `conjunction` for why they
            // are never re-compiled.
            let conjunction = conjunction(
                compiler,
                halves.into_iter().map(|half| (half.column, half.parameter)),
            );
            expressions.push(conjunction);
        }
    }

    /// Compiles the bundle to its predicate.
    ///
    /// One tuple gains nothing over its own conjunction, and the direct form lets the columns'
    /// own indexes serve it without an unnest, so a singleton bundle compiles to the
    /// conjunction and every wider bundle compiles to the row membership.
    pub(super) fn compile<'query, R>(
        self,
        compiler: &mut SelectCompiler<'params, 'query, R>,
        bundle_index: usize,
    ) -> Expression
    where
        'query: 'params,
        'filter: 'query,
        R: PostgresRecord,
    {
        let Self { columns, tuples } = self;

        if let [tuple] = tuples.as_slice() {
            conjunction(
                compiler,
                columns
                    .into_iter()
                    .map(|(reference, _)| reference)
                    .zip(tuple.iter().copied()),
            )
        } else {
            membership(compiler, columns, &tuples, bundle_index)
        }
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
fn conjunction<'params, 'filter, 'query, R>(
    compiler: &mut SelectCompiler<'params, 'query, R>,
    halves: impl IntoIterator<Item = (ColumnReference<'static>, &'params Parameter<'filter>)>,
) -> Expression
where
    'filter: 'params,
    'query: 'params,
    R: PostgresRecord,
{
    Expression::all(
        halves
            .into_iter()
            .map(|(column, parameter)| {
                let (expression, _) = compiler.compile_parameter(parameter);

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
/// quadratically in the tuple count. The membership form binds each column's values as
/// one owned array parameter and hands the planner one semi-join over the unnested rows
/// in place of N branches, so a duplicate tuple cannot multiply result rows, it stays a
/// `WHERE` condition instead of adding a join, and the statement text no longer changes
/// with the tuple count, so the driver reuses one prepared statement across batch sizes.
/// Each array's cast names its own column's stored type, so the values arrive exactly
/// as the direct equality would have bound them. A bundle whose members mix parameter
/// variants, or carry a variant no SQL array can hold, falls back to binding every
/// member as its own parameter inside an array literal.
fn membership<'params, 'filter, 'query, R>(
    compiler: &mut SelectCompiler<'params, 'query, R>,
    columns: Vec<(ColumnReference<'static>, PostgresType)>,
    tuples: &[Vec<&'params Parameter<'filter>>],
    bundle_index: usize,
) -> Expression
where
    'filter: 'params,
    'query: 'params,
    R: PostgresRecord,
{
    // The condition index separates unnest aliases across conditions and the bundle index
    // separates them within one, so two rewrites in one statement render distinct names.
    let unnest = UNNEST_CORRELATION.at(Alias {
        condition_index: compiler.artifacts.condition_index,
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

    let arrays: Option<Vec<Box<dyn ToSql + Sync + Send>>> = (0..members.len())
        .map(|position| column_array(tuples, position))
        .collect();

    // UNNEST($n::<a>[], $m::<b>[]) when every column collects into one owned array,
    // UNNEST(ARRAY[$n, …]::<a>[], …) with one parameter per member otherwise.
    let array_expressions: Vec<Expression> = if let Some(arrays) = arrays {
        arrays
            .into_iter()
            .zip(&members)
            .map(|(array, member)| {
                compiler
                    .add_owned_parameter(array)
                    .cast(PostgresType::Array(Box::new(member.element_type.clone())))
            })
            .collect()
    } else {
        let mut elements: Vec<Vec<_>> = vec![Vec::new(); members.len()];
        for tuple in tuples {
            for (member_elements, parameter) in elements.iter_mut().zip(tuple) {
                let (expression, _) = compiler.compile_parameter(parameter);
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

        elements
            .into_iter()
            .zip(&members)
            .map(|(elements, member)| {
                Expression::Function(Function::ArrayLiteral {
                    elements,
                    element_type: member.element_type.clone(),
                })
            })
            .collect()
    };

    // ROW(<a>, <b>, …) = ANY(SELECT "unnest_c_d_n"."elem_1", …
    //                        FROM UNNEST(…)
    //                        AS "unnest_c_d_n"("elem_1", …))
    Expression::Row(
        columns
            .into_iter()
            .map(|(reference, _)| Expression::ColumnReference(reference))
            .collect(),
    )
    .r#in(Expression::Select(Box::new(
        SimpleSelect::builder()
            .selects(
                members
                    .iter()
                    .map(|member| SelectExpression::new(unnest.column(member)))
                    .collect(),
            )
            .from(from_unnest(unnest, array_expressions, &members))
            .build()
            .into(),
    )))
}
