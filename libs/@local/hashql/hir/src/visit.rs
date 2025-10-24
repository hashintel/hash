//! HIR visitor for walking the contents of nodes.
//!
//! This module provides a [`Visitor`] trait that enables traversal of the HIR tree without
//! modification. Unlike the AST visitor, the HIR visitor operates on interned data, which
//! is immutable by design.
//!
//! Here are key characteristics of the HIR visitor pattern:
//!
//! 1. **Immutable Traversal**: Due to the interned nature of HIR nodes, visitors cannot mutate
//!    nodes in-place. For transformations, use the [`Fold`] trait instead.
//!
//! 2. **Depth-First**: Visitors perform a depth-first traversal of the HIR tree.
//!
//! 3. **Child Control**: Each overridden visit method has full control over what happens with its
//!    node. It can do its own traversal of the node's children, call `walk_*` to apply the default
//!    traversal algorithm, or prevent deeper traversal by doing nothing.
//!
//! 4. **Non-Destructive**: Visitors don't modify the HIR tree, making them safe for analysis passes
//!    that need to preserve the original structure.
//!
//! # Use Cases
//!
//! The [`Visitor`] pattern is ideal for:
//!
//! - **Analysis passes**: Examine nodes without modifying them
//! - **Information gathering**: Collect data about the HIR (e.g., variable usage, call sites)
//! - **Validation**: Check semantic rules and constraints
//! - **Type checking**: Verify type correctness without modification
//! - **Linting**: Detect potential issues or style violations
//!
//! For transformations that need to modify the HIR, use the [`Fold`] trait instead.
//!
//! # Usage
//!
//! ```ignore
//! struct MyVisitor {
//!     // State to track during traversal
//! }
//!
//! impl<'heap> Visitor<'heap> for MyVisitor {
//!     fn visit_variable(&mut self, variable: &'heap Variable<'heap>) {
//!         // Do something with variable
//!
//!         // Continue traversal with the default algorithm
//!         walk_variable(self, variable);
//!     }
//! }
//!
//! // Apply the visitor to a node
//! let mut visitor = MyVisitor { /* ... */ };
//! visitor.visit_node(&some_node);
//! ```
//!
//! [`Fold`]: crate::fold::Fold
use hashql_core::{
    span::SpanId,
    symbol::{Ident, Symbol},
    r#type::{TypeId, kind::generic::GenericArgumentReference},
    value::Primitive,
};

use crate::{
    node::{
        HirId, Node, NodeData,
        access::{Access, FieldAccess, IndexAccess},
        branch::{Branch, If},
        call::{Call, CallArgument},
        closure::{Closure, ClosureParam, ClosureSignature},
        data::{Data, Dict, DictField, List, Struct, StructField, Tuple},
        graph::{
            Graph,
            read::{GraphRead, GraphReadBody, GraphReadHead, GraphReadTail},
        },
        input::Input,
        kind::NodeKind,
        r#let::{Binder, Binding, Let, VarId},
        operation::{
            BinaryOperation, Operation, TypeAssertion, TypeConstructor, TypeOperation,
            UnaryOperation,
        },
        thunk::Thunk,
        variable::{LocalVariable, QualifiedVariable, Variable},
    },
    path::QualifiedPath,
};

