//! HashQL MIR → PostgreSQL `SELECT` compiler.
//!
//! This module compiles a [`GraphRead`] (a graph query with one or more filter bodies) into a
//! [`PreparedQuery`]: a [`SelectStatement`] plus a deduplicated parameter list ([`Parameters`]).
//!
//! ## Execution model: islands and continuations
//!
//! Filter bodies are compiled *island-by-island*. An *island* is a group of MIR basic blocks that
//! the execution placement pass assigned to the Postgres backend
//! ([`TargetId::Postgres`]).
//!
//! Each compiled island becomes a `CROSS JOIN LATERAL` subquery that returns a single composite
//! `continuation` value. The continuation transports control-flow information back to the
//! interpreter:
//!
//! - **`filter`** (`bool`): tri-state: `NULL` passthrough, `TRUE` keep, `FALSE` reject.
//! - **`block`** (`int`): next basic block when leaving the island.
//! - **`locals`** (`int[]`) and **`values`** (`jsonb[]`): parallel arrays carrying live-out locals.
//!
//! Continuation subqueries are forced to materialise once per row using `OFFSET 0` to prevent
//! PostgreSQL from inlining the subquery and duplicating the island's `CASE` tree per field access.
//!
//! ## Parameters and projections
//!
//! Parameters are deduplicated by identity and referenced by index (rendered as `$N` in SQL).
//! Table joins are *lazy*: the compiler only requests joins when an [`EntityPath`] is actually
//! referenced by filters or required outputs (the "provides" set).
//!
//! [`GraphRead`]: hashql_mir::body::terminator::GraphRead
//! [`TargetId::Postgres`]: hashql_mir::pass::execution::TargetId::Postgres
//! [`EntityPath`]: hashql_mir::pass::execution::traversal::EntityPath

use core::{alloc::Allocator, fmt::Display};

use hash_graph_postgres_store::store::postgres::query::{
    self, Column, Expression, Identifier, SelectExpression, SelectStatement, Transpile as _,
    WhereExpression, table::EntityTemporalMetadata,
};
use hashql_core::{
    debug_panic,
    heap::BumpAllocator,
    id::Id as _,
    r#type::{TypeBuilder, TypeId, environment::LatticeEnvironment},
};
use hashql_mir::{
    body::{
        Body,
        basic_block::BasicBlockId,
        local::Local,
        terminator::{GraphRead, GraphReadBody, GraphReadHead, TerminatorKind},
    },
    def::{DefId, DefIdSlice},
    pass::{
        analysis::dataflow::lattice::HasBottom as _,
        execution::{
            IslandId, IslandKind, IslandNode, TargetId, VertexType,
            traversal::{EntityPath, TraversalMapLattice, TraversalPath, TraversalPathBitMap},
        },
    },
};

use self::{
    continuation::ContinuationColumn, filter::GraphReadFilterCompiler, projections::Projections,
    types::traverse_struct,
};
pub use self::{
    continuation::ContinuationField,
    parameters::{Parameter, ParameterIndex, ParameterValue, Parameters, TemporalAxis},
};
use crate::context::EvalContext;

mod continuation;
pub(crate) mod error;
mod filter;
mod parameters;
mod projections;
mod traverse;
mod types;

/// Mutable compilation state accumulated while building a single SQL query.
///
/// Collects deduplicated [`Parameters`], requested [`Projections`] (lazy joins driven by
/// [`EntityPath`] usage), the top-level [`WhereExpression`] (temporal constraints and continuation
/// filters), and `CROSS JOIN LATERAL` items for island continuations.
///
/// [`EntityPath`]: hashql_mir::pass::execution::traversal::EntityPath
pub(crate) struct DatabaseContext<'heap, A: Allocator> {
    pub parameters: Parameters<'heap, A>,
    pub projections: Projections,
    pub where_expression: WhereExpression,
    pub laterals: Vec<query::FromItem<'static>, A>,
    pub continuation_aliases: Vec<continuation::ContinuationAlias, A>,
}

