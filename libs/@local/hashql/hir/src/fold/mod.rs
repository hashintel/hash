//! HIR visitor for transforming the contents of nodes.
//!
//! This module provides a [`Fold`] trait for transforming HIR trees by creating new nodes
//! rather than modifying existing ones. This approach is necessary because the HIR uses
//! interned data which is immutable by design.
//!
//! The fold pattern offers several advantages:
//!
//! 1. **Interning-Compatible**: Works with the interned, immutable nature of HIR nodes by creating
//!    new nodes rather than modifying existing ones.
//!
//! 2. **Fallible Operations**: Uses the [`Try`] trait to support operations that can fail, with
//!    early return of errors.
//!
//! 3. **Efficiency**: Employs copy-on-write optimizations via [`Beef`] to minimize copying when
//!    transformations don't modify all elements.
//!
//! 4. **Traversal Control**: Provides fine control over how deeply to traverse the tree via the
//!    [`NestedFilter`] type.
//!
//! # Performance Considerations
//!
//! Due to the overhead of creating new nodes and reinterning data, [`Fold`] is inherently
//! slower than [`Visitor`]. Therefore:
//!
//! - **Prefer [`Visitor`] whenever possible** if you only need to analyze the HIR without
//!   modifications
//! - Use [`Fold`] only when you need to transform the HIR structure
//! - Consider using [`NestedFilter`] to limit traversal depth for better performance
//!
//! Even with optimizations like [`Beef`], the creation of new nodes and reinterning processes
//! introduce performance costs that aren't present in the read-only [`Visitor`] pattern.
//!
//! # Use Cases
//!
//! The [`Fold`] pattern is designed for:
//!
//! - **Transformations**: Modify the structure or content of the HIR
//! - **Optimizations**: Replace expressions with more efficient equivalents
//! - **Lowering**: Convert high-level constructs to simpler representations
//! - **Normalization**: Standardize code patterns for later phases
//! - **Code generation**: Prepare HIR for conversion to lower-level IRs
//!
//! Unlike visitors, folders own the nodes they process and return transformed versions.
//! This makes them suitable for transformation passes that need to modify the HIR structure.
//!
//! [`Visitor`]: crate::visit::Visitor

pub mod beef;
pub mod nested;

use core::ops::{FromResidual, Try};

use hashql_core::{
    intern::Interned,
    module::locals::TypeDef,
    span::{SpanId, Spanned},
    symbol::{Ident, Symbol},
    r#type::{TypeId, kind::generic::GenericArgumentReference},
};

