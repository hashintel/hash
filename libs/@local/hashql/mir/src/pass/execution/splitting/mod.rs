//! Splits MIR [`BasicBlock`]s into contiguous regions with uniform target support.
//!
//! When a single block contains statements that different execution targets can handle,
//! this pass partitions it into smaller blocks where each block's statements share the
//! same target affinity. The pass remaps all [`BasicBlockId`]s, inserts [`Goto`] chains
//! to connect split blocks, and returns per-block [`TargetBitSet`] affinities derived
//! from [`StatementCostVec`] data.
//!
//! Use [`BasicBlockSplitting`] to run the pass on a [`Body`].
use alloc::alloc::Global;
use core::{alloc::Allocator, convert::Infallible, mem, num::NonZero};

use hashql_core::{
    id::{Id as _, bit_vec::FiniteBitSet},
    intern::Interned,
    span::SpanId,
};

use super::{
    Cost,
    cost::{StatementCostVec, TerminatorCostVec},
    target::{TargetArray, TargetBitSet, TargetId},
};
use crate::{
    body::{
        Body,
        basic_block::{BasicBlock, BasicBlockId, BasicBlockSlice, BasicBlockVec},
        location::Location,
        terminator::{Goto, Target, Terminator, TerminatorKind},
    },
    context::MirContext,
    visit::{VisitorMut, r#mut::filter},
};

#[cfg(test)]
mod tests;

/// Returns a [`TargetBitSet`] of execution targets that can cover the statement at `index`.
///
/// A target is supported when its [`Cost`] entry is present for that statement.
fn supported_statement(costs: &TargetArray<&[Option<Cost>]>, index: usize) -> TargetBitSet {
    let mut output = FiniteBitSet::new_empty(TargetId::VARIANT_COUNT_U32);

    for (cost_index, cost) in costs.iter_enumerated() {
        output.set(cost_index, cost[index].is_some());
    }

    output
}

fn supported_terminator(
    costs: &TargetArray<TerminatorCostVec<impl Allocator>>,
    block: BasicBlockId,
) -> TargetBitSet {
    let mut output = FiniteBitSet::new_empty(TargetId::VARIANT_COUNT_U32);

    for (cost_index, cost) in costs.iter_enumerated() {
        output.set(cost_index, cost.of(block).is_some());
    }

    output
}

/// Counts contiguous target regions per [`BasicBlock`].
///
/// Returns a `(region_count, has_separate_terminator_region)` pair for each block.
/// An extra region is added when the terminator's target support is not a superset
/// of the last statement region's support (including incomparable sets, not just
/// strict subsets).
#[expect(unsafe_code)]
fn count_regions<A: Allocator, T: Allocator, B: Allocator>(
    body: &Body<'_>,
    statement_costs: &TargetArray<StatementCostVec<A>>,
    terminator_costs: &TargetArray<TerminatorCostVec<T>>,
    alloc: B,
) -> BasicBlockVec<(NonZero<usize>, bool), B> {
    // Start with one region per block and only grow when target support changes.
    let mut regions = BasicBlockVec::from_elem_in(
        // SAFETY: 1 is not 0
        (unsafe { NonZero::new_unchecked(1) }, false),
        body.basic_blocks.len(),
        alloc,
    );

    for (id, block) in body.basic_blocks.iter_enumerated() {
        let costs = statement_costs.each_ref().map(|costs| costs.of(id));

        if block.statements.is_empty() {
            // Zero statements cannot introduce a target boundary.
            continue;
        }

        let mut total = 0;
        let mut current: TargetBitSet = FiniteBitSet::new_empty(TargetId::VARIANT_COUNT_U32);

        for stmt_index in 0..block.statements.len() {
            let next = supported_statement(&costs, stmt_index);

            // Always count the first statement as a region start. This keeps the count non-zero
            // even if cost data is missing or malformed.
            if next != current || stmt_index == 0 {
                total += 1;
                current = next;
            }
        }

        let mut has_separate_terminator_region = false;

        // Check if the terminator narrows the target set of the last statement region.
        // If the terminator supports a strict subset of backends, it needs its own region
        // so that the preceding statements can still be assigned to the wider set.
        let terminator_supported = supported_terminator(terminator_costs, id);
        if !terminator_supported.is_superset(&current) {
            total += 1;
            has_separate_terminator_region = true;
        }

        // SAFETY: The loop always counts the first statement for blocks with 2+ statements, so
        // total cannot be zero here.
        regions[id] = (
            unsafe { NonZero::new_unchecked(total) },
            has_separate_terminator_region,
        );
    }

    regions
}

/// Visitor that rewrites [`BasicBlockId`]s to their post-split positions.
struct RemapBasicBlockId<'ctx> {
    ids: &'ctx BasicBlockSlice<BasicBlockId>,
}

