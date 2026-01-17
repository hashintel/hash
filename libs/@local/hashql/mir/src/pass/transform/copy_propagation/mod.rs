//! Copy and constant propagation transformation pass.
//!
//! This pass propagates constant values through the MIR by tracking which locals hold known
//! constants and substituting uses of those locals with the constant values directly.
//!
//! Unlike [`ForwardSubstitution`], this pass does not perform full data dependency analysis and
//! cannot resolve values through projections or chained access paths. It is faster but less
//! comprehensive, making it suitable for quick constant folding in simpler cases.
//!
//! # Algorithm
//!
//! The pass operates in a single forward traversal (reverse postorder):
//!
//! 1. For each block, propagates constants through block parameters when all predecessors pass the
//!    same constant value
//! 2. For each assignment `_x = <operand>`, if the operand is a constant or a local known to hold a
//!    constant, records that `_x` holds that constant
//! 3. For each use of a local known to hold a constant, substitutes the use with the constant
//!
//! # Limitations
//!
//! - Does not handle projections: `_2 = (_1,); use(_2.0)` is not simplified
//! - Does not perform fix-point iteration for loops
//! - Only tracks constants, not arbitrary value equivalences
//!
//! For more comprehensive value propagation including projections, see [`ForwardSubstitution`].
//!
//! [`ForwardSubstitution`]: super::ForwardSubstitution

#[cfg(test)]
mod tests;

use core::{alloc::Allocator, convert::Infallible};

use hashql_core::{
    graph::Predecessors as _,
    heap::{BumpAllocator, ResetAllocator, Scratch, TransferInto as _},
    id::IdVec,
};

use crate::{
    body::{
        Body,
        basic_block::BasicBlockId,
        constant::Constant,
        local::{Local, LocalVec},
        location::Location,
        operand::Operand,
        rvalue::RValue,
        statement::Assign,
    },
    context::MirContext,
    intern::Interner,
    pass::{Changed, TransformPass},
    visit::{self, VisitorMut, r#mut::filter},
};

/// Propagates constant values through block parameters by analyzing predecessor branches.
///
/// For each block parameter, examines all predecessor branches that target this block.
/// If all predecessors pass the same constant value (as determined by `eval`), that value
/// is passed to `insert` for the corresponding block parameter.
///
/// # Type Parameters
///
/// - `T`: The constant value type being propagated (e.g., `Constant<'heap>`, `Int`).
/// - `A`: The allocator for the scratch buffer.
///
/// # Parameters
///
/// - `args`: Scratch buffer for collecting argument values. Must be empty on entry; will be drained
///   before return.
/// - `body`: The MIR body containing the CFG.
/// - `id`: The basic block whose parameters are being analyzed.
/// - `eval`: Closure that evaluates an operand to `Some(T)` if it represents a known constant, or
///   `None` otherwise. This is called for each argument in predecessor branch targets.
/// - `insert`: Closure called for each block parameter that has a consistent constant value across
///   all predecessors. Receives the parameter's local and the constant value.
///
/// # Algorithm
///
/// 1. Skips blocks with effectful predecessors (e.g., `GraphRead`), as their arguments are implicit
///    and not inspectable.
/// 2. Collects all explicit branch targets from predecessors that jump to this block.
/// 3. For each parameter position, computes the "meet" of all argument values: if all predecessors
///    pass the same constant, that constant is propagated; otherwise, no constant is recorded.
///
/// # Limitations
///
/// - Does not perform fix-point iteration for loops. Constants on back-edges may not be discovered
///   because predecessors forming back-edges have not been visited when the loop header is
///   processed.
/// - Blocks reachable only via implicit edges (entry blocks, effectful continuations) have no
///   explicit targets to analyze.
#[expect(
    clippy::iter_on_single_items,
    clippy::iter_on_empty_collections,
    reason = "impl return type"
)]
pub(crate) fn propagate_block_params<'args, 'heap: 'args, T, A, E>(
    args: &'args mut Vec<Option<T>, A>,
    body: &Body<'heap>,
    id: BasicBlockId,
    mut eval: E,
) -> impl IntoIterator<Item = (Local, T)> + 'args
where
    T: Copy + Eq,
    A: Allocator,
    E: FnMut(Operand<'heap>) -> Option<T>,
{
    let pred = body.basic_blocks.predecessors(id);

    // Effectful terminators (like GraphRead) pass arguments implicitly, where they set the
    // block param directly. We cannot inspect those values, so we conservatively skip
    // propagation for blocks reachable from effectful predecessors (they have single
    // successors).
    if pred
        .clone()
        .any(|pred| body.basic_blocks[pred].terminator.kind.is_effectful())
    {
        return None.into_iter().flatten();
    }

    // Collect all predecessor targets that branch to this block. A single predecessor
    // may have multiple targets to us (e.g., a switch with two arms to the same block).
    let mut targets = pred
        .flat_map(|pred| body.basic_blocks[pred].terminator.kind.successor_targets())
        .filter(|&target| target.block == id);

    let Some(first) = targets.next() else {
        // No explicit targets means this block is only reachable via implicit edges
        // (e.g., entry block or effectful continuations). Nothing to propagate.
        return None.into_iter().flatten();
    };

    // Seed with the first target's argument values. Each position holds `Some(T)` if
    // that argument evaluated to a constant, `None` otherwise.
    args.extend(first.args.iter().map(|&arg| eval(arg)));

    // Check remaining targets for consensus. If any target passes a different value
    // (or non-constant) for a parameter position, clear that position to `None`.
    for target in targets {
        debug_assert_eq!(args.len(), target.args.len());

        for (lhs, &rhs) in args.iter_mut().zip(target.args.iter()) {
            let rhs = eval(rhs);
            if *lhs != rhs {
                *lhs = None;
            }
        }
    }

    // Record constants for block parameters where all predecessors agreed.

    let params = body.basic_blocks[id].params;

    Some(
        params
            .0
            .iter()
            .zip(args.drain(..))
            .filter_map(|(&local, constant)| constant.map(|constant| (local, constant))),
    )
    .into_iter()
    .flatten()
}

pub struct CopyPropagation<A: BumpAllocator = Scratch> {
    alloc: A,
}

impl CopyPropagation {
    #[must_use]
    pub fn new() -> Self {
        Self {
            alloc: Scratch::new(),
        }
    }
}

impl Default for CopyPropagation {
    fn default() -> Self {
        Self::new()
    }
}

impl<A: BumpAllocator> CopyPropagation<A> {
    pub const fn new_in(alloc: A) -> Self {
        Self { alloc }
    }
}

impl<'env, 'heap, A: ResetAllocator> TransformPass<'env, 'heap> for CopyPropagation<A> {
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) -> Changed {
        self.alloc.reset();

        let mut visitor = CopyPropagationVisitor {
            interner: context.interner,
            constants: IdVec::with_capacity_in(body.local_decls.len(), &self.alloc),
            changed: false,
        };

        let reverse_postorder = body
            .basic_blocks
            .reverse_postorder()
            .transfer_into(&self.alloc);

        let mut args = Vec::new_in(&self.alloc);

        for &mut id in reverse_postorder {
            for (local, constant) in
                propagate_block_params(&mut args, body, id, |operand| visitor.try_eval(operand))
            {
                visitor.constants.insert(local, constant);
            }

            Ok(()) =
                visitor.visit_basic_block(id, &mut body.basic_blocks.as_mut_preserving_cfg()[id]);
        }

        visitor.changed.into()
    }
}

