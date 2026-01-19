use core::{alloc::Allocator, cell::RefCell};

use hashql_core::{
    heap::CloneIn as _,
    id::{Id, IdSlice, bit_vec::DenseBitSet},
    r#type::environment::Environment,
};
use hashql_hir::node::operation::{InputOp, UnOp};

use super::{
    footprint::{BodyFootprint, BodyFootprintSemilattice, Footprint},
    r#static::StaticSizeEstimationCache,
};
use crate::{
    body::{
        Body,
        basic_block::BasicBlockId,
        constant::Constant,
        local::{Local, LocalDecl, LocalSlice},
        location::Location,
        operand::Operand,
        place::Place,
        rvalue::{Aggregate, Apply, ArgSlice, BinOp, Binary, Input, RValue, Unary},
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

    footprints: &'ctx DefIdSlice<BodyFootprint<A>>,
    dynamic: DenseBitSet<Local>,
    cache: RefCell<&'ctx mut StaticSizeEstimationCache<A>>,
}

impl<'heap, A: Allocator> SizeEstimationDataflowAnalysis<'_, '_, 'heap, A> {
    fn eval_operand<B: Allocator>(
        &self,
        domain: &BodyFootprint<B>,
        operand: &Operand<'heap>,
    ) -> Eval {
        match operand {
            Operand::Constant(_) => Eval::Footprint(Footprint::scalar()),
            Operand::Place(place) => self.footprint(domain, place),
        }
    }

    fn eval_rvalue<B: Allocator>(&self, domain: &BodyFootprint<B>, rvalue: &RValue<'heap>) -> Eval {
        #[expect(clippy::match_same_arms, reason = "intent")]
        match rvalue {
            RValue::Load(operand) => self.eval_operand(domain, operand),
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
                    let eval = self.eval_operand(domain, operand);

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
                arguments,
            }) => {
                let &Operand::Constant(Constant::FnPtr(ptr)) = function else {
                    // We're unable to determine the size of the function call, because we don't
                    // know what function is going to be called.
                    return Eval::Footprint(Footprint::unknown());
                };

                Eval::Footprint(self.eval_apply(domain, ptr, arguments))
            }
        }
    }

    fn eval_returns<B: Allocator>(
        &self,
        domain: &BodyFootprint<B>,

        arguments: &ArgSlice<Operand<'heap>>,
        returns: &Footprint,
    ) -> Footprint {
        // We're given a return, that footprint may be dependent on the arguments, to do
        // that we simply take the argument, and then multiply by the number given, once
        // done we add everything up.
        let mut total: Footprint = SaturatingSemiring.zero();

        // We do this in two parts, first we go over the coefficients, and convert them to our
        // "universe"
        for (index, operand) in arguments.iter_enumerated() {
            let units_coefficient = returns.units.coefficients()[index.as_usize()];
            let cardinality_coefficient = returns.cardinality.coefficients()[index.as_usize()];

            if units_coefficient == 0 && cardinality_coefficient == 0 {
                continue;
            }

            let argument_footprint = self.eval_operand(domain, operand);
            let argument_footprint = argument_footprint.as_ref(domain);

            total.saturating_mul_add(
                argument_footprint,
                units_coefficient,
                cardinality_coefficient,
            );
        }

        // Once completed, we add the constant footprint to the total footprint.
        SaturatingSemiring.plus(total.units.constant_mut(), returns.units.constant());
        SaturatingSemiring.plus(
            total.cardinality.constant_mut(),
            returns.cardinality.constant(),
        );

        total
    }

    fn eval_apply<B: Allocator>(
        &self,
        domain: &BodyFootprint<B>,

        function: DefId,
        arguments: &ArgSlice<Operand<'heap>>,
    ) -> Footprint {
        let returns = &self.footprints[function].returns;

        self.eval_returns(domain, arguments, returns)
    }

    fn footprint<B: Allocator>(&self, domain: &BodyFootprint<B>, place: &Place<'heap>) -> Eval {
        if place.projections.is_empty() {
            // if the place is dynamic, and one of the params of the body, then we instead use a
            // parametrized footprint
            if self.dynamic.contains(place.local) && place.local.as_usize() < domain.args {
                return Eval::Footprint(Footprint::coefficient(
                    place.local.as_usize(),
                    domain.args,
                ));
            }

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
            args: body.args,
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
                let footprint = self.eval_operand(state, arg);
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