impl<A: Allocator> DatabaseContext<'_, A> {
    pub(crate) fn new_in(alloc: A) -> Self
    where
        A: Clone,
    {
        Self {
            parameters: Parameters::new_in(alloc.clone()),
            projections: Projections::new(),
            where_expression: WhereExpression::default(),
            laterals: Vec::new_in(alloc.clone()),
            continuation_aliases: Vec::new_in(alloc),
        }
    }

    /// Adds temporal overlap constraints to the top-level `WHERE` clause.
    ///
    /// Both axes are always expressed as `&&` (range overlap) so the `GiST` index on
    /// `(web_id, entity_uuid, transaction_time, decision_time)` is usable regardless of which
    /// axis is pinned.
    ///
    /// The interpreter is responsible for binding the [`TemporalAxis`] parameters correctly:
    /// - **Pinned axis:** `[timestamp, timestamp]` (degenerate single-point range, equivalent to
    ///   `@>`).
    /// - **Variable axis:** the actual query interval.
    ///
    /// This avoids a `CASE`-based approach which would hide the operators from the planner and
    /// prevent index scans on generic plans.
    fn add_temporal_conditions(&mut self) {
        let temporal_metadata = self.projections.temporal_metadata();

        let tx_param = self
            .parameters
            .temporal_axis(TemporalAxis::Transaction)
            .to_expr();
        let dt_param = self
            .parameters
            .temporal_axis(TemporalAxis::Decision)
            .to_expr();

        self.where_expression.add_condition(Expression::overlap(
            Expression::ColumnReference(query::ColumnReference {
                correlation: Some(temporal_metadata.clone()),
                name: Column::EntityTemporalMetadata(EntityTemporalMetadata::TransactionTime)
                    .into(),
            }),
            tx_param,
        ));

        self.where_expression.add_condition(Expression::overlap(
            Expression::ColumnReference(query::ColumnReference {
                correlation: Some(temporal_metadata),
                name: Column::EntityTemporalMetadata(EntityTemporalMetadata::DecisionTime).into(),
            }),
            dt_param,
        ));
    }
}

/// Describes a single column in the `SELECT` list of a compiled query.
///
/// The bridge uses this manifest to decode each column in a result row without
/// parsing column names. Entity field columns carry a [`TraversalPath`] for
/// hydration; continuation columns carry the body/island identity for routing
/// control flow back to the interpreter.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum ColumnDescriptor {
    /// An entity field produced by the provides set.
    ///
    /// The [`TraversalPath`] identifies the storage location; the [`TypeId`] is the
    /// field's type within the instantiated vertex type, used for type-directed
    /// deserialization.
    Path { path: TraversalPath, r#type: TypeId },
    /// A decomposed continuation field from an island's `CROSS JOIN LATERAL`.
    Continuation {
        body: DefId,
        island: IslandId,
        field: ContinuationField,
    },
}

impl Display for ColumnDescriptor {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Path { path, .. } => write!(fmt, "entity path `{}`", path.as_symbol()),
            Self::Continuation {
                body,
                island,
                field,
            } => {
                write!(
                    fmt,
                    "continuation {} (body {body}, island {island})",
                    ContinuationColumn::from(*field).as_str()
                )
            }
        }
    }
}

/// A fully-compiled SQL query ready for execution.
///
/// Contains the typed query AST ([`SelectStatement`]), the parameter catalog ([`Parameters`])
/// for binding runtime values, and a column manifest ([`ColumnDescriptor`]s) that tells the
/// bridge how to decode each result column.
pub struct PreparedQuery<'heap, A: Allocator> {
    pub vertex_type: VertexType,
    pub parameters: Parameters<'heap, A>,
    pub statement: SelectStatement,
    pub columns: Vec<ColumnDescriptor, A>,
}

impl<A: Allocator> PreparedQuery<'_, A> {
    pub fn transpile(&self) -> impl Display {
        core::fmt::from_fn(|fmt| self.statement.transpile(fmt))
    }
}

