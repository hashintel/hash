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
        place::{DefUse, Place, PlaceContext},
        statement::Statement,
        terminator::Target,
    },
    context::MirContext,
    intern::Interner,
    pass::Pass,
    visit::{self, Visitor, VisitorMut, r#mut::filter},
};

type LocationVec = InlineVec<Location, 1>;
const _: () = {
    assert!(size_of::<Vec<Location>>() == size_of::<LocationVec>());
};

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

pub struct SsaRepairPass;

impl SsaRepairPass {
    fn repair<'heap>(context: &mut MirContext<'_, 'heap>, body: &mut Body<'heap>) {
        let mut sites = DefSites::new(body);
        sites.visit_body(body);

        let frontiers = dominance_frontiers(
            &body.basic_blocks,
            BasicBlockId::START,
            body.basic_blocks.dominators(),
        );

        let mut prev_repair: Option<SsaRepair<'_, '_, '_, 'heap>> = None;
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
                prev.reuse(violation, locations, iterated);
                prev
            } else {
                SsaRepair::new(violation, locations, iterated, context)
            };

            repair.run(body);

            prev_repair = Some(repair);
        }
    }
}

impl<'env, 'heap> Pass<'env, 'heap> for SsaRepairPass {
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) {
        Self::repair(context, body);
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum FindDefFromTop {
    Idom(Local),
    Param(Local),
}

impl FindDefFromTop {
    const fn into_local(self) -> Local {
        let (Self::Idom(local) | Self::Param(local)) = self;

        local
    }
}

struct SsaRepair<'ctx, 'mir, 'env, 'heap> {
    local: Local,

    locations: &'ctx [Location],
    locals: TinyVec<Local>,

    block_defs: BasicBlockVec<Option<Local>>,
    block_top: BasicBlockVec<Option<FindDefFromTop>>,

    iterated: IteratedDominanceFrontier<BasicBlockId>,

    context: &'mir mut MirContext<'env, 'heap>,
}

impl<'ctx, 'mir, 'env, 'heap> SsaRepair<'ctx, 'mir, 'env, 'heap> {
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

    fn run(&mut self, body: &mut Body<'heap>) {
        self.rename(body);
        self.precompute_find_def(body);
        self.apply(body);
    }

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
            // We create a new local declaration for the block param.
            let local_decl = local_decls[self.local];
            let local = local_decls.push(local_decl);

            // If we're part of the DF+ then we will have a new local declaration for the block
            // param.
            self.block_top.insert(id, FindDefFromTop::Param(local));

            // It's important that we set the block def *before* we recurse, otherwise a loop will
            // create an infinite recursion case. The output (aka the block def) is always the last
            // applicable use, in case there is already a use (per previous statement) we keep that
            // determined local, otherwise we use the local we've just determined for the head. This
            // will only be the case if there are no defs, and this block is "passthrough".
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
            // The simple case, if it is not part of the DF+ we simply take the name of the local of
            // the immediate dominator, because we assume that the CFG is well formed we know that
            // there will always be an immediate dominator.
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

            // The output (aka the block def) is always the last applicable use, in case there is
            // already a use (per previous statement) we keep that determined local,
            // otherwise we use the local we've just determined for the head. This
            // will only be the case if there are no defs, and this block is "passthrough".
            *self.block_defs.get_or_insert_with(id, || output)
        }
    }

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

struct RewireBody<'ctx, 'heap> {
    local: Local,

    interner: &'ctx Interner<'heap>,

    locations: &'ctx [Location],
    locals: &'ctx [Local],

    block_defs: &'ctx BasicBlockSlice<Option<Local>>,
    block_top: &'ctx BasicBlockSlice<Option<FindDefFromTop>>,

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
            let mut new_params = TinyVec::from_slice(params);
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

        // sanity check to ensure that our previous analysis step isn't divergent
        debug_assert_eq!(Some(current_local), self.last_def);
        let operand = Operand::Place(Place::local(current_local, self.interner));

        let mut args = TinyVec::from_slice(&target.args);
        args.push(operand);

        target.args = self.interner.operands.intern_slice(&args);

        Ok(())
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

struct UseBeforeDef {
    local: Local,
    def_statement_index: usize,
    result: bool,
}

impl UseBeforeDef {
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
