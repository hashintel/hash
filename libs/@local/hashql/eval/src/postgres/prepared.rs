#![expect(
    clippy::field_scoped_visibility_modifiers,
    reason = "internal module that is opaque to the outside"
)]
use core::{alloc::Allocator, fmt::Display, marker::PhantomData};

use hash_graph_postgres_store::store::postgres::query::{SelectStatement, Transpile as _};
use hashql_core::id::Id as _;
use hashql_mir::{
    body::basic_block::BasicBlockId,
    def::{DefId, DefIdSlice},
    pass::execution::VertexType,
};

use super::{
    ColumnDescriptor, Parameters,
    parameters::AuxiliaryParameters,
    projections::{AuxiliaryProjections, Projections},
};

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

    pub(super) projections: Projections,
    pub(super) auxiliary_parameters: AuxiliaryParameters<A>,
}

impl<A: Allocator> PreparedQuery<'_, A> {
    pub fn transpile(&self) -> impl Display {
        core::fmt::from_fn(|fmt| self.statement.transpile(fmt))
    }
}

/// Cons cell for the patch layer list.
///
/// Layers are pushed via [`PreparedQueryPatch::layer`] and execute
/// outermost-first: the last layer added runs first and receives the
/// rest of the list as its `next` continuation.
pub struct HCons<H, T> {
    head: H,
    tail: T,
}

/// Terminal element of the patch layer list.
///
/// When reached, materializes all auxiliary joins registered during
/// the preceding layers by calling
/// [`AuxiliaryProjections::build_joins`].
pub struct HNil;

/// Shared mutable context threaded through every patch layer.
///
/// Layers register projection demands (auxiliary joins) here; `HNil`
/// materializes them into the query's FROM clause at the end of the
/// chain.
pub struct PatchContext<'ctx, A: Allocator> {
    pub projections: AuxiliaryProjections,
    pub alloc: A,
    _marker: PhantomData<&'ctx ()>,
}

/// A composed patch chain that can be applied to a [`PreparedQuery`].
///
/// Implemented by [`HNil`] (which materializes joins) and by
/// [`HCons`] (which delegates to its head layer, passing the tail
/// as the `next` continuation).
pub trait PatchPreparedQuery<A: Allocator, S: Allocator> {
    fn patch_query(
        &mut self,
        context: &mut PatchContext<'_, A>,
        query: &mut PreparedQuery<'_, A>,
        scratch: S,
    );
}

/// A single patch layer in the continuation-passing pipeline.
///
/// Each layer receives a `next` continuation and must call
/// `next.patch_query()` exactly once. Work done before that call
/// can register projection demands and modify the WHERE clause;
/// work done after can inspect and rewrite the materialized FROM
/// tree.
///
/// Skipping the `next` call prevents join materialization and
/// blocks all inner layers. Calling it more than once duplicates
/// joins and conditions.
pub trait PatchPreparedQueryLayer<A: Allocator, S: Allocator> {
    fn patch_query<N>(
        &mut self,
        context: &mut PatchContext<'_, A>,
        query: &mut PreparedQuery<'_, A>,
        scratch: S,
        next: &mut N,
    ) where
        N: PatchPreparedQuery<A, S>;
}

impl<A: Allocator, S: Allocator> PatchPreparedQuery<A, S> for HNil {
    fn patch_query(
        &mut self,
        context: &mut PatchContext<'_, A>,
        query: &mut PreparedQuery<'_, A>,
        _: S,
    ) {
        let from = query
            .statement
            .from
            .take()
            .unwrap_or_else(|| unreachable!("every prepared query must have a FROM clause"));

        query.statement.from = Some(context.projections.build_joins(from));
    }
}

impl<H, T, A: Allocator, S: Allocator> PatchPreparedQuery<A, S> for HCons<H, T>
where
    H: PatchPreparedQueryLayer<A, S>,
    T: PatchPreparedQuery<A, S>,
{
    fn patch_query(
        &mut self,
        context: &mut PatchContext<'_, A>,
        query: &mut PreparedQuery<'_, A>,
        scratch: S,
    ) {
        let Self { head, tail } = self;

        head.patch_query(context, query, scratch, tail);
    }
}

/// Builder for a [`PatchPreparedQueryLayer`] pipeline.
///
/// Layers are added with [`layer`](Self::layer) and execute outermost-first:
/// the last layer added runs first. The pipeline terminates at [`HNil`],
/// which materializes all auxiliary joins accumulated by the layers.
///
/// ```text
/// PreparedQueryPatch::new()       // HNil (join materialization)
///     .layer(authorization)       // runs first, calls next for joins
///     .apply(&mut query, scratch);
/// ```
pub struct PreparedQueryPatch<T> {
    patches: T,
}

impl PreparedQueryPatch<HNil> {
    #[must_use]
    pub const fn new() -> Self {
        Self { patches: HNil }
    }
}

impl<T> PreparedQueryPatch<T> {
    /// Wraps the current pipeline with an additional outer layer.
    ///
    /// The new layer executes before all previously added layers.
    pub fn layer<T2>(self, other: T2) -> PreparedQueryPatch<HCons<T2, T>> {
        PreparedQueryPatch {
            patches: HCons {
                head: other,
                tail: self.patches,
            },
        }
    }

    /// Runs the full patch pipeline against `query`.
    ///
    /// Constructs [`AuxiliaryProjections`] from the query's compiled
    /// projections, then invokes the layer chain. The terminal [`HNil`]
    /// materializes all registered auxiliary joins into the FROM clause.
    pub fn apply<A: Allocator + Clone, S: Allocator>(
        mut self,
        query: &mut PreparedQuery<A>,
        scratch: S,
    ) where
        T: PatchPreparedQuery<A, S>,
    {
        let alloc = query.columns.allocator().clone();

        let projections = AuxiliaryProjections::new(&query.projections);
        let mut context = PatchContext {
            projections,
            alloc,
            _marker: PhantomData,
        };

        self.patches.patch_query(&mut context, query, scratch);
    }
}

impl Default for PreparedQueryPatch<HNil> {
    fn default() -> Self {
        Self::new()
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
    pub(crate) offsets: Box<DefIdSlice<usize>, A>,
    pub(crate) queries: Vec<(BasicBlockId, PreparedQuery<'heap, A>), A>,
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