/// Registry of compiled SQL queries, indexed by definition and basic block.
///
/// The SQL lowering pass produces one [`PreparedQuery`] per [`GraphRead`]
/// terminator in the MIR. This struct stores them contiguously in `queries`
/// with `offsets` providing per-definition starting positions, so
/// [`find`](Self::find) can locate the correct query for a given `(DefId,
/// BasicBlockId)` pair.
///
/// [`GraphRead`]: hashql_mir::body::terminator::GraphRead
pub struct PreparedQueries<'heap, A: Allocator> {
    offsets: Box<DefIdSlice<usize>, A>,
    queries: Vec<(BasicBlockId, PreparedQuery<'heap, A>), A>,
}

impl<'heap, A: Allocator> PreparedQueries<'heap, A> {
    pub fn find(&self, body: DefId, block: BasicBlockId) -> Option<&PreparedQuery<'heap, A>> {
        let start = self.offsets[body];
        let end = self.offsets[body.plus(1)];

        self.queries[start..end]
            .iter()
            .find(|(id, _)| *id == block)
            .map(|(_, query)| query)
    }
}

/// Compiles Postgres-targeted MIR islands into a single PostgreSQL `SELECT`.
///
/// Created per evaluation and used to compile [`GraphRead`] terminators. Compilation emits
/// diagnostics into the shared [`EvalContext`] rather than returning `Result`, so multiple
/// errors can be reported from a single compilation pass.
///
/// [`GraphRead`]: hashql_mir::body::terminator::GraphRead
pub struct PostgresCompiler<'eval, 'ctx, 'heap, A: Allocator, S: Allocator> {
    context: &'eval mut EvalContext<'ctx, 'heap, A>,

    alloc: A,
    scratch: S,

    /// Pre-built expression to subtract protected property keys from JSONB columns.
    ///
    /// When present, `properties` and `property_metadata` `SELECT` expressions are
    /// wrapped as `(column - mask)`. The caller builds this from the permission
    /// system's protection rules; the compiler doesn't know about entity types
    /// or actors.
    property_mask: Option<Expression>,
}

