use core::{alloc::Allocator, cell::RefCell};

use hashql_core::{heap::CloneIn as _, id::bit_vec::DenseBitSet, r#type::environment::Environment};
use hashql_hir::node::operation::{InputOp, UnOp};

use super::{
    footprint::{BodyFootprint, BodyFootprintSemilattice, Footprint},
    r#static::StaticSizeEstimationCache,
};
use crate::{
    body::{
        Body,
        basic_block::BasicBlockId,
        local::{Local, LocalDecl, LocalSlice},
        location::Location,
        operand::Operand,
        place::Place,
        rvalue::{Aggregate, Apply, BinOp, Binary, Input, RValue, Unary},
        statement::{Assign, Statement, StatementKind},
    },
    def::{DefId, DefIdSlice},
    pass::analysis::{
        dataflow::{
            framework::{DataflowAnalysis, Direction},
            lattice::{AdditiveMonoid as _, SaturatingSemiring},
        },
        size_estimation::{estimate::Estimate, range::Cardinality, r#static::StaticSizeEstimation},
    },
};

enum Eval {
    Footprint(Footprint),
    Copy(Local),
}

impl Eval {
    fn apply<A: Allocator>(self, target: Local, domain: &mut BodyFootprint<A>) {
        match self {
            Self::Footprint(footprint) => {
                domain.locals[target] = footprint;
            }
            Self::Copy(local) => {
                let Ok([target, local]) = domain.locals.get_disjoint_mut([target, local]) else {
                    // error means that they are overlapping, therefore we would copy into copy,
                    // which just means, nothing is happening
                    return;
                };

                target.clone_from(local);
            }
        }
    }

    fn as_ref<'domain, A: Allocator>(
        &'domain self,
        domain: &'domain BodyFootprint<A>,
    ) -> &'domain Footprint {
        match self {
            Self::Footprint(footprint) => footprint,
            &Self::Copy(local) => &domain.locals[local],
        }
    }
}

struct SizeEstimationDataflowAnalysis<'ctx, 'env, 'heap, A: Allocator> {
    env: &'env Environment<'heap>,
    decl: &'env LocalSlice<LocalDecl<'heap>>,

    body: DefId,
    footprints: &'ctx DefIdSlice<BodyFootprint<A>>,
    dynamic: DenseBitSet<Local>,
    cache: RefCell<&'ctx mut StaticSizeEstimationCache<A>>,
}

impl<'ctx, 'env, 'heap, A: Allocator> SizeEstimationDataflowAnalysis<'ctx, 'env, 'heap, A> {
    fn eval_operand(&self, operand: &Operand<'heap>) -> Eval {
        match operand {
            Operand::Constant(_) => Eval::Footprint(Footprint::scalar()),
            Operand::Place(place) => self.footprint(place),
        }
    }

    fn eval_rvalue<B: Allocator>(&self, domain: &BodyFootprint<B>, rvalue: &RValue<'heap>) -> Eval {
        #[expect(clippy::match_same_arms, reason = "intent")]
        match rvalue {
            RValue::Load(operand) => self.eval_operand(operand),
            RValue::Binary(Binary {
                op:
                    BinOp::Add
                    | BinOp::Sub
                    | BinOp::BitAnd
                    | BinOp::BitOr
                    | BinOp::Eq
                    | BinOp::Lt
                    | BinOp::Lte
                    | BinOp::Ne
                    | BinOp::Gte
                    | BinOp::Gt,
                left: _,
                right: _,
            }) => {
                Eval::Footprint(Footprint::scalar()) // All of these return scalars by definition
            }
            RValue::Unary(Unary {
                op: UnOp::BitNot | UnOp::Neg | UnOp::Not,
                operand: _,
            }) => Eval::Footprint(Footprint::scalar()), // All of these return scalars by definition
            RValue::Aggregate(Aggregate { kind: _, operands }) => {
                let mut total: Footprint = SaturatingSemiring.zero();

                for operand in operands {
                    let eval = self.eval_operand(operand);

                    SaturatingSemiring.plus(&mut total, eval.as_ref(domain));
                }

                Eval::Footprint(total)
            }
            RValue::Input(Input {
                op: InputOp::Exists,
                name: _,
            }) => Eval::Footprint(Footprint::scalar()), // exists is just a boolean
            RValue::Input(Input {
                op: InputOp::Load { .. },
                name: _,
            }) => {
                // the only way we can know the size of a load is if we know the type, which would
                // mean that static analysis would've caught this. This means that dynamic analysis
                // is unable to determine the size of the load accurately.
                // In theory it could be specified, if we specify the inputs during planning, but
                // that would defeat the purpose of compilation.
                Eval::Footprint(Footprint::unknown())
            }
            RValue::Apply(Apply {
                function,
                arguments, // TODO: needs a remapping anyway
            }) => {
                // TODO: lookup the size of the function's output type
                todo!()
            }
        }
    }

