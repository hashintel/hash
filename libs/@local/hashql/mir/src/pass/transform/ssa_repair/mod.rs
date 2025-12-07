//! SSA repair pass for restoring SSA form after transformations.
//!
//! This module implements an SSA reconstruction algorithm that repairs SSA violations introduced
//! by optimization passes. When a transformation creates multiple definitions for the same local
//! variable, this pass restores proper SSA form by:
//!
//! 1. Detecting locals with multiple definition sites
//! 2. Computing the iterated dominance frontier for those definitions
//! 3. Inserting block parameters (φ-functions) at join points
//! 4. Renaming definitions and uses to maintain SSA invariants
//!
//! # Algorithm
//!
//! The implementation follows the reconstruction algorithm described in:
//!
//! > Rastello, F., & Bouchez Tichadou, F. (Eds.). (2022). *SSA-based Compiler Design*.
//! > Springer <https://doi.org/10.1007/978-3-030-80515-9>.
//! >
//! > Chapter 5: SSA Reconstruction, Section 5.2: Reconstruction Based on the Dominance Frontier.
//!
//! The key insight is that rather than computing minimal SSA form from scratch, we can
//! incrementally repair violations by focusing only on the affected variables and their
//! dominance frontiers. This is more efficient when only a small number of variables
//! violate SSA form.
//!
//! See [`SsaRepair`] for the public entry point.

#[cfg(test)]
mod tests;

use core::{
    convert::Infallible,
    ops::{ControlFlow, Index},
};

use hashql_core::{
    collections::{InlineVec, TinyVec},
    graph::{
        Predecessors as _,
        algorithms::{IteratedDominanceFrontier, dominance_frontiers, iterated_dominance_frontier},
    },
    heap::Heap,
    intern::Interned,
};

use crate::{
    body::{
        Body,
        basic_block::{BasicBlock, BasicBlockId, BasicBlockSlice, BasicBlockVec},
        basic_blocks::BasicBlocks,
        local::{Local, LocalDecl, LocalVec},
        location::Location,
        operand::Operand,
        place::{DefUse, Place, PlaceContext, PlaceWriteContext},
        statement::{Assign, Statement},
        terminator::Target,
    },
    context::MirContext,
    intern::Interner,
    pass::TransformPass,
    visit::{self, Visitor, VisitorMut, r#mut::filter},
};

type LocationVec = InlineVec<Location, 1>;
const _: () = {
    assert!(size_of::<Vec<Location>>() == size_of::<LocationVec>());
};

/// Collects all definition sites for each local variable in the body.
///
/// This visitor walks the MIR body and records the location of every definition. After visiting,
/// use [`iter_violations`] to find locals with multiple definitions that violate SSA form.
///
/// [`iter_violations`]: DefSites::iter_violations
struct DefSites {
    // The majority of cases will only have a single def site, in that case we don't need to
    // allocate a vector.
    sites: LocalVec<LocationVec>,
}

impl Index<Local> for DefSites {
    type Output = [Location];

    fn index(&self, index: Local) -> &Self::Output {
        &self.sites[index]
    }
}

impl DefSites {
    fn new(body: &Body<'_>) -> Self {
        Self {
            sites: LocalVec::from_elem(InlineVec::new(), body.local_decls.len()),
        }
    }

    /// Returns an iterator over locals that have more than one definition site.
    ///
    /// Each yielded item contains the local and all locations where it is defined.
    fn iter_violations(&self) -> impl Iterator<Item = (Local, &[Location])> {
        self.sites
            .iter_enumerated()
            .filter(|&(_, sites)| sites.len() > 1)
            .map(|(local, sites)| (local, sites.as_slice()))
    }
}

impl Visitor<'_> for DefSites {
    type Result = Result<(), !>;

    fn visit_local(
        &mut self,
        location: Location,
        context: PlaceContext,
        local: Local,
    ) -> Self::Result {
        let Some(def_use) = context.into_def_use() else {
            return Ok(());
        };

        if def_use == DefUse::Def {
            self.sites[local].push(location);
        }

        Ok(())
    }
}

