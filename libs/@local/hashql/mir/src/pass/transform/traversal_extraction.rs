//! Traversal extraction transformation pass.
//!
//! This pass extracts projections from a target local into separate bindings, creating explicit
//! intermediate assignments. It is the inverse of projection forwarding — rather than inlining
//! projections, it materializes them as distinct locals.
//!
//! # Purpose
//!
//! The primary use case is preparing graph read filters for entity traversal. When reading from
//! the graph, the filter body receives a vertex as its second argument (`Local::new(1)`).
//! Projections like `vertex.2.1` (accessing nested properties) need to be extracted so the graph
//! executor can track which paths through the vertex are actually accessed.
//!
//! # Algorithm
//!
//! The pass operates by:
//!
//! 1. Walking all operands in the MIR body
//! 2. For each place operand projecting from the target local, creating a new local and load
//! 3. Replacing the original operand with a reference to the new local
//! 4. Recording the projection path in a [`Traversals`] map for later consumption
//!
//! Deduplication is scoped to the current basic block — if the same projection appears multiple
//! times within a block, it reuses the existing extracted local rather than creating duplicates.
//!
//! Pre-existing loads (e.g., `b = a.2.1`) are detected via [`VisitorMut::visit_statement_assign`]
//! and recorded in the traversal map without generating new statements.
//!
//! # Example
//!
//! Before:
//! ```text
//! bb0:
//!     _2 = input()
//!     _3 = eq(_1.0.1, _2)
//!     _4 = eq(_1.0.1, _1.2)
//!     return and(_3, _4)
//! ```
//!
//! After:
//! ```text
//! bb0:
//!     _2 = input()
//!     _5 = _1.0.1
//!     _3 = eq(_5, _2)
//!     _6 = _1.2
//!     _4 = eq(_5, _6)
//!     return and(_3, _4)
//! ```
//!
//! The [`Traversals`] map records `_5 → _1.0.1` and `_6 → _1.2` for the graph executor to use.

use core::{alloc::Allocator, convert::Infallible};

use hashql_core::{heap::Heap, id::Id as _, span::SpanId};

use crate::{
    body::{
        Body, Source,
        basic_block::{BasicBlock, BasicBlockId},
        local::{Local, LocalDecl, LocalVec},
        location::Location,
        operand::Operand,
        place::Place,
        rvalue::RValue,
        statement::{Assign, Statement, StatementKind},
        terminator::Terminator,
    },
    context::MirContext,
    pass::{Changed, TransformPass},
    visit::{self, VisitorMut, r#mut::filter},
};

/// Maps extracted locals back to their original projection paths.
///
/// This is the output of [`TraversalExtraction`], allowing consumers (such as the graph executor)
/// to determine which property paths were accessed on the source local.
pub struct Traversals<'heap> {
    source: Local,
    derivations: LocalVec<Option<Place<'heap>>, &'heap Heap>,
}

impl<'heap> Traversals<'heap> {
    fn with_capacity_in(source: Local, capacity: usize, heap: &'heap Heap) -> Self {
        Self {
            source,
            derivations: LocalVec::with_capacity_in(capacity, heap),
        }
    }

    fn insert(&mut self, local: Local, place: Place<'heap>) {
        debug_assert_eq!(place.local, self.source);

        self.derivations.insert(local, place);
    }

    /// Returns the original projection path for `local`, if it was extracted from the source.
    #[must_use]
    #[inline]
    pub fn lookup(&self, local: Local) -> Option<&Place<'heap>> {
        self.derivations.lookup(local)
    }
}

/// Visitor that extracts projections from a target local into separate bindings.
struct TraversalExtractionVisitor<'heap, A: Allocator> {
    /// The local we're extracting projections from (the vertex).
    target: Local,
    /// Declaration of the target local, used to derive types for extracted locals.
    target_decl: LocalDecl<'heap>,

    /// Span of the current statement/terminator being visited.
    current_span: SpanId,

    /// Bound of existing locals before extraction (new locals start from here).
    total_locals: Local,

    /// New local declarations to append to the body after visiting.
    pending_locals: Vec<LocalDecl<'heap>, A>,
    /// Index into `pending_locals` marking the start of the current basic block's locals.
    /// Used to scope deduplication to the current block.
    pending_locals_offset: usize,
    /// New load statements to insert before the current statement.
    pending_statements: Vec<Statement<'heap>, A>,

    /// Accumulated traversal mappings.
    traversals: Traversals<'heap>,
    changed: Changed,
}

