// convert the HIR into HIR(ANF), HIR(ANF) is a reduced form of the HIR, which differentiates
// between values: (places (variables with projections), constants) and everything else. Function
// application can only be done with values as arguments. We extend this, even though at this point
// we have already specialized the HIR nodes, any node that was previously a function is treated as
// such. We define boundaries, where we accumulate `let` bindings, these are:
// - closure definitions
// - branching (control flow)

// We deviate from the original ANF quite a bit here to allow for more flexibility down the line, in
// particular traditional ANF supports closures as values, which for us makes little sense.
// Closures are just pointers to a BB, so it doesn't make sense to treat them as values. It would
// essentially double our implementation complexity, because we would need to handle closures as
// values and as pointers separately.
// We use projections instead of variables to allow for mutable assignments in the MIR down the
// line and to reduce the number of `let` bindings.
// This removes some easy potential for deduplication, but that is deemed to not really be a concern
// here.

use core::convert::Infallible;

use hashql_core::intern::Interned;

use crate::{
    context::HirContext,
    fold::{self, Fold},
    intern::Interner,
    node::{
        Node,
        access::{Access, FieldAccess, IndexAccess},
        branch::{Branch, If},
        call::{Call, CallArgument},
        closure::{Closure, ClosureParam, ClosureSignature},
        data::Data,
        graph::{
            Graph,
            read::{GraphRead, GraphReadBody, GraphReadHead, GraphReadTail},
        },
        input::Input,
        r#let::{Binding, Let},
        operation::{
            BinaryOperation, Operation, TypeAssertion, TypeConstructor, TypeOperation,
            UnaryOperation,
        },
        variable::Variable,
    },
    path::QualifiedPath,
};

// How do we do this transformation? in theory it should be relatively straightforward, we have two
// operating modes (all handled by the same fold operation).
//
// We ANF normalize *everything* according to the rules of the ANF transformation. After that
// transformation the body may still be a non-atom when an atom is expected -> if that is the case,
// we will need to introduce a new atom.
//
// The question is: can we do this in a way that is more...
// elegant? The problem is the following: we cannot indiscriminately just say: this just needs to be
// an atom at the end, because that means that the value of a let binding couldn't be normalized.
//
// There are two ways to solve this problem:
// 1. Have two fold operations, one for atoms and one for non-atoms
// 2. Have a single fold operation that can handle both atoms and non-atoms, by introducing a new
//    atom when necessary, something like: `ensure_atom`, this *might* introduce additional
//    interning.
//
// Actually it doesn't because either way we need to introduce a new binding, so where we put it
// doesn't matter.
//
// So we would just normally fold, and then ensure that the result is an atom where we need an atom.
// What aren't atoms? control flow expressions, let bindings, closure definitions
//
// An important thing to note is that we need to ensure that we need to call this on the fold node
// level, why? because that is only where we can switch out the node type, which is necessary.
//
// Yea, we can just use the same fold operation!

struct AnfAtomFold<'ctx, 'env, 'heap> {
    context: &'ctx mut HirContext<'env, 'heap>,
    bindings: Vec<Binding<'heap>>,
}