impl<'heap> VisitorMut<'heap> for RemapBasicBlockId<'_> {
    type Filter = filter::Shallow;
    type Residual = Result<Infallible, !>;
    type Result<T>
        = Result<T, !>
    where
        T: 'heap;

    fn visit_basic_block_id(
        &mut self,
        _: Location,
        basic_block_id: &mut BasicBlockId,
    ) -> Self::Result<()> {
        *basic_block_id = self.ids[*basic_block_id];
        Ok(())
    }
}

/// Splits [`BasicBlock`]s in-place and returns per-block [`TargetBitSet`] affinities.
///
/// Remaps all [`BasicBlockId`] references, connects split blocks with [`Goto`] chains,
/// and updates [`StatementCostVec`] to reflect the new layout.
#[expect(clippy::too_many_lines)]
fn offset_basic_blocks<'heap, A: Allocator, S: Allocator + Clone>(
    context: &MirContext<'_, 'heap>,
    body: &mut Body<'heap>,
    regions: &BasicBlockSlice<(NonZero<usize>, bool)>,
    statement_costs: &mut TargetArray<StatementCostVec<impl Allocator + Clone>>,
    terminator_costs: &mut TargetArray<TerminatorCostVec<impl Allocator>>,
    scratch: S,
    alloc: A,
) -> BasicBlockVec<TargetBitSet, A> {
    debug_assert!(
        !body.basic_blocks.is_empty(),
        "MIR body must have at least one basic block"
    );

    // Compute prefix offsets: `indices` maps old block IDs to the first new ID.
    let mut length = BasicBlockId::START;
    let mut indices =
        BasicBlockVec::from_elem_in(BasicBlockId::MIN, body.basic_blocks.len(), scratch);

    for (id, (regions, _)) in regions.iter_enumerated() {
        indices[id] = length;
        length.increment_by(regions.get());
    }

    let mut targets = BasicBlockVec::from_elem_in(
        FiniteBitSet::new_empty(TargetId::VARIANT_COUNT_U32),
        length.as_usize(),
        alloc,
    );

    Ok(()) = RemapBasicBlockId { ids: &indices }.visit_body(body);

    // Extend the basic block list with placeholders we will fill during splitting.
    body.basic_blocks
        .as_mut()
        .fill_until(length.minus(1), || BasicBlock {
            params: Interned::empty(),
            statements: Vec::new_in(context.heap),
            terminator: Terminator::unreachable(SpanId::SYNTHETIC),
        });

    // Move the original blocks into their new slots in reverse to avoid overwriting.
    for (old, &new) in indices.iter_enumerated().rev() {
        body.basic_blocks.as_mut().swap(old, new);
    }

    // Push a sentinel so we can walk each original block's new range as [start, end).
    indices.push(length);

    let mut index = BasicBlockId::START;
    for &[start_id, end_id] in indices.windows() {
        let region = &mut body.basic_blocks.as_mut()[start_id..end_id];
        let (region_len, has_separate_terminator_region) = regions[index];

        debug_assert_eq!(region.len(), region_len.get());

        let costs = statement_costs.each_ref().map(|cost| cost.of(index));

        if region.len() < 2 {
            debug_assert_eq!(region.len(), 1);

            if costs[TargetId::Interpreter].is_empty() {
                // No statements: the block's target affinity comes from its terminator.
                targets[start_id] = supported_terminator(terminator_costs, index);
            } else {
                targets[start_id] = supported_statement(&costs, 0);
            }

            index.increment_by(1);

            // We only have a single block inside the region, so no need to split it.
            continue;
        }

        // Preserve the original terminator on the last block and connect the rest with `Goto`.
        let [first, .., last] = region else {
            unreachable!()
        };
        let terminator_span = first.terminator.span;
        mem::swap(&mut first.terminator, &mut last.terminator);

        // Connect each block to the next one via a `Goto`.
        let [leading @ .., _] = region else {
            unreachable!()
        };

        for (offset, block) in leading.iter_mut().enumerate() {
            let next = start_id.plus(offset + 1);
            block.terminator = Terminator {
                // Reuse the original terminator span for the inserted `Goto` terminators.
                span: terminator_span,
                kind: TerminatorKind::Goto(Goto {
                    target: Target::block(next),
                }),
            }
        }

        // Split statements into the new blocks from the back to avoid repeated moves.
        let [start, rest @ ..] = region else {
            unreachable!()
        };
        let mut rest = rest;

        let mut runs = 0;

        // If the terminator narrows the target set, peel off the last block for it.
        // That block is already empty (placeholder) and already holds the original terminator
        // (from the `mem::swap` above). We just need to record its target affinity and exclude
        // it from the statement-peeling loop.
        if has_separate_terminator_region {
            let [statements @ .., _] = rest else {
                unreachable!()
            };

            rest = statements;

            // Write the target before incrementing `runs`, matching the convention in the
            // statement-peeling loop below. `terminator_costs` is indexed by original (pre-split)
            // block IDs, so we use `index` rather than a post-split ID.
            targets[end_id.minus(runs + 1)] = supported_terminator(terminator_costs, index);
            runs += 1;
        }

        // Peel off runs and move them into recipient blocks counted from the end.
        let mut current = supported_statement(&costs, start.statements.len() - 1);
        let mut ptr = start.statements.len() - 1;

        while let [remaining @ .., recipient] = rest {
            while supported_statement(&costs, ptr) == current {
                ptr -= 1;
            }

            // Record the target affinity for the recipient block counted from the end.
            targets[end_id.minus(runs + 1)] = current;

            // Split off the suffix for this run; the terminator already lives on the last block.
            let statements = start.statements.split_off(ptr + 1);
            debug_assert!(
                !statements.is_empty(),
                "Each run contains at least one statement"
            );

            current = supported_statement(&costs, ptr);

            recipient.statements = statements;
            rest = remaining;
            runs += 1;
        }
        debug_assert_eq!(runs, region_len.get() - 1);

        // The first block holds the remaining run.
        targets[start_id] = current;

        index.increment_by(1);
    }

    for cost in statement_costs.iter_mut() {
        cost.remap(&body.basic_blocks);
    }

    for cost in terminator_costs.iter_mut() {
        cost.remap(regions);
    }

    targets
}

