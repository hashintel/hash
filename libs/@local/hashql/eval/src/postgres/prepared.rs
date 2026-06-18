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

pub struct HCons<H, T> {
    head: H,
    tail: T,
}

pub struct HNil;

pub struct PatchContext<'ctx, A: Allocator> {
    pub projections: AuxiliaryProjections,
    pub alloc: A,
    _marker: PhantomData<&'ctx ()>,
}

pub trait PatchPreparedQuery<A: Allocator, S: Allocator> {
    fn patch_query(
        &mut self,
        context: &mut PatchContext<'_, A>,
        query: &mut PreparedQuery<'_, A>,
        scratch: S,
    );
}

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
    pub fn layer<T2>(self, other: T2) -> PreparedQueryPatch<HCons<T2, T>> {
        PreparedQueryPatch {
            patches: HCons {
                head: other,
                tail: self.patches,
            },
        }
    }

    pub fn apply<A: Allocator + Clone, S: Allocator>(
        &mut self,
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