use self::{beef::Beef, nested::NestedFilter};
use crate::{
    intern::Interner,
    node::{
        HirId, Node, PartialNode,
        access::{Access, AccessKind, field::FieldAccess, index::IndexAccess},
        branch::{Branch, BranchKind, r#if::If},
        call::{Call, CallArgument},
        closure::{Closure, ClosureParam, ClosureSignature},
        data::{Data, DataKind, Literal},
        graph::{
            Graph, GraphKind,
            read::{GraphRead, GraphReadBody, GraphReadHead, GraphReadTail},
        },
        input::Input,
        kind::NodeKind,
        r#let::Let,
        operation::{
            BinaryOperation, Operation, OperationKind, TypeOperation, UnaryOperation,
            r#type::{TypeAssertion, TypeConstructor, TypeOperationKind},
        },
        variable::{LocalVariable, QualifiedVariable, Variable, VariableKind},
    },
    path::QualifiedPath,
};

/// Trait for transforming HIR nodes.
///
/// The [`Fold`] trait provides methods to transform each type of node in the HIR tree. Unlike
/// visitors, folders take ownership of nodes and return potentially modified versions. This pattern
/// is required due to the interned, immutable nature of HIR nodes - we create new nodes rather than
/// modifying existing ones.
///
/// Each method's default implementation transforms the node's children via the corresponding
/// `walk_*` function. For example, `fold_node` by default calls `walk_node`.
///
/// # Performance Note
///
/// [`Fold`] operations are inherently slower than [`Visitor`] operations due to the overhead
/// of creating new nodes and reinterning data. Always prefer [`Visitor`] when you only need
/// to analyze the HIR without modifying it.
///
/// # Use Cases
///
/// Use the [`Fold`] trait when you need to:
/// - Transform the HIR by creating modified versions of nodes
/// - Perform optimizations or simplifications
/// - Lower complex constructs to simpler ones
/// - Apply code transformations that change the structure
/// - Handle potential failures during transformation
///
/// # Implementation Requirements
///
/// Implementors must provide:
/// - [`interner`](Self::interner) to access the interner for re-interning modified structures
/// - Optionally override individual `fold_*` methods to transform specific node types
///
/// When overriding methods, you have three options for each node:
/// 1. Transform it directly and return a new version
/// 2. Call the corresponding `walk_*` function to apply standard recursion
/// 3. Mix the two approaches by selectively transforming only certain parts
///
/// [`Visitor`]: crate::visit::Visitor
pub trait Fold<'heap> {
    /// The residual type (e.g., [`Result<Infallible, E>`] for [`Result<T, E>`])
    type Residual;
    /// The output type that wraps a transformation (must implement [`Try`],
    /// such as [`Result<T, E>`] or [`Option<T>`]).
    type Output<T>: Try<Output = T, Residual = Self::Residual> + FromResidual<Self::Residual>
    where
        T: 'heap;

    /// Controls how deeply to process nested nodes
    type NestedFilter: NestedFilter = nested::Shallow;

    /// Access the interner for re-interning modified structures
    fn interner(&self) -> &Interner<'heap>;

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_id(&mut self, id: HirId) {
        // do nothing, no fields to walk
    }

    fn fold_type_id(&mut self, id: TypeId) -> Self::Output<TypeId> {
        Try::from_output(id)
    }

    fn fold_type_def(&mut self, def: TypeDef<'heap>) -> Self::Output<TypeDef<'heap>> {
        walk_type_def(self, def)
    }

    fn fold_symbol(&mut self, symbol: Symbol<'heap>) -> Self::Output<Symbol<'heap>> {
        Try::from_output(symbol)
    }

    // TODO: we might want to expand on these in the future, for now tho this is sufficient.
    // Primarily this would require us to also fold symbols, have access to the environment (not
    // only interner)
    fn fold_type_ids(
        &mut self,
        ids: Interned<'heap, [Spanned<TypeId>]>,
    ) -> Self::Output<Interned<'heap, [Spanned<TypeId>]>> {
        Try::from_output(ids)
    }

    fn fold_generic_argument_references(
        &mut self,
        references: Interned<'heap, [GenericArgumentReference<'heap>]>,
    ) -> Self::Output<Interned<'heap, [GenericArgumentReference<'heap>]>> {
        Try::from_output(references)
    }

    fn fold_span(&mut self, span: SpanId) -> Self::Output<SpanId> {
        Try::from_output(span)
    }

    fn fold_ident(&mut self, ident: Ident<'heap>) -> Self::Output<Ident<'heap>> {
        walk_ident(self, ident)
    }

    fn fold_idents(
        &mut self,
        idents: Interned<'heap, [Ident<'heap>]>,
    ) -> Self::Output<Interned<'heap, [Ident<'heap>]>> {
        walk_idents(self, idents)
    }

    fn fold_qualified_path(
        &mut self,
        path: QualifiedPath<'heap>,
    ) -> Self::Output<QualifiedPath<'heap>> {
        walk_qualified_path(self, path)
    }

    fn fold_node(&mut self, node: Node<'heap>) -> Self::Output<Node<'heap>> {
        walk_node(self, node)
    }

    fn fold_nested_node(&mut self, node: Node<'heap>) -> Self::Output<Node<'heap>> {
        walk_nested_node(self, node)
    }

    fn fold_nodes(
        &mut self,
        nodes: Interned<'heap, [Node<'heap>]>,
    ) -> Self::Output<Interned<'heap, [Node<'heap>]>> {
        walk_nodes(self, nodes)
    }

    fn fold_data(&mut self, data: Data<'heap>) -> Self::Output<Data<'heap>> {
        walk_data(self, data)
    }

    fn fold_literal(&mut self, literal: Literal<'heap>) -> Self::Output<Literal<'heap>> {
        walk_literal(self, literal)
    }

    fn fold_variable(&mut self, variable: Variable<'heap>) -> Self::Output<Variable<'heap>> {
        walk_variable(self, variable)
    }

    fn fold_local_variable(
        &mut self,
        variable: LocalVariable<'heap>,
    ) -> Self::Output<LocalVariable<'heap>> {
        walk_local_variable(self, variable)
    }

    fn fold_qualified_variable(
        &mut self,
        variable: QualifiedVariable<'heap>,
    ) -> Self::Output<QualifiedVariable<'heap>> {
        walk_qualified_variable(self, variable)
    }

    fn fold_let(&mut self, r#let: Let<'heap>) -> Self::Output<Let<'heap>> {
        walk_let(self, r#let)
    }

    fn fold_input(&mut self, input: Input<'heap>) -> Self::Output<Input<'heap>> {
        walk_input(self, input)
    }

    fn fold_operation(&mut self, operation: Operation<'heap>) -> Self::Output<Operation<'heap>> {
        walk_operation(self, operation)
    }

    fn fold_type_operation(
        &mut self,
        operation: TypeOperation<'heap>,
    ) -> Self::Output<TypeOperation<'heap>> {
        walk_type_operation(self, operation)
    }

    fn fold_type_assertion(
        &mut self,
        assertion: TypeAssertion<'heap>,
    ) -> Self::Output<TypeAssertion<'heap>> {
        walk_type_assertion(self, assertion)
    }

    fn fold_type_constructor(
        &mut self,
        constructor: TypeConstructor<'heap>,
    ) -> Self::Output<TypeConstructor<'heap>> {
        walk_type_constructor(self, constructor)
    }

    fn fold_binary_operation(
        &mut self,
        operation: BinaryOperation<'heap>,
    ) -> Self::Output<BinaryOperation<'heap>> {
        walk_binary_operation(self, operation)
    }

    fn fold_unary_operation(
        &mut self,
        operation: UnaryOperation<'heap>,
    ) -> Self::Output<UnaryOperation<'heap>> {
        walk_unary_operation(self, operation)
    }

    fn fold_access(&mut self, access: Access<'heap>) -> Self::Output<Access<'heap>> {
        walk_access(self, access)
    }

    fn fold_field_access(
        &mut self,
        access: FieldAccess<'heap>,
    ) -> Self::Output<FieldAccess<'heap>> {
        walk_field_access(self, access)
    }

    fn fold_index_access(
        &mut self,
        access: IndexAccess<'heap>,
    ) -> Self::Output<IndexAccess<'heap>> {
        walk_index_access(self, access)
    }

    fn fold_call(&mut self, call: Call<'heap>) -> Self::Output<Call<'heap>> {
        walk_call(self, call)
    }

    fn fold_call_argument(
        &mut self,
        argument: CallArgument<'heap>,
    ) -> Self::Output<CallArgument<'heap>> {
        walk_call_argument(self, argument)
    }

    fn fold_call_arguments(
        &mut self,
        arguments: Interned<'heap, [CallArgument<'heap>]>,
    ) -> Self::Output<Interned<'heap, [CallArgument<'heap>]>> {
        walk_call_arguments(self, arguments)
    }

    fn fold_if(&mut self, r#if: If<'heap>) -> Self::Output<If<'heap>> {
        walk_if(self, r#if)
    }

    fn fold_branch(&mut self, branch: Branch<'heap>) -> Self::Output<Branch<'heap>> {
        walk_branch(self, branch)
    }

    fn fold_closure(&mut self, closure: Closure<'heap>) -> Self::Output<Closure<'heap>> {
        walk_closure(self, closure)
    }

    fn fold_closure_signature(
        &mut self,
        signature: ClosureSignature<'heap>,
    ) -> Self::Output<ClosureSignature<'heap>> {
        walk_closure_signature(self, signature)
    }

    fn fold_closure_param(
        &mut self,
        param: ClosureParam<'heap>,
    ) -> Self::Output<ClosureParam<'heap>> {
        walk_closure_param(self, param)
    }

    fn fold_closure_params(
        &mut self,
        params: Interned<'heap, [ClosureParam<'heap>]>,
    ) -> Self::Output<Interned<'heap, [ClosureParam<'heap>]>> {
        walk_closure_params(self, params)
    }

    fn fold_graph(&mut self, graph: Graph<'heap>) -> Self::Output<Graph<'heap>> {
        walk_graph(self, graph)
    }

    fn fold_graph_read(&mut self, read: GraphRead<'heap>) -> Self::Output<GraphRead<'heap>> {
        walk_graph_read(self, read)
    }

    fn fold_graph_read_head(
        &mut self,
        head: GraphReadHead<'heap>,
    ) -> Self::Output<GraphReadHead<'heap>> {
        walk_graph_read_head(self, head)
    }

    fn fold_graph_read_body(
        &mut self,
        body: Interned<'heap, [GraphReadBody<'heap>]>,
    ) -> Self::Output<Interned<'heap, [GraphReadBody<'heap>]>> {
        walk_graph_read_body(self, body)
    }

    fn fold_graph_read_body_step(
        &mut self,
        body: GraphReadBody<'heap>,
    ) -> Self::Output<GraphReadBody<'heap>> {
        walk_graph_read_body_step(self, body)
    }

    fn fold_graph_read_tail(&mut self, tail: GraphReadTail) -> Self::Output<GraphReadTail> {
        walk_graph_read_tail(self, tail)
    }
}

