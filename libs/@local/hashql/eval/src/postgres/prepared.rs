#![expect(
    clippy::field_scoped_visibility_modifiers,
    reason = "internal module that is opaque to the outside"
)]
use core::{alloc::Allocator, fmt::Display};

use hash_graph_postgres_store::store::postgres::query::{SelectStatement, Transpile as _};
use hashql_core::id::Id as _;
use hashql_mir::{
    body::basic_block::BasicBlockId,
    def::{DefId, DefIdSlice},
    pass::execution::VertexType,
};
use postgres_types::ToSql;

use super::{ColumnDescriptor, Parameters, projections::Projections};

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
    pub(super) auxiliary_parameters: Vec<Box<dyn ToSql + Sync, A>, A>,
}

impl<A: Allocator> PreparedQuery<'_, A> {
    pub fn transpile(&self) -> impl Display {
        core::fmt::from_fn(|fmt| self.statement.transpile(fmt))
    }

    pub(crate) fn projections(&self) -> &Projections {
        &self.projections
    }
}

pub trait PatchPreparedQuery {
    fn patch_statement(&mut self, statement: &mut SelectStatement);
}

impl<T: PatchPreparedQuery> PatchPreparedQuery for (T,)
where
    T: PatchPreparedQuery,
{
    fn patch_statement(&mut self, statement: &mut SelectStatement) {
        self.0.patch_statement(statement);
    }
}

impl<T: PatchPreparedQuery, U: PatchPreparedQuery> PatchPreparedQuery for (T, U)
where
    T: PatchPreparedQuery,
    U: PatchPreparedQuery,
{
    fn patch_statement(&mut self, statement: &mut SelectStatement) {
        self.0.patch_statement(statement);
        self.1.patch_statement(statement);
    }
}

impl<F> PatchPreparedQuery for F
where
    F: FnMut(&mut SelectStatement),
{
    fn patch_statement(&mut self, statement: &mut SelectStatement) {
        (self)(statement);
    }
}

pub struct PreparedQueryPatch<T, A: Allocator> {
    patches: T,
    parameters: Vec<Box<dyn ToSql + Sync, A>, A>,
}

impl<T, A: Allocator> PreparedQueryPatch<T, A>
where
    T: PatchPreparedQuery,
{
    pub fn apply(mut self, query: &mut PreparedQuery<A>) {
        self.patches.patch_statement(&mut query.statement);
        query.auxiliary_parameters.append(&mut self.parameters);
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