/// MIR pass that repairs SSA violations by renaming and inserting block parameters.
///
/// This pass should be run after any transformation that may introduce multiple
/// definitions for the same local variable. It restores proper SSA form by:
///
/// - Creating fresh locals for each additional definition
/// - Inserting block parameters at dominance frontier join points
/// - Rewiring all uses to reference the correct reaching definition
///
/// The pass is idempotent: running it on already-valid SSA form is a no-op.
pub struct SsaRepair;

impl<'env, 'heap> TransformPass<'env, 'heap> for SsaRepair {
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) {
        let mut sites = DefSites::new(body);
        sites.visit_body(body);

        let frontiers = dominance_frontiers(
            &body.basic_blocks,
            BasicBlockId::START,
            body.basic_blocks.dominators(),
        );

        let mut prev_repair: Option<SsaViolationRepair<'_, '_, '_, 'heap>> = None;
        for (violation, locations) in sites.iter_violations() {
            let iterated = iterated_dominance_frontier(
                &body.basic_blocks,
                &frontiers,
                locations.iter().map(
                    |Location {
                         block,
                         statement_index: _,
                     }| *block,
                ),
            );

            let mut repair = if let Some(mut prev) = prev_repair.take() {
                // TODO: due to its iterative nature, we may be able to ditch the use of `reuse`
                // once the allocator API is available in `SmallVec`, as it would enable us to make
                // the bitsets allocator aware.
                prev.reuse(violation, locations, iterated);
                prev
            } else {
                SsaViolationRepair::new(violation, locations, iterated, context)
            };

            repair.run(body);

            prev_repair = Some(repair);
        }
    }
}

/// Describes how a block obtains the reaching definition for a local at its entry.
///
/// When processing a block that uses a local before defining it, we need to determine
/// where the value comes from. This enum captures the two possibilities:
///
/// - `Idom`: The value is inherited from the immediate dominator (no φ-function needed)
/// - `Param`: The block is in the iterated dominance frontier and receives the value as a block
///   parameter (φ-function)
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum FindDefFromTop {
    /// The reaching definition comes from the immediate dominator.
    Idom(Local),
    /// A new block parameter was inserted to merge reaching definitions from predecessors.
    Param(Local),
    /// The reaching definition is already present in the block parameter.
    Existing(Local),
}

impl FindDefFromTop {
    /// Extracts the local from either variant.
    const fn into_local(self) -> Local {
        let (Self::Idom(local) | Self::Param(local) | Self::Existing(local)) = self;

        local
    }
}

/// Performs SSA repair for a single local variable with multiple definitions.
///
/// This struct holds the state needed to rename definitions, compute reaching definitions,
/// and insert block parameters. It can be reused across multiple violated locals via
/// [`Self::reuse`] to avoid repeated allocations.
struct SsaViolationRepair<'ctx, 'mir, 'env, 'heap> {
    /// The original local being repaired.
    local: Local,

    /// All definition sites for this local.
    locations: &'ctx [Location],
    /// Fresh locals created for each definition site (indexed parallel to `locations`).
    locals: TinyVec<Local>,

    /// Maps each block to the local that is "live out" (the last definition in that block).
    block_defs: BasicBlockVec<Option<Local>>,
    /// Maps each block to how it obtains the reaching definition at entry.
    block_top: BasicBlockVec<Option<FindDefFromTop>>,

    /// The iterated dominance frontier for the definition sites.
    iterated: IteratedDominanceFrontier<BasicBlockId>,

    context: &'mir mut MirContext<'env, 'heap>,
}

impl<'ctx, 'mir, 'env, 'heap> SsaViolationRepair<'ctx, 'mir, 'env, 'heap> {
    const fn new(
        local: Local,
        locations: &'ctx [Location],

        iterated: IteratedDominanceFrontier<BasicBlockId>,

        context: &'mir mut MirContext<'env, 'heap>,
    ) -> Self {
        Self {
            local,
            locations,
            locals: TinyVec::new(),
            block_defs: BasicBlockVec::new(),
            block_top: BasicBlockVec::new(),
            iterated,
            context,
        }
    }