struct CopyPropagationVisitor<'env, 'heap, A: Allocator> {
    interner: &'env Interner<'heap>,
    constants: LocalVec<Option<Constant<'heap>>, A>,
    changed: bool,
}

impl<'heap, A: Allocator> CopyPropagationVisitor<'_, 'heap, A> {
    /// Attempts to evaluate an operand to a known constant or classify it for simplification.
    ///
    /// Returns `Int` if the operand is a constant integer or a local known to hold one,
    /// `Place` if it's a non-constant place, or `Other` for operands that can't be simplified.
    fn try_eval(&self, operand: Operand<'heap>) -> Option<Constant<'heap>> {
        if let Operand::Constant(constant) = operand {
            return Some(constant);
        }

        if let Operand::Place(place) = operand
            && place.projections.is_empty()
            && let Some(&constant) = self.constants.lookup(place.local)
        {
            return Some(constant);
        }

        None
    }
}

impl<'heap, A: Allocator> VisitorMut<'heap> for CopyPropagationVisitor<'_, 'heap, A> {
    type Filter = filter::Deep;
    type Residual = Result<Infallible, !>;
    type Result<T>
        = Result<T, !>
    where
        T: 'heap;

    fn interner(&self) -> &Interner<'heap> {
        self.interner
    }

    fn visit_operand(&mut self, _: Location, operand: &mut Operand<'heap>) -> Self::Result<()> {
        if let Operand::Place(place) = operand
            && place.projections.is_empty()
            && let Some(&constant) = self.constants.lookup(place.local)
        {
            *operand = Operand::Constant(constant);
            self.changed = true;
        }

        Ok(())
    }

    fn visit_statement_assign(
        &mut self,
        location: Location,
        assign: &mut Assign<'heap>,
    ) -> Self::Result<()> {
        Ok(()) = visit::r#mut::walk_statement_assign(self, location, assign);
        let Assign { lhs, rhs } = assign;

        if !lhs.projections.is_empty() {
            // We're not interested in assignments with projections, as that is out of scope for
            // copy propagation.
            return Ok(());
        }

        let RValue::Load(load) = rhs else {
            // copy propagation is only applicable to load values
            return Ok(());
        };

        match load {
            Operand::Place(place) if place.projections.is_empty() => {
                if let Some(&constant) = self.constants.lookup(place.local) {
                    self.constants.insert(lhs.local, constant);
                }
            }
            Operand::Place(_) => {}
            &mut Operand::Constant(constant) => {
                self.constants.insert(lhs.local, constant);
            }
        }

        Ok(())
    }
}