pub fn walk_type_def<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    TypeDef { id, arguments }: TypeDef<'heap>,
) -> T::Output<TypeDef<'heap>> {
    let id = visitor.fold_type_id(id)?;
    let arguments = visitor.fold_generic_argument_references(arguments)?;

    Try::from_output(TypeDef { id, arguments })
}

pub fn walk_ident<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    Ident { value, span, kind }: Ident<'heap>,
) -> T::Output<Ident<'heap>> {
    let span = visitor.fold_span(span)?;
    let value = visitor.fold_symbol(value)?;

    Try::from_output(Ident { value, span, kind })
}

pub fn walk_idents<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    idents: Interned<'heap, [Ident<'heap>]>,
) -> T::Output<Interned<'heap, [Ident<'heap>]>> {
    if idents.is_empty() {
        return Try::from_output(idents);
    }

    let mut idents = Beef::new(idents);
    idents.try_map::<_, T::Output<()>>(|ident| visitor.fold_ident(ident))?;

    Try::from_output(idents.finish(&visitor.interner().idents))
}

pub fn walk_qualified_path<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    QualifiedPath(path, _): QualifiedPath<'heap>,
) -> T::Output<QualifiedPath<'heap>> {
    let idents = visitor.fold_idents(path)?;

    Try::from_output(QualifiedPath::new_unchecked(idents))
}