    /// Resets this repair state for a new local, reusing allocated buffers.
    fn reuse(
        &mut self,
        local: Local,
        locations: &'ctx [Location],
        iterated: IteratedDominanceFrontier<BasicBlockId>,
    ) {
        let Self {
            local: this_local,
            locations: this_locations,
            locals,
            block_defs,
            block_top,
            iterated: this_iterated,
            context: _,
        } = self;

        *this_local = local;
        *this_locations = locations;
        *this_iterated = iterated;

        locals.clear();
        block_defs.clear();
        block_top.clear();
    }

    /// Executes the full repair: rename, compute reaching definitions, and apply rewrites.
    fn run(&mut self, body: &mut Body<'heap>) {
        self.rename(body);
        self.precompute_find_def(body);
        self.apply(body);
    }

    /// Creates fresh locals for each definition site except the last.
    ///
    /// The last definition reuses the original local name to minimize pollution of the
    /// local declarations.
    fn rename(&mut self, body: &mut Body<'heap>) {
        let local_decl = body.local_decls[self.local];

        // We know we have more than 1 element, but usually when repairing SSA we have less than 4
        // definition sites.

        for _ in 0..(self.locations.len() - 1) {
            let name = body.local_decls.push(local_decl);
            self.locals.push(name);
        }

        // The last def is handled separately, to not pollute the local declarations we re-use the
        // name of the current def, this is safe because after the SSA change no other def will
        // reference the same variable by construction.
        self.locals.push(self.local);
    }

    /// Computes the reaching definition for a block, recursively processing predecessors.
    ///
    /// This prepares and implements both the `FindDefFromTop` and `FindDefFromBottom` algorithm
    /// outlined in 5.1 of the book. Crucially, we do this pre-computation only where the result of
    /// either would be required.
    ///
    /// For blocks which have a use before def, this means the computation of the `FindDefFromTop`
    /// value. If there is any use, then the value for `FindDefFromBottom` is computed.
    ///
    /// Populates `block_defs` (the "live out" local for each block) and `block_top` (how each
    /// block obtains its entry value — if required).
    fn determine_block_def(
        &mut self,
        basic_blocks: &BasicBlocks<'heap>,
        local_decls: &mut LocalVec<LocalDecl<'heap>, &'heap Heap>,
        id: BasicBlockId,
    ) -> Local {
        if let Some(&def) = self.block_defs.lookup(id) {
            // We've already processed this block, no need to do it again.
            return def;
        }

        // The "def" of a block is either:
        // 1. (easy) the last local of a statement index
        // 2. (hard) a consolidation of the parent

        // This is equivalent to `FindDefFromBottom`, the def of this block will be the last def of
        // this specific block.
        if let Some(last_def) = self.locations.iter().rposition(
            |&Location {
                 block,
                 statement_index: _,
             }| block == id,
        ) {
            self.block_defs.insert(id, self.locals[last_def]);

            // This emulates `FindDefFromTop`, we check: is there any use before a def, that would
            // need the result of `FindDefFromTop`? If that is not the case we can short circuit,
            // otherwise we need to continue with recursion to resolve every use in the second
            // iteration.
            if !UseBeforeDef::run(self.local, self.locations, id, &basic_blocks[id]) {
                // There are no uses before the first def, so we can safely terminate early
                return self.locals[last_def];
            }
        }

        // This means that there is (a) either at least one use that requires a new def, or (b)
        // there is this block is in a chain where a successor block requires our result.

        // If the block is part of the DF+ we must create an "intersection", meaning a new block
        // def to unify each calling site.
        // The calling sites are then wired up in the next step.
        if self.iterated.contains(id) {
            // Check if we already have a local declaration for the block param
            let local = if let Some(index) = self.locations.iter().position(
                |&Location {
                     block,
                     statement_index,
                 }| block == id && statement_index == 0,
            ) {
                let local = self.locals[index];
                self.block_top.insert(id, FindDefFromTop::Existing(local));
                local
            } else {
                // We must create a new local declaration for the block param.
                let local_decl = local_decls[self.local];
                let local = local_decls.push(local_decl);

                // If we're part of the DF+ then we will have a new local declaration for the block
                // param.
                self.block_top.insert(id, FindDefFromTop::Param(local));
                local
            };

            // It's important that we set the block def *before* we recurse, otherwise a loop will
            // create an infinite recursion case. The live-out (aka the block def) is always the
            // last applicable use, in case there is already a use (per previous statement) we keep
            // that determined local, otherwise we use the local we've just determined
            // for the head. This will only be the case if there are no defs, and this
            // block is "passthrough".
            let output = *self.block_defs.get_or_insert_with(id, || local);

            // Important: even though we don't use the result, we must compute the resulting value
            // from the parents. This is needed in the next step, which will need to rewire the
            // different `Target`s to add the new param. For that to work we must populate the
            // `block_defs` for it.
            for parent in basic_blocks.predecessors(id) {
                self.determine_block_def(basic_blocks, local_decls, parent);
            }

            output
        } else {
            // The simple case. If it is not part of the DF+, we simply take the name of the local
            // of the immediate dominator, because we assume that the CFG is well formed
            // we know that there will always be an immediate dominator.
            let Some(idom) = basic_blocks.dominators().immediate_dominator(id) else {
                unreachable!(
                    "block {id} has a use of {local} but no immediate dominator; this suggests \
                     either the entry block has a use without a definition, or the dominator tree \
                     is malformed",
                    local = self.local
                )
            };

            let output = self.determine_block_def(basic_blocks, local_decls, idom);

            self.block_top.insert(id, FindDefFromTop::Idom(output));

            // The live-out (aka the block def) is always the last applicable use, in case there is
            // already a use (per previous statement) we keep that determined local,
            // otherwise we use the local we've just determined for the head. This
            // will only be the case if there are no defs, and this block is "passthrough".
            *self.block_defs.get_or_insert_with(id, || output)
        }
    }

