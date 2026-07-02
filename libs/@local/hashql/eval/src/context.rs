use core::{alloc::Allocator, fmt, ops::Index};

use hashql_core::{
    heap::BumpAllocator, id::bit_vec::DenseBitSet, r#type::environment::Environment,
};
use hashql_diagnostics::DiagnosticIssues;
use hashql_mir::{
    body::{
        Body, Source,
        basic_block::{BasicBlockId, BasicBlockSlice},
        local::Local,
    },
    def::{DefId, DefIdSlice, DefIdVec},
    pass::{
        analysis::dataflow::{
            TraversalLivenessAnalysis,
            framework::{DataflowAnalysis as _, DataflowResults},
        },
        execution::{ExecutionAnalysisResidual, VertexType, traversal::TraversalPathBitSet},
    },
};

use crate::{error::EvalDiagnosticIssues, intern::Interner};

struct BasicBlockLiveOut<A: Allocator>(
    Box<BasicBlockSlice<(DenseBitSet<Local>, TraversalPathBitSet)>, A>,
);

impl<A: Allocator> Index<BasicBlockId> for BasicBlockLiveOut<A> {
    type Output = DenseBitSet<Local>;

    #[inline]
    fn index(&self, index: BasicBlockId) -> &Self::Output {
        &self.0[index].0
    }
}

pub struct LiveOut<A: Allocator>(DefIdVec<Option<BasicBlockLiveOut<A>>, A>);

impl<A: Allocator> Index<(DefId, BasicBlockId)> for LiveOut<A> {
    type Output = DenseBitSet<Local>;

    #[inline]
    fn index(&self, (body, index): (DefId, BasicBlockId)) -> &Self::Output {
        &self.0[body]
            .as_ref()
            .expect("body should have completed live out analysis")[index]
    }
}

pub struct CodeGenerationContext<'ctx, 'heap, A: Allocator> {
    pub env: &'ctx Environment<'heap>,
    pub interner: &'ctx Interner<'heap>,

    pub bodies: &'ctx DefIdSlice<Body<'heap>>,
    pub execution: &'ctx DefIdSlice<Option<ExecutionAnalysisResidual<A>>>,

    pub live_out: LiveOut<A>,
    pub diagnostics: EvalDiagnosticIssues,

    pub alloc: A,
}

impl<'ctx, 'heap, A: Allocator> CodeGenerationContext<'ctx, 'heap, A> {
    pub fn new_in<S: BumpAllocator>(
        env: &'ctx Environment<'heap>,
        interner: &'ctx Interner<'heap>,
        bodies: &'ctx DefIdSlice<Body<'heap>>,
        execution: &'ctx DefIdSlice<Option<ExecutionAnalysisResidual<A>>>,
        alloc: A,
        mut scratch: S,
    ) -> Self
    where
        A: Clone,
    {
        let mut live_out = DefIdVec::new_in(alloc.clone());

        for body in bodies {
            match body.source {
                Source::Ctor(_)
                | Source::Closure(_, _)
                | Source::Thunk(_, _)
                | Source::Intrinsic(_) => continue,
                Source::GraphReadFilter(_) => {}
            }

            let Some(vertex) = VertexType::from_local(env, &body.local_decls[Local::VERTEX]) else {
                unreachable!("graph related operations always have at least two args")
            };

            #[expect(unsafe_code)]
            let exit_states = scratch.scoped_mut(|scoped| {
                let analysis = TraversalLivenessAnalysis { vertex };
                let DataflowResults {
                    analysis: _,
                    entry_states: _,
                    exit_states,
                } = analysis.iterate_to_fixpoint_in(body, &scoped);

                let mut exit_states_boxed =
                    Box::new_uninit_slice_in(exit_states.len(), alloc.clone());
                let (_, rest) = exit_states_boxed.write_iter(exit_states);
                debug_assert!(rest.is_empty());

                // SAFETY: exit_states.len() == exit_states_boxed.len() by construction
                let exit_states = unsafe { exit_states_boxed.assume_init() };
                BasicBlockLiveOut(BasicBlockSlice::from_boxed_slice(exit_states))
            });

            live_out.insert(body.id, exit_states);
        }

        Self {
            env,
            interner,
            bodies,
            execution,
            live_out: LiveOut(live_out),
            diagnostics: DiagnosticIssues::new(),
            alloc,
        }
    }
}

#[derive(Copy, Clone)]
pub struct CodeExecutionContext<'ctx, 'heap, A: Allocator> {
    pub env: &'ctx Environment<'heap>,
    pub interner: &'ctx Interner<'heap>,

    pub bodies: &'ctx DefIdSlice<Body<'heap>>,
    pub execution: &'ctx DefIdSlice<Option<ExecutionAnalysisResidual<A>>>,

    pub alloc: A,
}

impl<A: Allocator> fmt::Debug for CodeExecutionContext<'_, '_, A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("CodeExecutionContext")
            .field("env", &self.env)
            .field("interner", &self.interner)
            .field("bodies", &self.bodies)
            .field("execution", &self.execution)
            .finish_non_exhaustive()
    }
}

impl<'ctx, 'heap, A: Allocator> From<CodeGenerationContext<'ctx, 'heap, A>>
    for CodeExecutionContext<'ctx, 'heap, A>
{
    fn from(context: CodeGenerationContext<'ctx, 'heap, A>) -> Self {
        Self {
            env: context.env,
            interner: context.interner,
            bodies: context.bodies,
            execution: context.execution,
            alloc: context.alloc,
        }
    }
}