impl<'ctx, 'env, 'heap> Fold<'heap> for AnfAtomFold<'ctx, 'env, 'heap> {
    type NestedFilter = fold::nested::Deep;
    type Output<T>
        = Result<T, !>
    where
        T: 'heap;
    type Residual = Result<Infallible, !>;

    fn interner(&self) -> &Interner<'heap> {
        self.context.interner
    }

    fn fold_qualified_path(
        &mut self,
        path: QualifiedPath<'heap>,
    ) -> Self::Output<QualifiedPath<'heap>> {
        fold::walk_qualified_path(self, path)
    }

    fn fold_node(&mut self, node: Node<'heap>) -> Self::Output<Node<'heap>> {
        fold::walk_node(self, node)
    }

    fn fold_data(&mut self, data: Data<'heap>) -> Self::Output<Data<'heap>> {
        // data does not need to be done separately as it is already in ANF form
        // TODO: stack construction of non-literal data should be done here as well?
        fold::walk_data(self, data)
    }

    fn fold_variable(&mut self, variable: Variable<'heap>) -> Self::Output<Variable<'heap>> {
        // variables are per definition already in ANF form
        fold::walk_variable(self, variable)
    }

    fn fold_let(&mut self, r#let: Let<'heap>) -> Self::Output<Let<'heap>> {
        // TODO: how to handle let bindings? They still need to be in ANF form as well
        fold::walk_let(self, r#let)
    }

    fn fold_input(&mut self, input: Input<'heap>) -> Self::Output<Input<'heap>> {
        // TODO: input is just a plain function call, therefore valid, as long as the default is an
        // atom
        fold::walk_input(self, input)
    }

    fn fold_operation(&mut self, operation: Operation<'heap>) -> Self::Output<Operation<'heap>> {
        fold::walk_operation(self, operation)
    }

    fn fold_type_operation(
        &mut self,
        operation: TypeOperation<'heap>,
    ) -> Self::Output<TypeOperation<'heap>> {
        fold::walk_type_operation(self, operation)
    }

    fn fold_type_assertion(
        &mut self,
        assertion: TypeAssertion<'heap>,
    ) -> Self::Output<TypeAssertion<'heap>> {
        fold::walk_type_assertion(self, assertion)
    }

    fn fold_type_constructor(
        &mut self,
        constructor: TypeConstructor<'heap>,
    ) -> Self::Output<TypeConstructor<'heap>> {
        // TODO: is an ordinary function call, therefore valid, as long as the arguments are atoms
        fold::walk_type_constructor(self, constructor)
    }

    fn fold_binary_operation(
        &mut self,
        operation: BinaryOperation<'heap>,
    ) -> Self::Output<BinaryOperation<'heap>> {
        fold::walk_binary_operation(self, operation)
    }

    fn fold_unary_operation(
        &mut self,
        operation: UnaryOperation<'heap>,
    ) -> Self::Output<UnaryOperation<'heap>> {
        fold::walk_unary_operation(self, operation)
    }

    fn fold_access(&mut self, access: Access<'heap>) -> Self::Output<Access<'heap>> {
        fold::walk_access(self, access)
    }

    fn fold_field_access(
        &mut self,
        access: FieldAccess<'heap>,
    ) -> Self::Output<FieldAccess<'heap>> {
        fold::walk_field_access(self, access)
    }

    fn fold_index_access(
        &mut self,
        access: IndexAccess<'heap>,
    ) -> Self::Output<IndexAccess<'heap>> {
        fold::walk_index_access(self, access)
    }

    fn fold_call(&mut self, call: Call<'heap>) -> Self::Output<Call<'heap>> {
        fold::walk_call(self, call)
    }

    fn fold_call_argument(
        &mut self,
        argument: CallArgument<'heap>,
    ) -> Self::Output<CallArgument<'heap>> {
        fold::walk_call_argument(self, argument)
    }

    fn fold_call_arguments(
        &mut self,
        arguments: Interned<'heap, [CallArgument<'heap>]>,
    ) -> Self::Output<Interned<'heap, [CallArgument<'heap>]>> {
        fold::walk_call_arguments(self, arguments)
    }

    fn fold_branch(&mut self, branch: Branch<'heap>) -> Self::Output<Branch<'heap>> {
        fold::walk_branch(self, branch)
    }

    fn fold_if(&mut self, r#if: If<'heap>) -> Self::Output<If<'heap>> {
        fold::walk_if(self, r#if)
    }

    fn fold_closure(&mut self, closure: Closure<'heap>) -> Self::Output<Closure<'heap>> {
        fold::walk_closure(self, closure)
    }

    fn fold_closure_signature(
        &mut self,
        signature: ClosureSignature<'heap>,
    ) -> Self::Output<ClosureSignature<'heap>> {
        fold::walk_closure_signature(self, signature)
    }

    fn fold_closure_param(
        &mut self,
        param: ClosureParam<'heap>,
    ) -> Self::Output<ClosureParam<'heap>> {
        fold::walk_closure_param(self, param)
    }

    fn fold_closure_params(
        &mut self,
        params: Interned<'heap, [ClosureParam<'heap>]>,
    ) -> Self::Output<Interned<'heap, [ClosureParam<'heap>]>> {
        fold::walk_closure_params(self, params)
    }

    fn fold_graph(&mut self, graph: Graph<'heap>) -> Self::Output<Graph<'heap>> {
        fold::walk_graph(self, graph)
    }

    fn fold_graph_read(&mut self, read: GraphRead<'heap>) -> Self::Output<GraphRead<'heap>> {
        fold::walk_graph_read(self, read)
    }

    fn fold_graph_read_head(
        &mut self,
        head: GraphReadHead<'heap>,
    ) -> Self::Output<GraphReadHead<'heap>> {
        fold::walk_graph_read_head(self, head)
    }

    fn fold_graph_read_body(
        &mut self,
        body: Interned<'heap, [GraphReadBody<'heap>]>,
    ) -> Self::Output<Interned<'heap, [GraphReadBody<'heap>]>> {
        fold::walk_graph_read_body(self, body)
    }

    fn fold_graph_read_body_step(
        &mut self,
        body: GraphReadBody<'heap>,
    ) -> Self::Output<GraphReadBody<'heap>> {
        fold::walk_graph_read_body_step(self, body)
    }

    fn fold_graph_read_tail(&mut self, tail: GraphReadTail) -> Self::Output<GraphReadTail> {
        fold::walk_graph_read_tail(self, tail)
    }
}