/// Trait for visiting HIR nodes without modifying them.
///
/// The [`Visitor`] trait provides methods to traverse each type of node in the HIR tree.
/// Due to the interned nature of HIR nodes, visitors cannot modify nodes directly.
/// For transformations, use the [`Fold`] trait instead.
///
/// Each method's default implementation recursively visits the substructure of the
/// input via the corresponding `walk_*` method. For example, the `visit_node` method
/// by default calls `walk_node`.
///
/// # Use Cases
///
/// Use the [`Visitor`] trait when you need to:
/// - Analyze the HIR without modifying it
/// - Collect information about nodes (e.g., find all variables of a certain type)
/// - Validate semantic constraints
/// - Perform type checking or other analyses
///
/// # Implementation
///
/// To implement a visitor:
/// 1. Create a type that implements this trait
/// 2. Override methods for the node types you want to process specially
/// 3. When overriding a method, you can:
///    - Process the node before/after visiting children
///    - Selectively visit only certain children
///    - Skip child traversal entirely
///
/// Due to the immutable, interned nature of the HIR, all references to HIR nodes
/// have the same lifetime as the heap where they're allocated.
///
/// [`Fold`]: crate::fold::Fold
pub trait Visitor<'heap> {
    #[expect(unused_variables, reason = "trait definition")]
    fn visit_id(&mut self, id: HirId) {
        // do nothing, no fields to walk
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_var_id(&mut self, id: VarId) {
        // do nothing, no fields to walk
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_type_id(&mut self, id: TypeId) {
        // do nothing, no fields to walk
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_generic_argument_reference(
        &mut self,
        reference: &'heap GenericArgumentReference<'heap>,
    ) {
        // do nothing, no fields to walk
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_span(&mut self, span: SpanId) {
        // do nothing, no fields to walk
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_symbol(&mut self, symbol: &'heap Symbol<'heap>) {
        // do nothing, no fields to walk
    }

    fn visit_ident(&mut self, ident: &'heap Ident<'heap>) {
        walk_ident(self, ident);
    }

    fn visit_qualified_path(&mut self, path: &'heap QualifiedPath<'heap>) {
        walk_qualified_path(self, path);
    }

    fn visit_node(&mut self, node: Node<'heap>) {
        walk_node(self, node);
    }

    fn visit_data(&mut self, data: &'heap Data<'heap>) {
        walk_data(self, data);
    }

    #[expect(unused_variables, reason = "trait definition")]
    fn visit_primitive(&mut self, literal: &'heap Primitive<'heap>) {
        // do nothing, no fields to walk
    }

    fn visit_tuple(&mut self, tuple: &'heap Tuple<'heap>) {
        walk_tuple(self, tuple);
    }

    fn visit_struct_field(&mut self, field: &'heap StructField<'heap>) {
        walk_struct_field(self, field);
    }

    fn visit_struct(&mut self, r#struct: &'heap Struct<'heap>) {
        walk_struct(self, r#struct);
    }

    fn visit_list(&mut self, list: &'heap List<'heap>) {
        walk_list(self, list);
    }

    fn visit_dict(&mut self, dict: &'heap Dict<'heap>) {
        walk_dict(self, dict);
    }

    fn visit_dict_field(&mut self, field: &'heap DictField<'heap>) {
        walk_dict_field(self, field);
    }

    fn visit_variable(&mut self, variable: &'heap Variable<'heap>) {
        walk_variable(self, variable);
    }

    fn visit_local_variable(&mut self, variable: &'heap LocalVariable<'heap>) {
        walk_local_variable(self, variable);
    }

    fn visit_qualified_variable(&mut self, variable: &'heap QualifiedVariable<'heap>) {
        walk_qualified_variable(self, variable);
    }

    fn visit_binder(&mut self, binding: &'heap Binder<'heap>) {
        walk_binder(self, binding);
    }

    fn visit_binding(&mut self, binding: &'heap Binding<'heap>) {
        walk_binding(self, binding);
    }

    fn visit_let(&mut self, r#let: &'heap Let<'heap>) {
        walk_let(self, r#let);
    }

    fn visit_input(&mut self, input: &'heap Input<'heap>) {
        walk_input(self, input);
    }

    fn visit_operation(&mut self, operation: &'heap Operation<'heap>) {
        walk_operation(self, operation);
    }

    fn visit_type_operation(&mut self, operation: &'heap TypeOperation<'heap>) {
        walk_type_operation(self, operation);
    }

    fn visit_type_assertion(&mut self, assertion: &'heap TypeAssertion<'heap>) {
        walk_type_assertion(self, assertion);
    }

    fn visit_type_constructor(&mut self, constructor: &'heap TypeConstructor<'heap>) {
        walk_type_constructor(self, constructor);
    }

    fn visit_binary_operation(&mut self, operation: &'heap BinaryOperation<'heap>) {
        walk_binary_operation(self, operation);
    }

    fn visit_unary_operation(&mut self, operation: &'heap UnaryOperation<'heap>) {
        walk_unary_operation(self, operation);
    }

    fn visit_access(&mut self, access: &'heap Access<'heap>) {
        walk_access(self, access);
    }

    fn visit_field_access(&mut self, access: &'heap FieldAccess<'heap>) {
        walk_field_access(self, access);
    }

    fn visit_index_access(&mut self, access: &'heap IndexAccess<'heap>) {
        walk_index_access(self, access);
    }

    fn visit_call(&mut self, call: &'heap Call<'heap>) {
        walk_call(self, call);
    }

    fn visit_call_argument(&mut self, argument: &'heap CallArgument<'heap>) {
        walk_call_argument(self, argument);
    }

    fn visit_branch(&mut self, branch: &'heap Branch<'heap>) {
        walk_branch(self, branch);
    }

    fn visit_if(&mut self, r#if: &'heap If<'heap>) {
        walk_if(self, r#if);
    }

    fn visit_closure(&mut self, closure: &'heap Closure<'heap>) {
        walk_closure(self, closure);
    }

    fn visit_closure_signature(&mut self, signature: &'heap ClosureSignature<'heap>) {
        walk_closure_signature(self, signature);
    }

    fn visit_closure_param(&mut self, param: &'heap ClosureParam<'heap>) {
        walk_closure_param(self, param);
    }

    fn visit_thunk(&mut self, thunk: &'heap Thunk<'heap>) {
        walk_thunk(self, thunk);
    }

    fn visit_graph(&mut self, graph: &'heap Graph<'heap>) {
        walk_graph(self, graph);
    }

    fn visit_graph_read(&mut self, graph_read: &'heap GraphRead<'heap>) {
        walk_graph_read(self, graph_read);
    }
}

pub fn walk_ident<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Ident {
        value,
        span,
        kind: _,
    }: &'heap Ident<'heap>,
) {
    visitor.visit_span(*span);
    visitor.visit_symbol(value);
}

pub fn walk_qualified_path<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    QualifiedPath(path, _): &'heap QualifiedPath<'heap>,
) {
    for ident in path {
        visitor.visit_ident(ident);
    }
}

pub fn walk_node<'heap, T: Visitor<'heap> + ?Sized>(visitor: &mut T, node: Node<'heap>) {
    let NodeData { id, span, kind } = node.0;

    visitor.visit_id(*id);
    visitor.visit_span(*span);

    match kind {
        NodeKind::Data(data) => visitor.visit_data(data),
        NodeKind::Variable(variable) => visitor.visit_variable(variable),
        NodeKind::Let(r#let) => visitor.visit_let(r#let),
        NodeKind::Input(input) => visitor.visit_input(input),
        NodeKind::Operation(operation) => visitor.visit_operation(operation),
        NodeKind::Access(access) => visitor.visit_access(access),
        NodeKind::Call(call) => visitor.visit_call(call),
        NodeKind::Branch(branch) => visitor.visit_branch(branch),
        NodeKind::Closure(closure) => visitor.visit_closure(closure),
        NodeKind::Thunk(thunk) => visitor.visit_thunk(thunk),
        NodeKind::Graph(graph) => visitor.visit_graph(graph),
    }
}

pub fn walk_data<'heap, T: Visitor<'heap> + ?Sized>(visitor: &mut T, data: &'heap Data<'heap>) {
    match data {
        Data::Primitive(primitive) => visitor.visit_primitive(primitive),
        Data::Tuple(tuple) => visitor.visit_tuple(tuple),
        Data::Struct(r#struct) => visitor.visit_struct(r#struct),
        Data::List(list) => visitor.visit_list(list),
        Data::Dict(dict) => visitor.visit_dict(dict),
    }
}

pub fn walk_tuple<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Tuple { fields }: &'heap Tuple<'heap>,
) {
    for field in fields {
        visitor.visit_node(*field);
    }
}

pub fn walk_struct_field<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    StructField { name, value }: &'heap StructField<'heap>,
) {
    visitor.visit_ident(name);
    visitor.visit_node(*value);
}

pub fn walk_struct<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Struct { fields }: &'heap Struct<'heap>,
) {
    for field in fields {
        visitor.visit_struct_field(field);
    }
}

pub fn walk_list<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    List { elements }: &'heap List<'heap>,
) {
    for element in elements {
        visitor.visit_node(*element);
    }
}

pub fn walk_dict<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Dict { fields }: &'heap Dict<'heap>,
) {
    for field in fields {
        visitor.visit_dict_field(field);
    }
}

pub fn walk_dict_field<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    DictField { key, value }: &'heap DictField<'heap>,
) {
    visitor.visit_node(*key);
    visitor.visit_node(*value);
}

pub fn walk_variable<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    variable: &'heap Variable<'heap>,
) {
    match variable {
        Variable::Local(variable) => visitor.visit_local_variable(variable),
        Variable::Qualified(variable) => visitor.visit_qualified_variable(variable),
    }
}