impl<'eval, 'ctx, 'heap, A: Allocator, S: BumpAllocator>
    PostgresCompiler<'eval, 'ctx, 'heap, A, S>
{
    pub fn new_in(context: &'eval mut EvalContext<'ctx, 'heap, A>, scratch: S) -> Self
    where
        A: Clone,
    {
        let alloc = context.alloc.clone();

        Self {
            context,
            alloc,
            scratch,
            property_mask: None,
        }
    }

    /// Sets an optional JSONB key mask applied to selected property columns.
    ///
    /// When set, `properties` and `property_metadata` selections are wrapped as
    /// `(column - mask)` to strip protected keys from the output. The compiler itself does not
    /// understand permissions; the caller is responsible for building the mask.
    #[must_use]
    pub fn with_property_mask(mut self, property_mask: Option<Expression>) -> Self {
        self.property_mask = property_mask;
        self
    }

    /// Joins the property types across all filter bodies into a single type.
    ///
    /// Each filter body may operate on a different `Entity<T>`. This computes the
    /// least upper bound of all the `T` parameters, producing the unified property type
    /// for the query's SELECT list. Returns `unknown` if there are no filter bodies.
    fn resolve_property_type(&self, read: &GraphRead<'heap>) -> TypeId {
        let mut lattice = LatticeEnvironment::new(self.context.env).without_warnings();

        read.body
            .iter()
            .map(|body| match body {
                &GraphReadBody::Filter(def_id, _) => {
                    let vertex = self.context.bodies[def_id].local_decls[Local::VERTEX].r#type;

                    let path = EntityPath::Properties.field_path();

                    traverse_struct(self.context.env, vertex, path).unwrap_or_else(|| {
                        debug_panic!(
                            "failed to extract property type from vertex type {vertex:?}; the \
                             vertex type should contain a resolvable properties field"
                        );

                        TypeBuilder::synthetic(self.context.env).unknown()
                    })
                }
            })
            .reduce(|lhs, rhs| lattice.join(lhs, rhs))
            .unwrap_or_else(|| TypeBuilder::synthetic(self.context.env).unknown())
    }

    /// Returns `None` for data-only islands that produce no SQL.
    fn compile_graph_read_filter_island(
        &mut self,
        db: &mut DatabaseContext<'heap, A>,
        body: &Body<'heap>,
        env: Local,
        island: &IslandNode,
        provides: &mut TraversalPathBitMap,
    ) -> Option<Expression> {
        provides.insert(island.provides());

        // Explicit match here, because it means that we'll get a compile-time error if a new
        // variant is added.
        match island.kind() {
            IslandKind::Exec(_) => {}
            IslandKind::Data => return None, // nothing to do
        }

        // TODO: we might want a longer lived graph read filter compiler here
        let expression = self.scratch.scoped(|alloc| {
            let mut compiler = GraphReadFilterCompiler::new(self.context, body, env, &alloc);

            let expression = compiler.compile_body(db, island);
            let mut diagnostics = compiler.into_diagnostics();

            self.context.diagnostics.append(&mut diagnostics);
            expression
        });

        Some(expression)
    }

    /// Emits a diagnostic if no island graph exists for the filter body.
    fn compile_graph_read_filter(
        &mut self,
        db: &mut DatabaseContext<'heap, A>,
        def: DefId,
        env: Local,
        provides: &mut TraversalPathBitMap,
    ) {
        let body = &self.context.bodies[def];

        let Some(residual) = self.context.execution.lookup(body.id) else {
            self.context
                .diagnostics
                .push(error::missing_island_graph(body.span));
            return;
        };

        let islands = residual.islands.find(TargetId::Postgres);

        for (island_id, island) in islands {
            let Some(expression) =
                self.compile_graph_read_filter_island(db, body, env, island, provides)
            else {
                continue;
            };

            let cont_alias = continuation::ContinuationAlias {
                body: def,
                island: island_id,
            };
            let table_ref = cont_alias.table_ref();

            // We explicitly set an OFFSET, as otherwise the postgres planner inlines the
            // subquery and duplicates the CASE tree per field access, making it much more
            // expensive to compute.
            let subquery = SelectStatement::builder()
                .selects(vec![SelectExpression::Expression {
                    expression,
                    alias: Some(ContinuationColumn::Entry.identifier()),
                }])
                .offset(0)
                .build();

            let subquery = query::FromItem::Subquery {
                lateral: true,
                statement: Box::new(subquery),
                alias: Some(table_ref.clone()),
                column_alias: Vec::new(),
            };

            db.laterals.push(subquery);
            db.where_expression
                .add_condition(continuation::filter_condition(&table_ref));
            db.continuation_aliases.push(cont_alias);
        }
    }

    fn compile_graph_read_entity(&mut self, read: &GraphRead<'heap>) -> PreparedQuery<'heap, A>
    where
        A: Clone,
    {
        let mut db = DatabaseContext::new_in(self.alloc.clone());

        let mut property_type = None;

        // Temporal conditions go first - they're always present on the base table
        // and don't depend on anything the filter body produces.
        db.add_temporal_conditions();

        let mut provides = TraversalMapLattice.bottom();

        for body in &read.body {
            match body {
                &GraphReadBody::Filter(def_id, env) => {
                    self.compile_graph_read_filter(&mut db, def_id, env, &mut provides);
                }
            }
        }

        // Build SELECT list from what the interpreter needs back.
        // Each EntityPath in `provides` becomes a SELECT expression via eval_entity_path,
        // which also registers the necessary projection joins in DatabaseContext.
        let mut select_expressions = vec![];
        let mut columns = Vec::new_in(self.alloc.clone());

        for traversal_path in provides[VertexType::Entity].iter() {
            let TraversalPath::Entity(path) = traversal_path;

            let mut expression = traverse::eval_entity_path(&mut db, path);

            if matches!(path, EntityPath::Properties | EntityPath::PropertyMetadata)
                && let Some(mask) = &self.property_mask
            {
                expression = Expression::grouped(Expression::subtract(expression, mask.clone()));
            }

            let alias = Identifier::from(traversal_path.as_symbol().unwrap());

            let field_type = traversal_path
                .resolve_type(self.context.env)
                .unwrap_or_else(|| {
                    *property_type.get_or_insert_with(|| self.resolve_property_type(read))
                });

            select_expressions.push(SelectExpression::Expression {
                expression,
                alias: Some(alias),
            });
            columns.push(ColumnDescriptor::Path {
                path: traversal_path,
                r#type: field_type,
            });
        }

        // Decompose each continuation LATERAL into individual columns so the
        // interpreter receives flat typed values instead of Postgres composites.
        // Filter is excluded; it's only used in the WHERE clause.
        for &cont_alias in &db.continuation_aliases {
            let table_ref = cont_alias.table_ref();

            for field in [
                ContinuationField::Block,
                ContinuationField::Locals,
                ContinuationField::Values,
            ] {
                select_expressions.push(SelectExpression::Expression {
                    expression: continuation::field_access(&table_ref, field.into()),
                    alias: Some(cont_alias.field_identifier(field.into())),
                });
                columns.push(ColumnDescriptor::Continuation {
                    body: cont_alias.body,
                    island: cont_alias.island,
                    field,
                });
            }
        }

        // Build FROM: base table + joins + CROSS JOIN LATERALs
        let from = db.projections.build_from(&mut db.parameters, db.laterals);

        // Ensure there's at least one select expression - PostgreSQL requires a non-empty select
        // list
        if select_expressions.is_empty() {
            select_expressions.push(SelectExpression::Expression {
                expression: Expression::Constant(query::Constant::U32(1)),
                alias: Some(Identifier::from("placeholder")),
            });
        }

        let query = SelectStatement::builder()
            .selects(select_expressions)
            .from(from)
            .where_expression(db.where_expression)
            .build();

        PreparedQuery {
            vertex_type: VertexType::Entity,
            parameters: db.parameters,
            statement: query,
            columns,
        }
    }

    /// Compiles a [`GraphRead`] into a [`PreparedQuery`].
    ///
    /// [`GraphRead`]: hashql_mir::body::terminator::GraphRead
    pub fn compile_graph_read(&mut self, read: &'ctx GraphRead<'heap>) -> PreparedQuery<'heap, A>
    where
        A: Clone,
    {
        match read.head {
            GraphReadHead::Entity { .. } => self.compile_graph_read_entity(read),
        }
    }

    #[expect(unsafe_code)]
    pub fn compile(&mut self) -> PreparedQueries<'heap, A>
    where
        A: Clone,
    {
        // SAFETY: 0 is a valid value for `usize`
        let offsets = unsafe {
            Box::new_zeroed_slice_in(self.context.bodies.len() + 1, self.alloc.clone())
                .assume_init()
        };
        let mut offsets = DefIdSlice::from_boxed_slice(offsets);

        let mut queries = Vec::with_capacity_in(self.context.bodies.len(), self.alloc.clone());

        let bodies = self.context.bodies;
        for (body_id, body) in bodies.iter_enumerated() {
            for (block_id, block) in body.basic_blocks.iter_enumerated() {
                match &block.terminator.kind {
                    TerminatorKind::GraphRead(read) => {
                        let query = self.compile_graph_read(read);
                        queries.push((block_id, query));
                    }
                    TerminatorKind::Goto(_)
                    | TerminatorKind::SwitchInt(_)
                    | TerminatorKind::Return(_)
                    | TerminatorKind::Unreachable => {}
                }
            }

            offsets[body_id.plus(1)] = queries.len();
        }

        PreparedQueries { offsets, queries }
    }
}