    /// Identifies all blocks that need reaching definition information and computes it.
    ///
    /// Iterates over all blocks, and for any block with a use-before-def of the target local,
    /// triggers [`Self::determine_block_def`] to compute how that block obtains its value.
    fn precompute_find_def(&mut self, body: &mut Body<'heap>) {
        for (id, block) in body.basic_blocks.iter_enumerated() {
            // Our starting point are any blocks which have uses before any definitions.
            // In case there isn't a definition before a def, we must use the equivalent to the
            // `FindFromTop` routine to find the type (and prepare the information exchange).
            if UseBeforeDef::run(self.local, self.locations, id, block) {
                self.determine_block_def(&body.basic_blocks, &mut body.local_decls, id);
            }
        }
    }

    /// Applies the computed renaming and block parameter insertions to the body.
    ///
    /// Uses [`RewireBody`] to walk the MIR and rewrite all definitions and uses of the
    /// target local according to the precomputed `block_defs` and `block_top` information.
    fn apply(&self, body: &mut Body<'heap>) {
        let mut visitor = RewireBody {
            local: self.local,
            interner: self.context.interner,
            locations: self.locations,
            locals: &self.locals,
            block_defs: &self.block_defs,
            block_top: &self.block_top,
            last_def: None,
        };

        // We do not modify the CFG here, we only add new targets
        Ok(()) = visitor.visit_body_preserving_cfg(body);
    }
}

/// Visitor that rewrites definitions and uses of a local according to precomputed SSA information.
///
/// This visitor performs three transformations during its walk:
///
/// 1. **Block parameters**: For blocks in DF+, adds the new block parameter
/// 2. **Targets**: For branches to DF+ blocks, adds the reaching definition as an argument
/// 3. **Locals**: Rewrites each def to its renamed local, and each use to the current reaching
///    definition
///
/// The `last_def` field tracks the most recent definition seen while walking a block, enabling
/// correct rewiring of uses to their reaching definition.
struct RewireBody<'ctx, 'heap> {
    /// The original local being repaired.
    local: Local,

    interner: &'ctx Interner<'heap>,