pub fn walk_node<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    Node { id: _, span, kind }: Node<'heap>,
) -> T::Output<Node<'heap>> {
    // We don't fold the id, because said id might not be the future id of the interned type
    let span = visitor.fold_span(span)?;

    let kind = match *kind {
        NodeKind::Data(data) => NodeKind::Data(visitor.fold_data(data)?),
        NodeKind::Variable(variable) => NodeKind::Variable(visitor.fold_variable(variable)?),
        NodeKind::Let(r#let) => NodeKind::Let(visitor.fold_let(r#let)?),
        NodeKind::Input(input) => NodeKind::Input(visitor.fold_input(input)?),
        NodeKind::Operation(operation) => NodeKind::Operation(visitor.fold_operation(operation)?),
        NodeKind::Access(access) => NodeKind::Access(visitor.fold_access(access)?),
        NodeKind::Call(call) => NodeKind::Call(visitor.fold_call(call)?),
        NodeKind::Branch(branch) => NodeKind::Branch(visitor.fold_branch(branch)?),
        NodeKind::Closure(closure) => NodeKind::Closure(visitor.fold_closure(closure)?),
        NodeKind::Graph(graph) => NodeKind::Graph(visitor.fold_graph(graph)?),
    };

    let interner = visitor.interner();

    let node = interner.intern_node(PartialNode { span, kind });

    visitor.visit_id(node.id);

    Try::from_output(node)
}

pub fn walk_nested_node<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    node: Node<'heap>,
) -> T::Output<Node<'heap>> {
    if !T::NestedFilter::DEEP {
        return Try::from_output(node);
    }

    visitor.fold_node(node)
}

pub fn walk_nodes<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    nodes: Interned<'heap, [Node<'heap>]>,
) -> T::Output<Interned<'heap, [Node<'heap>]>> {
    if nodes.is_empty() {
        return Try::from_output(nodes);
    }

    let mut nodes = Beef::new(nodes);
    nodes.try_map::<_, T::Output<()>>(|node| visitor.fold_nested_node(node))?;

    Try::from_output(nodes.finish(&visitor.interner().nodes))
}