pub fn walk_local_variable<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    LocalVariable { id, arguments }: &'heap LocalVariable<'heap>,
) {
    visitor.visit_span(id.span);
    visitor.visit_var_id(id.value);

    for &argument in arguments {
        visitor.visit_type_id(argument.value);
    }
}

pub fn walk_qualified_variable<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    QualifiedVariable { path, arguments }: &'heap QualifiedVariable<'heap>,
) {
    visitor.visit_qualified_path(path);

    for &argument in arguments {
        visitor.visit_type_id(argument.value);
    }
}

pub fn walk_binder<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Binder { id, span, name }: &'heap Binder<'heap>,
) {
    visitor.visit_var_id(*id);
    visitor.visit_span(*span);

    if let Some(name) = name {
        visitor.visit_symbol(name);
    }
}

pub fn walk_binding<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Binding {
        span,
        binder,
        value,
    }: &'heap Binding<'heap>,
) {
    visitor.visit_span(*span);
    visitor.visit_binder(binder);
    visitor.visit_node(*value);
}

pub fn walk_let<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Let { bindings, body }: &'heap Let<'heap>,
) {
    for binding in bindings {
        visitor.visit_binding(binding);
    }

    visitor.visit_node(*body);
}

pub fn walk_input<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Input {
        name,
        r#type,
        default,
    }: &'heap Input<'heap>,
) {
    visitor.visit_ident(name);

    visitor.visit_type_id(*r#type);

    if let Some(default) = default {
        visitor.visit_node(*default);
    }
}

pub fn walk_operation<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    operation: &'heap Operation<'heap>,
) {
    match operation {
        Operation::Type(operation) => visitor.visit_type_operation(operation),
        Operation::Binary(operation) => visitor.visit_binary_operation(operation),
    }
}