/// Splits MIR [`BasicBlock`]s by execution target support.
///
/// Given per-statement cost data in a [`TargetArray<StatementCostVec>`], this pass
/// partitions blocks so each resulting block's statements can all be handled by the
/// same set of execution targets. The pass inserts [`Goto`] terminators to chain split
/// blocks and returns per-block [`TargetBitSet`] affinities indicating which targets
/// support each block.
pub(crate) struct BasicBlockSplitting<A: Allocator> {
    scratch: A,
}

impl BasicBlockSplitting<Global> {
    /// Creates a new pass using the global allocator.
    #[must_use]
    pub(crate) const fn new() -> Self {
        Self { scratch: Global }
    }
}

impl<S: Allocator> BasicBlockSplitting<S> {
    /// Creates a new pass using the provided allocator.
    pub(crate) const fn new_in(scratch: S) -> Self {
        Self { scratch }
    }

    #[cfg(test)]
    pub(crate) fn split<'heap>(
        &self,
        context: &MirContext<'_, 'heap>,
        body: &mut Body<'heap>,
        statement_costs: &mut TargetArray<StatementCostVec<impl Allocator + Clone>>,
        terminator_costs: &mut TargetArray<TerminatorCostVec<impl Allocator>>,
    ) -> BasicBlockVec<TargetBitSet, Global>
    where
        S: Clone,
    {
        self.split_in(context, body, statement_costs, terminator_costs, Global)
    }

    /// Splits [`Body`] blocks and returns per-block [`TargetBitSet`] affinities.
    ///
    /// Partitions blocks so each resulting block's statements share the same target support,
    /// with an additional split when the terminator narrows the target set. Updates both
    /// `statement_costs` and `terminator_costs` to reflect the new block layout.
    pub(crate) fn split_in<'heap, A: Allocator>(
        &self,
        context: &MirContext<'_, 'heap>,
        body: &mut Body<'heap>,
        statement_costs: &mut TargetArray<StatementCostVec<impl Allocator + Clone>>,
        terminator_costs: &mut TargetArray<TerminatorCostVec<impl Allocator>>,
        alloc: A,
    ) -> BasicBlockVec<TargetBitSet, A>
    where
        S: Clone,
    {
        let regions = count_regions(
            body,
            statement_costs,
            terminator_costs,
            self.scratch.clone(),
        );

        offset_basic_blocks(
            context,
            body,
            &regions,
            statement_costs,
            terminator_costs,
            self.scratch.clone(),
            alloc,
        )
    }
}

impl Default for BasicBlockSplitting<Global> {
    fn default() -> Self {
        Self::new()
    }
}