pub fn walk_data<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    Data { span, kind }: Data<'heap>,
) -> T::Output<Data<'heap>> {
    let span = visitor.fold_span(span)?;

    let kind = match kind {
        DataKind::Literal(literal) => DataKind::Literal(visitor.fold_literal(literal)?),
    };

    Try::from_output(Data { span, kind })
}

pub fn walk_literal<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    Literal { span, kind }: Literal<'heap>,
) -> T::Output<Literal<'heap>> {
    let span = visitor.fold_span(span)?;

    Try::from_output(Literal { span, kind })
}

pub fn walk_variable<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    Variable { span, kind }: Variable<'heap>,
) -> T::Output<Variable<'heap>> {
    let span = visitor.fold_span(span)?;

    match kind {
        VariableKind::Local(variable) => {
            VariableKind::Local(visitor.fold_local_variable(variable)?)
        }
        VariableKind::Qualified(variable) => {
            VariableKind::Qualified(visitor.fold_qualified_variable(variable)?)
        }
    };

    Try::from_output(Variable { span, kind })
}

pub fn walk_local_variable<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    LocalVariable {
        span,
        name,
        arguments,
    }: LocalVariable<'heap>,
) -> T::Output<LocalVariable<'heap>> {
    let span = visitor.fold_span(span)?;
    let ident = visitor.fold_ident(name)?;
    let arguments = visitor.fold_type_ids(arguments)?;

    Try::from_output(LocalVariable {
        span,
        name: ident,
        arguments,
    })
}

pub fn walk_qualified_variable<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    QualifiedVariable {
        span,
        path,
        arguments,
    }: QualifiedVariable<'heap>,
) -> T::Output<QualifiedVariable<'heap>> {
    let span = visitor.fold_span(span)?;
    let path = visitor.fold_qualified_path(path)?;
    let arguments = visitor.fold_type_ids(arguments)?;

    Try::from_output(QualifiedVariable {
        span,
        path,
        arguments,
    })
}

pub fn walk_let<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    Let {
        span,
        name,
        value,
        body,
    }: Let<'heap>,
) -> T::Output<Let<'heap>> {
    let span = visitor.fold_span(span)?;
    let name = visitor.fold_ident(name)?;

    let value = visitor.fold_nested_node(value)?;
    let body = visitor.fold_nested_node(body)?;

    Try::from_output(Let {
        span,
        name,
        value,
        body,
    })
}

pub fn walk_input<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    Input {
        span,
        name,
        r#type,
        default,
    }: Input<'heap>,
) -> T::Output<Input<'heap>> {
    let span = visitor.fold_span(span)?;
    let name = visitor.fold_ident(name)?;

    let r#type = visitor.fold_type_id(r#type)?;

    let default = if let Some(default) = default {
        Some(visitor.fold_nested_node(default)?)
    } else {
        None
    };

    Try::from_output(Input {
        span,
        name,
        r#type,
        default,
    })
}

pub fn walk_operation<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    Operation { span, kind }: Operation<'heap>,
) -> T::Output<Operation<'heap>> {
    let span = visitor.fold_span(span)?;

    let kind = match kind {
        OperationKind::Type(operation) => {
            OperationKind::Type(visitor.fold_type_operation(operation)?)
        }
        OperationKind::Binary(operation) => {
            OperationKind::Binary(visitor.fold_binary_operation(operation)?)
        }
    };

    Try::from_output(Operation { span, kind })
}

pub fn walk_type_operation<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    TypeOperation { span, kind }: TypeOperation<'heap>,
) -> T::Output<TypeOperation<'heap>> {
    let span = visitor.fold_span(span)?;

    let kind = match kind {
        TypeOperationKind::Assertion(assertion) => {
            TypeOperationKind::Assertion(visitor.fold_type_assertion(assertion)?)
        }
        TypeOperationKind::Constructor(constructor) => {
            TypeOperationKind::Constructor(visitor.fold_type_constructor(constructor)?)
        }
    };

    Try::from_output(TypeOperation { span, kind })
}