pub fn walk_type_operation<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    operation: &'heap TypeOperation<'heap>,
) {
    match operation {
        TypeOperation::Assertion(assertion) => visitor.visit_type_assertion(assertion),
        TypeOperation::Constructor(constructor) => visitor.visit_type_constructor(constructor),
    }
}

pub fn walk_type_assertion<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    TypeAssertion {
        value,
        r#type,
        force: _,
    }: &'heap TypeAssertion<'heap>,
) {
    visitor.visit_node(*value);
    visitor.visit_type_id(*r#type);
}

pub fn walk_type_constructor<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    TypeConstructor { name }: &'heap TypeConstructor<'heap>,
) {
    visitor.visit_symbol(name);
}

pub fn walk_binary_operation<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    BinaryOperation { op, left, right }: &'heap BinaryOperation<'heap>,
) {
    visitor.visit_span(op.span);

    visitor.visit_node(*left);
    visitor.visit_node(*right);
}

pub fn walk_unary_operation<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    UnaryOperation { op, expr }: &'heap UnaryOperation<'heap>,
) {
    visitor.visit_span(op.span);

    visitor.visit_node(*expr);
}

pub fn walk_access<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    access: &'heap Access<'heap>,
) {
    match access {
        Access::Field(access) => visitor.visit_field_access(access),
        Access::Index(access) => visitor.visit_index_access(access),
    }
}

pub fn walk_field_access<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    FieldAccess { expr, field }: &'heap FieldAccess<'heap>,
) {
    visitor.visit_node(*expr);
    visitor.visit_ident(field);
}

pub fn walk_index_access<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    IndexAccess { expr, index }: &'heap IndexAccess<'heap>,
) {
    visitor.visit_node(*expr);
    visitor.visit_node(*index);
}

pub fn walk_call<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Call {
        kind: _,
        function,
        arguments,
    }: &'heap Call<'heap>,
) {
    visitor.visit_node(*function);

    for argument in arguments {
        visitor.visit_call_argument(argument);
    }
}

pub fn walk_call_argument<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    CallArgument { span, value }: &'heap CallArgument<'heap>,
) {
    visitor.visit_span(*span);
    visitor.visit_node(*value);
}

pub fn walk_branch<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    branch: &'heap Branch<'heap>,
) {
    match branch {
        Branch::If(r#if) => visitor.visit_if(r#if),
    }
}

pub fn walk_if<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    If { test, then, r#else }: &'heap If<'heap>,
) {
    visitor.visit_node(*test);
    visitor.visit_node(*then);

    visitor.visit_node(*r#else);
}

pub fn walk_closure<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Closure { signature, body }: &'heap Closure<'heap>,
) {
    visitor.visit_closure_signature(signature);
    visitor.visit_node(*body);
}

pub fn walk_closure_signature<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    ClosureSignature { span, params }: &'heap ClosureSignature<'heap>,
) {
    visitor.visit_span(*span);

    for param in params {
        visitor.visit_closure_param(param);
    }
}

pub fn walk_closure_param<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    ClosureParam { span, name }: &'heap ClosureParam<'heap>,
) {
    visitor.visit_span(*span);

    visitor.visit_binder(name);
}

pub fn walk_thunk<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Thunk { body }: &'heap Thunk<'heap>,
) {
    visitor.visit_node(*body);
}

pub fn walk_graph<'heap, T: Visitor<'heap> + ?Sized>(visitor: &mut T, graph: &'heap Graph<'heap>) {
    match graph {
        Graph::Read(read) => visitor.visit_graph_read(read),
    }
}

pub fn walk_graph_read<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    GraphRead { head, body, tail }: &'heap GraphRead<'heap>,
) {
    match head {
        GraphReadHead::Entity { axis } => visitor.visit_node(*axis),
    }

    for body in body {
        match body {
            GraphReadBody::Filter(node) => visitor.visit_node(*node),
        }
    }

    match tail {
        GraphReadTail::Collect => {}
    }
}