    /// All definition sites for this local.
    locations: &'ctx [Location],
    /// Fresh locals created for each definition site (indexed parallel to `locations`).
    locals: &'ctx [Local],

    /// Maps each block to the local that is "live out".
    block_defs: &'ctx BasicBlockSlice<Option<Local>>,
    /// Maps each block to how it obtains the reaching definition at entry.
    block_top: &'ctx BasicBlockSlice<Option<FindDefFromTop>>,

    /// The most recent definition seen while walking the current block.
    last_def: Option<Local>,
}

impl<'heap> VisitorMut<'heap> for RewireBody<'_, 'heap> {
    type Filter = filter::Deep;
    type Residual = Result<Infallible, !>;
    type Result<T>
        = Result<T, !>
    where
        T: 'heap;

    fn interner(&self) -> &Interner<'heap> {
        self.interner
    }

    fn visit_basic_block(
        &mut self,
        id: BasicBlockId,
        block: &mut BasicBlock<'heap>,
    ) -> Self::Result<()> {
        self.last_def = None;

        visit::r#mut::walk_basic_block(self, id, block)
    }

    fn visit_basic_block_params(
        &mut self,
        location: Location,
        params: &mut Interned<'heap, [Local]>,
    ) -> Self::Result<()> {
        // We don't walk the params here, we handle the `Def` site differently in `visit_local`, so
        // don't need to set `self.last_def`.
        let Some(&def) = self.block_top.lookup(location.block) else {
            // No `FindDefFromTop` result is required in the body
            return Ok(());
        };

        // We are part of a DF+ and need to add our param, subsequent visits will use that value to
        // further recurse.
        if let FindDefFromTop::Param(param) = def {
            let mut new_params = TinyVec::from_slice_copy(params);
            new_params.push(param);

            *params = self.interner.locals.intern_slice(&new_params);
        }

        // `basic_block_params` will be run *before* `visit_target` or `visit_local`, therefore we
        // set the `last_def` for any `FindDefFromTop` result now.
        self.last_def = Some(def.into_local());
        Ok(())
    }

    fn visit_target(&mut self, location: Location, target: &mut Target<'heap>) -> Self::Result<()> {
        visit::r#mut::walk_target(self, location, target)?;

        // Check if the successor target block has a new param, if so we take our block def as value
        // and assign it.
        if !matches!(
            self.block_top.lookup(target.block),
            Some(FindDefFromTop::Param(_))
        ) {
            return Ok(());
        }

        // Add the operator to the block
        let &current_local = self.block_defs.lookup(location.block).unwrap_or_else(|| {
            unreachable!(
                "block {} branches to {} which expects a block param for {}, but no block_def was \
                 computed for the source block; this indicates a bug in `determine_block_def`",
                location.block, target.block, self.local
            )
        });

        // Sanity check to ensure that our previous analysis step isn't divergent
        debug_assert_eq!(Some(current_local), self.last_def);
        let operand = Operand::Place(Place::local(current_local, self.interner));

        let mut args = TinyVec::from_slice_copy(&target.args);
        args.push(operand);

        target.args = self.interner.operands.intern_slice(&args);

        Ok(())
    }

    fn visit_statement_assign(
        &mut self,
        location: Location,
        Assign { lhs, rhs }: &mut Assign<'heap>,
    ) -> Self::Result<()> {
        {
            // We must visit the rvalue BEFORE the lvalue, to not pollute the namespace.
            self.visit_rvalue(location, rhs)?;

            self.visit_place(
                location,
                PlaceContext::Write(PlaceWriteContext::Assign),
                lhs,
            )?;

            Ok(())
        }
    }

    fn visit_local(
        &mut self,
        location: Location,
        context: PlaceContext,
        local: &mut Local,
    ) -> Self::Result<()> {
        if self.local != *local {
            return Ok(());
        }

        let Some(def_use) = context.into_def_use() else {
            panic!("liveness analysis must be done after any SSA repair.")
        };

        match def_use {
            DefUse::Def => {
                let Some(index) = self.locations.iter().position(|&loc| loc == location) else {
                    unreachable!(
                        "definition of {} at {:?} was not recorded in locations {:?}; DefSites \
                         visitor may have missed this def",
                        self.local, location, self.locations
                    );
                };

                let rename = self.locals[index];
                *local = rename;

                self.last_def = Some(rename);
            }
            DefUse::Use | DefUse::PartialDef => {
                *local = self.last_def.unwrap_or_else(|| {
                    unreachable!(
                        "use of {} at {:?} has no reaching definition; block_top[{:?}] = {:?}, \
                         expected FindDefFromTop inside of `determine_block_def` to provide a \
                         value",
                        self.local,
                        location,
                        location.block,
                        self.block_top.lookup(location.block)
                    )
                });
            }
        }

        Ok(())
    }
}