pub fn walk_type_assertion<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    TypeAssertion {
        span,
        value,
        r#type,
        force,
    }: TypeAssertion<'heap>,
) -> T::Output<TypeAssertion<'heap>> {
    let span = visitor.fold_span(span)?;
    let value = visitor.fold_nested_node(value)?;
    let r#type = visitor.fold_type_id(r#type)?;

    Try::from_output(TypeAssertion {
        span,
        value,
        r#type,
        force,
    })
}

pub fn walk_type_constructor<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    TypeConstructor {
        span,
        name,
        closure,
        arguments,
    }: TypeConstructor<'heap>,
) -> T::Output<TypeConstructor<'heap>> {
    let span = visitor.fold_span(span)?;
    let name = visitor.fold_symbol(name)?;
    let closure = visitor.fold_type_id(closure)?;
    let arguments = visitor.fold_generic_argument_references(arguments)?;

    Try::from_output(TypeConstructor {
        span,
        name,
        closure,
        arguments,
    })
}

pub fn walk_binary_operation<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    BinaryOperation {
        span,
        op,
        left,
        right,
    }: BinaryOperation<'heap>,
) -> T::Output<BinaryOperation<'heap>> {
    let span = visitor.fold_span(span)?;
    let left = visitor.fold_nested_node(left)?;
    let right = visitor.fold_nested_node(right)?;

    Try::from_output(BinaryOperation {
        span,
        op,
        left,
        right,
    })
}

pub fn walk_unary_operation<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    UnaryOperation { span, op, expr }: UnaryOperation<'heap>,
) -> T::Output<UnaryOperation<'heap>> {
    let span = visitor.fold_span(span)?;
    let expr = visitor.fold_nested_node(expr)?;

    Try::from_output(UnaryOperation { span, op, expr })
}

pub fn walk_access<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    Access { span, kind }: Access<'heap>,
) -> T::Output<Access<'heap>> {
    let span = visitor.fold_span(span)?;

    let kind = match kind {
        AccessKind::Field(access) => AccessKind::Field(visitor.fold_field_access(access)?),
        AccessKind::Index(access) => AccessKind::Index(visitor.fold_index_access(access)?),
    };

    Try::from_output(Access { span, kind })
}

pub fn walk_field_access<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    FieldAccess { span, expr, field }: FieldAccess<'heap>,
) -> T::Output<FieldAccess<'heap>> {
    let span = visitor.fold_span(span)?;
    let expr = visitor.fold_nested_node(expr)?;
    let field = visitor.fold_ident(field)?;

    Try::from_output(FieldAccess { span, expr, field })
}

pub fn walk_index_access<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    IndexAccess { span, expr, index }: IndexAccess<'heap>,
) -> T::Output<IndexAccess<'heap>> {
    let span = visitor.fold_span(span)?;
    let expr = visitor.fold_nested_node(expr)?;
    let index = visitor.fold_nested_node(index)?;

    Try::from_output(IndexAccess { span, expr, index })
}

pub fn walk_call<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    Call {
        span,
        function,
        arguments,
    }: Call<'heap>,
) -> T::Output<Call<'heap>> {
    let span = visitor.fold_span(span)?;
    let function = visitor.fold_nested_node(function)?;
    let arguments = visitor.fold_call_arguments(arguments)?;

    Try::from_output(Call {
        span,
        function,
        arguments,
    })
}

pub fn walk_call_argument<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    CallArgument { span, value }: CallArgument<'heap>,
) -> T::Output<CallArgument<'heap>> {
    let span = visitor.fold_span(span)?;
    let value = visitor.fold_nested_node(value)?;

    Try::from_output(CallArgument { span, value })
}

pub fn walk_call_arguments<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    arguments: Interned<'heap, [CallArgument<'heap>]>,
) -> T::Output<Interned<'heap, [CallArgument<'heap>]>> {
    if arguments.is_empty() {
        return Try::from_output(arguments);
    }

    let mut arguments = Beef::new(arguments);
    arguments.try_map::<_, T::Output<()>>(|argument| visitor.fold_call_argument(argument))?;

    Try::from_output(arguments.finish(&visitor.interner().call_arguments))
}

pub fn walk_if<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    If {
        span,
        test,
        then,
        r#else,
    }: If<'heap>,
) -> T::Output<If<'heap>> {
    let span = visitor.fold_span(span)?;
    let test = visitor.fold_node(test)?;
    let then = visitor.fold_node(then)?;
    let r#else = visitor.fold_node(r#else)?;

    Try::from_output(If {
        span,
        test,
        then,
        r#else,
    })
}

