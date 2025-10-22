use core::slice::SlicePattern;

use hashql_core::{
    heap::{self, Heap},
    id::IdCounter,
};
use hashql_hir::node::{
    Node,
    closure::Closure,
    data::{Data, Dict},
    kind::NodeKind,
    r#let::{Binding, Let, VarIdVec},
    thunk::Thunk,
    variable::Variable,
};

use crate::{
    body::{
        Body, Source,
        basic_block::{BasicBlock, BasicBlockId, BasicBlockVec},
        constant::Constant,
        local::Local,
        operand::Operand,
        place::Place,
        rvalue::{Aggregate, AggregateKind, RValue},
        terminator::{Terminator, TerminatorKind},
    },
    def::{DefId, DefIdVec},
};

struct ReifyContext<'ctx, 'heap> {
    bodies: &'ctx mut DefIdVec<Body<'heap>>,
    heap: &'heap Heap,
}

struct BodyContext<'ctx, 'heap> {
    blocks: &'ctx mut BasicBlockVec<BasicBlock<'heap>, &'heap Heap>,
    locals: VarIdVec<Local>,
    counter: IdCounter<Local>,
}

fn compile_place<'heap>(node: &Node<'heap>) -> Place<'heap> {
    match node.kind {
        NodeKind::Access(_) => todo!(),
        NodeKind::Variable(_) => todo!(),
        _ => panic!("Expected place to be present"),
    }
}

fn compile_operand<'heap>(
    node: &Node<'heap>,
    reify: &mut ReifyContext<'_, 'heap>,
    body: &mut BodyContext<'_, 'heap>,
) -> Operand<'heap> {
    // must be an atom
    match node.kind {
        NodeKind::Access(_) => todo!(),
        NodeKind::Variable(_) => todo!(),
        NodeKind::Data(Data::Primitive(primitive)) => todo!(),
        _ => panic!("Expected atom to be present"),
    }
}

fn compile_statement<'heap>(
    binding: &Binding<'heap>,
    reify: &mut ReifyContext<'_, 'heap>,
    body: &mut BodyContext<'_, 'heap>,
) {
    let rvalue = match binding.value.kind {
        NodeKind::Data(Data::Primitive(primitive)) => {
            RValue::Load(Operand::Constant(Constant::Primitive(*primitive)))
        }
        NodeKind::Data(Data::Dict(Dict { fields })) => {
            // TODO: aggregate
            RValue::Aggregate(Aggregate {
                kind: AggregateKind::Dict,
                // key and value are both atoms, therefore safe to construct as such
                operands: todo!(),
            })
        }
        NodeKind::Variable(variable) => todo!(),
        NodeKind::Let(_) => todo!(),
        NodeKind::Input(input) => todo!(),
        NodeKind::Operation(operation) => todo!(),
        NodeKind::Access(access) => todo!(),
        NodeKind::Call(call) => todo!(),
        NodeKind::Branch(branch) => todo!(),
        NodeKind::Closure(closure) => todo!(),
        NodeKind::Thunk(thunk) => todo!(),
        NodeKind::Graph(graph) => todo!(),
    };

    todo!()
}

fn compile_basic_block<'heap>(
    def: DefId,
    node: &Node<'heap>,
    reify: &mut ReifyContext<'_, 'heap>,
    body: &mut BodyContext<'_, 'heap>,
) {
    let statements = heap::Vec::new_in(reify.heap);

    // TODO: go from binding to binding (if available) and turn into a statement, if in ANF
    let (bindings, ret) = match node.kind {
        NodeKind::Let(Let { bindings, body }) => (bindings.0, body),
        NodeKind::Access(_) | NodeKind::Variable(_) | NodeKind::Data(Data::Primitive(_)) => {
            (&[] as &[_], node)
        }
        _ => unreachable!("Guaranteed to be in HIR(ANF)"),
    };

    for binding in bindings {}
}

fn compile_body<'heap>(
    def: DefId,
    body: &Node<'heap>,
    context: &mut ReifyContext<'_, 'heap>,
) -> Body<'heap> {
    // First we gotta figure out what we're calling, in case of a `Thunk` this is straight-forward,
    // as no context is involved, otherwise need to generate what the required context is (in
    // `VarId`).
    // Thunks do not have any context and are always called a thin pointers.
    let (args, body) = match body.kind {
        NodeKind::Thunk(Thunk { body }) => (0, body),
        NodeKind::Closure(Closure { signature, body }) => {
            // TODO: need to implement environment capture (somehow)
            (signature.params.len() + 1, body)
        }
        _ => panic!("`compile_body` has been called on a non function-like node"),
    };

    // We now compile the basic blocks

    todo!()
}

// TODO: Extend to multiple packages and modules
//
// Architecture for multi-package support:
//
// ## Structure
// - Each package is identified by `PackageId` and contains modules identified by `ModuleId`
//   (flat-map)
// - Each module contains items (excluding submodules) referenced by `ItemId`
// - Packages form a DAG to handle dependencies
//
// ## Algorithm per package
// 1. **Input**: `ModuleIdVec<Node<'heap>>` for all modules in the package
// 2. **Context**: `PackageIdVec<ModuleIdVec<ItemIdVec<DefId>>>` graph of previously processed items
//    (may be flattened)
// 3. **Pre-allocation**: Reserve bodies for all top-level items (as thunks)
// 4. **Mapping**: Build `(ModuleId, ItemId) -> DefId` index for all items
// 5. **Body generation**: Process each node, creating bodies and handling nested closures
// 6. **Resolution**:
//    - Internal references `(PackageId::CURRENT, ModuleId, ItemId)`: use local mapping
//    - External references: lookup in previously resolved items graph
//
// This design enables incremental compilation by processing packages independently while
// maintaining cross-package reference resolution.
pub fn from_hir<'heap>(node: &Node<'heap>, context: &mut ReifyContext<'_, 'heap>) -> DefId {
    // The node is already in HIR(ANF) - each node will be a thunk.
    let NodeKind::Let(Let { bindings, body }) = node.kind else {
        // It is only a body, per thunking rules this will only be a local identifier
        unreachable!(
            "external modules are currently unsupported upstream, and anything else will result \
             in at least a single thunk"
        );
    };

    // The body will be a (local) variable
    let NodeKind::Variable(variable) = body.kind else {
        unreachable!(
            "Hir(ANF) after thunking guarantees that the outer return type is an identifier"
        );
    };

    let Variable::Local(local) = variable else {
        todo!("error that cross module references aren't supported yet");
    };

    // TODO: with_capacity
    let mut references = VarIdVec::new();

    // The bindings here are purposefully empty, we use them as references, and then insert them
    // later.
    for binding in bindings {
        references.insert(
            binding.binder.id,
            context.bodies.push(Body {
                span: binding.span,
                source: Source::Thunk,
                basic_blocks: BasicBlockVec::new_in(context.heap),
                args: 0,
            }),
        );
    }

    // For each binding, create the basic-block body
    for binding in bindings {
        let def = references[binding.binder.id]
            .unwrap_or_else(|| unreachable!("This has just been created"));

        let body = compile_body(def, &binding.value, context);
        context.bodies[def] = body;
    }

    todo!()
}