/// Detects whether a block has any use of a local before its first definition.
///
/// This is used to determine which blocks need to receive a value from predecessors
/// (via block parameters or dominator inheritance) versus blocks where all uses are
/// covered by a local definition within the same block.
struct UseBeforeDef {
    /// The local being checked.
    local: Local,
    /// The statement index of the first definition in this block (or `usize::MAX` if none).
    def_statement_index: usize,
    /// Set to `true` if a use is found before `def_statement_index`.
    result: bool,
}

impl UseBeforeDef {
    /// Creates a new checker for the given `local` in the specified block.
    ///
    /// Finds the first definition of `local` in `locations` that belongs to block `id`,
    /// which determines the boundary for detecting use-before-def.
    fn new(local: Local, locations: &[Location], id: BasicBlockId) -> Self {
        let first_def_location = locations
            .iter()
            .filter(
                |&&Location {
                     block,
                     statement_index: _,
                 }| block == id,
            )
            .min_by_key(
                |Location {
                     block: _,
                     statement_index,
                 }| statement_index,
            )
            .map_or(
                usize::MAX,
                |&Location {
                     statement_index, ..
                 }| statement_index,
            );

        Self {
            local,
            // if there is no def, then it's just max, that way we can also determine if there's
            // even a single use
            def_statement_index: first_def_location,
            result: false,
        }
    }

    /// Checks whether the given `block` has any use of `local` before its first definition.
    fn run(local: Local, locations: &[Location], id: BasicBlockId, block: &BasicBlock<'_>) -> bool {
        let mut this = Self::new(local, locations, id);

        // We're not interested in the result, it's just used to short circuit
        let _result = this.visit_basic_block(id, block);

        this.result
    }
}

impl<'heap> Visitor<'heap> for UseBeforeDef {
    type Result = ControlFlow<(), ()>;

    #[coverage(off)]
    fn visit_body(&mut self, _: &Body<'heap>) -> Self::Result {
        panic!("do not use the visitor from the body, instead use `visit_basic_block`")
    }

    fn visit_statement(
        &mut self,
        location: Location,
        statement: &Statement<'heap>,
    ) -> Self::Result {
        // Don't need to process a statement that is after the definition as we're not interested in
        // those.
        if location.statement_index >= self.def_statement_index {
            // We break here to short circuit, we don't need to continue to process more statement.
            return ControlFlow::Break(());
        }

        visit::r#ref::walk_statement(self, location, statement)
    }

    fn visit_statement_assign(
        &mut self,
        location: Location,
        Assign { lhs, rhs }: &Assign<'heap>,
    ) -> Self::Result {
        // We must visit the right-hand side first to ensure that all the values are defined before
        // we use them.
        self.visit_rvalue(location, rhs)?;

        self.visit_place(
            location,
            PlaceContext::Write(PlaceWriteContext::Assign),
            lhs,
        )?;

        ControlFlow::Continue(())
    }

    fn visit_local(&mut self, _: Location, context: PlaceContext, local: Local) -> Self::Result {
        if local != self.local {
            return ControlFlow::Continue(());
        }

        let Some(def_use) = context.into_def_use() else {
            return ControlFlow::Continue(());
        };

        if def_use == DefUse::Def {
            return ControlFlow::Continue(());
        }

        // This is always the case, because we're visiting in order, once it's done we can short
        // circuit
        self.result = true;
        ControlFlow::Break(())
    }
}