impl<'heap, A: Allocator> VisitorMut<'heap> for TraversalExtractionVisitor<'heap, A> {
    type Filter = filter::Deep;
    type Residual = Result<Infallible, !>;
    type Result<T>
        = Result<T, !>
    where
        T: 'heap;

    fn visit_operand(&mut self, _: Location, operand: &mut Operand<'heap>) -> Self::Result<()> {
        let Some(place) = operand.as_place() else {
            return Ok(());
        };

        if place.local != self.target {
            return Ok(());
        }

        let r#type = place.type_id_unchecked(&self.target_decl);

        // Check if we already extracted this projection in the current basic block.
        let new_local = if let Some(offset) =
            (self.pending_locals_offset..self.pending_locals.len()).find(|&index| {
                self.traversals
                    .lookup(self.total_locals.plus(self.pending_locals_offset + index))
                    .is_some_and(|pending| pending.projections == place.projections)
            }) {
            self.total_locals.plus(offset)
        } else {
            let new_local = self.total_locals.plus(self.pending_locals.len());
            self.traversals.insert(new_local, *place);

            self.pending_locals.push(LocalDecl {
                span: self.target_decl.span,
                r#type,
                name: None,
            });
            self.pending_statements.push(Statement {
                span: self.current_span,
                kind: StatementKind::Assign(Assign {
                    lhs: Place::local(new_local),
                    rhs: RValue::Load(Operand::Place(*place)),
                }),
            });

            new_local
        };

        *operand = Operand::Place(Place::local(new_local));

        Ok(())
    }

    fn visit_rvalue(&mut self, location: Location, rvalue: &mut RValue<'heap>) -> Self::Result<()> {
        // Skip loads — they're recorded by `visit_statement_assign` to avoid double-processing.
        if matches!(rvalue, RValue::Load(_)) {
            return Ok(());
        }

        visit::r#mut::walk_rvalue(self, location, rvalue)
    }

    fn visit_statement_assign(
        &mut self,
        location: Location,
        assign: &mut Assign<'heap>,
    ) -> Self::Result<()> {
        Ok(()) = visit::r#mut::walk_statement_assign(self, location, assign);

        let Assign { lhs, rhs } = assign;

        if !lhs.projections.is_empty() {
            return Ok(());
        }

        let RValue::Load(Operand::Place(rhs)) = rhs else {
            return Ok(());
        };

        if rhs.local != self.target {
            return Ok(());
        }

        // Record pre-existing load as a traversal (e.g., `_2 = _1.0.1` already in the MIR).
        self.traversals.insert(lhs.local, *rhs);

        Ok(())
    }

    fn visit_statement(
        &mut self,
        location: Location,
        statement: &mut Statement<'heap>,
    ) -> Self::Result<()> {
        self.current_span = statement.span;

        visit::r#mut::walk_statement(self, location, statement)
    }

    fn visit_terminator(
        &mut self,
        location: Location,
        terminator: &mut Terminator<'heap>,
    ) -> Self::Result<()> {
        self.current_span = terminator.span;
        visit::r#mut::walk_terminator(self, location, terminator)
    }

    fn visit_basic_block(
        &mut self,
        id: BasicBlockId,
        BasicBlock {
            params,
            statements,
            terminator,
        }: &mut BasicBlock<'heap>,
    ) -> Self::Result<()> {
        let mut location = Location {
            block: id,
            statement_index: 0,
        };

        self.pending_locals_offset = self.pending_locals.len();

        self.visit_basic_block_params(location, params)?;

        location.statement_index += 1;

        // statement_index is 1-indexed (0 is block params).
        while location.statement_index <= statements.len() {
            let index = location.statement_index - 1;

            let statement = &mut statements[index];
            Ok(()) = self.visit_statement(location, statement);

            location.statement_index += 1;
            if self.pending_statements.is_empty() {
                continue;
            }

            // Skip over the statements we're about to insert — they're already recorded.
            location.statement_index += self.pending_statements.len();

            statements.splice(index..index, self.pending_statements.drain(..));
            self.changed = Changed::Yes;
        }

        self.visit_terminator(location, terminator)?;

        // Insert any remaining statements from terminator operands at the block end.
        #[expect(clippy::extend_with_drain, reason = "differing allocator")]
        if !self.pending_statements.is_empty() {
            statements.extend(self.pending_statements.drain(..));
            self.changed = Changed::Yes;
        }

        Ok(())
    }
}

/// Extracts projections from the vertex local in graph read filter bodies.
///
/// This pass only runs on [`Source::GraphReadFilter`] bodies. After running, call
/// [`take_traversals`](Self::take_traversals) to retrieve the mapping of extracted locals to
/// their original projection paths.
pub struct TraversalExtraction<'heap, A: Allocator> {
    alloc: A,
    traversals: Option<Traversals<'heap>>,
}

impl<'heap, A: Allocator> TraversalExtraction<'heap, A> {
    /// Creates a new pass using `alloc` for temporary allocations.
    pub const fn new_in(alloc: A) -> Self {
        Self {
            alloc,
            traversals: None,
        }
    }

    /// Takes the traversal map from the last pass run.
    ///
    /// Returns [`None`] if the pass hasn't run or if the body wasn't a graph read filter.
    pub const fn take_traversals(&mut self) -> Option<Traversals<'heap>> {
        self.traversals.take()
    }
}

impl<'env, 'heap, A: Allocator> TransformPass<'env, 'heap> for TraversalExtraction<'heap, A> {
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) -> Changed {
        if !matches!(body.source, Source::GraphReadFilter(_)) {
            self.traversals = None;
            return Changed::No;
        }

        debug_assert_eq!(body.args, 2);
        let vertex = Local::new(1);

        let mut visitor = TraversalExtractionVisitor {
            target: vertex,
            target_decl: body.local_decls[vertex],
            current_span: SpanId::SYNTHETIC,
            total_locals: body.local_decls.bound(),
            pending_locals_offset: 0,
            pending_locals: Vec::new_in(&self.alloc),
            pending_statements: Vec::new_in(&self.alloc),
            traversals: Traversals::with_capacity_in(vertex, body.local_decls.len(), context.heap),
            changed: Changed::No,
        };
        Ok(()) = visitor.visit_body_preserving_cfg(body);

        body.local_decls.extend(visitor.pending_locals);

        self.traversals = Some(visitor.traversals);
        visitor.changed
    }
}