pub fn walk_branch<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    Branch { span, kind }: Branch<'heap>,
) -> T::Output<Branch<'heap>> {
    let span = visitor.fold_span(span)?;

    let kind = match kind {
        BranchKind::If(r#if) => BranchKind::If(visitor.fold_if(r#if)?),
    };

    Try::from_output(Branch { span, kind })
}

pub fn walk_closure<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    Closure {
        span,
        signature,
        body,
    }: Closure<'heap>,
) -> T::Output<Closure<'heap>> {
    let span = visitor.fold_span(span)?;
    let signature = visitor.fold_closure_signature(signature)?;
    let body = visitor.fold_node(body)?;

    Try::from_output(Closure {
        span,
        signature,
        body,
    })
}

pub fn walk_closure_signature<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    ClosureSignature { span, def, params }: ClosureSignature<'heap>,
) -> T::Output<ClosureSignature<'heap>> {
    let span = visitor.fold_span(span)?;

    let def = visitor.fold_type_def(def)?;

    let params = visitor.fold_closure_params(params)?;

    Try::from_output(ClosureSignature { span, def, params })
}

pub fn walk_closure_param<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    ClosureParam { span, name }: ClosureParam<'heap>,
) -> T::Output<ClosureParam<'heap>> {
    let span = visitor.fold_span(span)?;

    let name = visitor.fold_ident(name)?;

    Try::from_output(ClosureParam { span, name })
}

pub fn walk_closure_params<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    params: Interned<'heap, [ClosureParam<'heap>]>,
) -> T::Output<Interned<'heap, [ClosureParam<'heap>]>> {
    if params.is_empty() {
        return Try::from_output(params);
    }

    let mut params = Beef::new(params);
    params.try_map::<_, T::Output<()>>(|param| visitor.fold_closure_param(param))?;

    Try::from_output(params.finish(&visitor.interner().closure_params))
}

pub fn walk_graph<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    Graph { span, kind }: Graph<'heap>,
) -> T::Output<Graph<'heap>> {
    let span = visitor.fold_span(span)?;

    let kind = match kind {
        GraphKind::Read(read) => GraphKind::Read(visitor.fold_graph_read(read)?),
    };

    Try::from_output(Graph { span, kind })
}

pub fn walk_graph_read<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    GraphRead {
        span,
        head,
        body,
        tail,
    }: GraphRead<'heap>,
) -> T::Output<GraphRead<'heap>> {
    let span = visitor.fold_span(span)?;

    let head = visitor.fold_graph_read_head(head)?;
    let body = visitor.fold_graph_read_body(body)?;
    let tail = visitor.fold_graph_read_tail(tail)?;

    Try::from_output(GraphRead {
        span,
        head,
        body,
        tail,
    })
}

pub fn walk_graph_read_head<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    head: GraphReadHead<'heap>,
) -> T::Output<GraphReadHead<'heap>> {
    match head {
        GraphReadHead::Entity { axis } => {
            let axis = visitor.fold_nested_node(axis)?;
            Try::from_output(GraphReadHead::Entity { axis })
        }
    }
}

pub fn walk_graph_read_body<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    body: Interned<'heap, [GraphReadBody<'heap>]>,
) -> T::Output<Interned<'heap, [GraphReadBody<'heap>]>> {
    if body.is_empty() {
        return Try::from_output(body);
    }

    let mut body = Beef::new(body);
    body.try_map::<_, T::Output<()>>(|body| visitor.fold_graph_read_body_step(body))?;

    Try::from_output(body.finish(&visitor.interner().graph_read_body))
}

pub fn walk_graph_read_body_step<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    body: GraphReadBody<'heap>,
) -> T::Output<GraphReadBody<'heap>> {
    match body {
        GraphReadBody::Filter(node) => {
            let node = visitor.fold_nested_node(node)?;
            Try::from_output(GraphReadBody::Filter(node))
        }
    }
}

#[must_use]
pub fn walk_graph_read_tail<'heap, T: Fold<'heap> + ?Sized>(
    _: &mut T,
    tail: GraphReadTail,
) -> T::Output<GraphReadTail> {
    Try::from_output(tail)
}