    fn footprint(&self, place: &Place<'heap>) -> Eval {
        if place.projections.is_empty() {
            return Eval::Copy(place.local);
        }

        let type_id = place.type_id(self.decl);
        let static_size = {
            let mut cache = self.cache.borrow_mut();
            let mut analyzer = StaticSizeEstimation::new(self.env, *cache);
            analyzer.run(type_id)
        };

        static_size.map_or_else(
            // Over-estimate by using the size of the actual domain
            || Eval::Copy(place.local),
            |size| {
                Eval::Footprint(Footprint {
                    units: Estimate::Constant(size),
                    cardinality: Estimate::Constant(Cardinality::one()),
                })
            },
        )
    }

    fn requires_transfer(&self, place: &Place<'heap>) -> bool {
        if place.projections.is_empty() {
            self.dynamic.contains(place.local)
        } else {
            // We cannot recompute the size of a projection
            false
        }
    }

    fn requires_transfer_local(&self, local: Local) -> bool {
        self.dynamic.contains(local)
    }
}

impl<'heap, B: Allocator> DataflowAnalysis<'heap>
    for SizeEstimationDataflowAnalysis<'_, '_, 'heap, B>
{
    type Domain<A: Allocator> = BodyFootprint<A>;
    type Lattice<A: Allocator + Clone> = BodyFootprintSemilattice<A>;
    type SwitchIntData = !;

    const DIRECTION: Direction = Direction::Forward;

    fn lattice_in<A: Allocator + Clone>(&self, body: &Body<'heap>, alloc: A) -> Self::Lattice<A> {
        BodyFootprintSemilattice {
            alloc,
            domain_size: body.local_decls.len(),
        }
    }

    fn initialize_boundary<A: Allocator>(
        &self,
        body: &Body<'heap>,
        domain: &mut Self::Domain<A>,
        alloc: A,
    ) {
        self.footprints[body.id].clone_into(domain, alloc);
    }

    fn transfer_statement<A: Allocator>(
        &self,
        _: Location,
        statement: &Statement<'heap>,
        state: &mut Self::Domain<A>,
    ) {
        let StatementKind::Assign(Assign { lhs, rhs }) = &statement.kind else {
            return;
        };

        if !self.requires_transfer(lhs) {
            return;
        }

        // Time to transfer the statement
        let footprint = self.eval_rvalue(state, rhs);
        footprint.apply(lhs.local, state);
    }

    fn transfer_edge<A: Allocator>(
        &self,
        _: BasicBlockId,
        source_args: &[Operand<'heap>],

        _: BasicBlockId,
        target_params: &[Local],

        state: &mut Self::Domain<A>,
    ) {
        for (&param, arg) in target_params.iter().zip(source_args) {
            if self.requires_transfer_local(param) {
                let footprint = self.eval_operand(arg);
                footprint.apply(param, state);
            }
        }
    }

    fn transfer_graph_read_edge<A: Allocator>(
        &self,
        _: BasicBlockId,

        _: BasicBlockId,
        target_params: &[Local],

        state: &mut Self::Domain<A>,
    ) {
        let &[param] = target_params else {
            unreachable!("the target param may only have a single param");
        };

        // TODO: heuristic estimate about the size of the graph read operation, for now just
        // unbounded
        state.locals[param] = Footprint::unknown();
    }
}
