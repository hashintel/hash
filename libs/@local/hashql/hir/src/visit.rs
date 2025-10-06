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
};

use crate::{
    node::{
        HirId, Node,
        access::{Access, AccessKind, field::FieldAccess, index::IndexAccess},
        branch::{Branch, BranchKind, r#if::If},
        call::{Call, CallArgument},
        closure::{Closure, ClosureParam, ClosureSignature},
        data::{
            Data, DataKind, Dict, List, Literal, Struct, Tuple, dict::DictField,
            r#struct::StructField,
        },
        graph::{
            Graph, GraphKind,
            read::{GraphRead, GraphReadBody, GraphReadHead, GraphReadTail},
        },
        input::Input,
        kind::NodeKind,
        r#let::{Binder, Let, VarId},
        operation::{
            BinaryOperation, Operation, OperationKind, TypeOperation, UnaryOperation,
            r#type::{TypeAssertion, TypeConstructor, TypeOperationKind},
        },
        variable::{LocalVariable, QualifiedVariable, Variable, VariableKind},
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

    fn visit_node(&mut self, node: &Node<'heap>) {
        walk_node(self, node);
    }

    fn visit_data(&mut self, data: &'heap Data<'heap>) {
        walk_data(self, data);
    }

    fn visit_literal(&mut self, literal: &'heap Literal<'heap>) {
        walk_literal(self, literal);
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

pub fn walk_node<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Node { id, span, kind }: &Node<'heap>,
) {
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
        NodeKind::Graph(graph) => visitor.visit_graph(graph),
    }
}

pub fn walk_data<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Data { span, kind }: &'heap Data<'heap>,
) {
    visitor.visit_span(*span);

    match kind {
        DataKind::Literal(literal) => visitor.visit_literal(literal),
        DataKind::Tuple(tuple) => visitor.visit_tuple(tuple),
        DataKind::Struct(r#struct) => visitor.visit_struct(r#struct),
        DataKind::List(list) => visitor.visit_list(list),
        DataKind::Dict(dict) => visitor.visit_dict(dict),
    }
}

pub fn walk_literal<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Literal { span, kind: _ }: &'heap Literal<'heap>,
) {
    visitor.visit_span(*span);
}

pub fn walk_tuple<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Tuple { span, fields }: &'heap Tuple<'heap>,
) {
    visitor.visit_span(*span);

    for field in fields {
        visitor.visit_node(field);
    }
}

pub fn walk_struct_field<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    StructField { name, value }: &'heap StructField<'heap>,
) {
    visitor.visit_ident(name);
    visitor.visit_node(value);
}

pub fn walk_struct<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Struct { span, fields }: &'heap Struct<'heap>,
) {
    visitor.visit_span(*span);

    for field in fields {
        visitor.visit_struct_field(field);
    }
}

pub fn walk_list<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    List { span, elements }: &'heap List<'heap>,
) {
    visitor.visit_span(*span);

    for element in elements {
        visitor.visit_node(element);
    }
}

pub fn walk_dict<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Dict { span, fields }: &'heap Dict<'heap>,
) {
    visitor.visit_span(*span);

    for field in fields {
        visitor.visit_dict_field(field);
    }
}

pub fn walk_dict_field<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    DictField { key, value }: &'heap DictField<'heap>,
) {
    visitor.visit_node(key);
    visitor.visit_node(value);
}

pub fn walk_variable<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Variable { span, kind }: &'heap Variable<'heap>,
) {
    visitor.visit_span(*span);

    match kind {
        VariableKind::Local(variable) => visitor.visit_local_variable(variable),
        VariableKind::Qualified(variable) => visitor.visit_qualified_variable(variable),
    }
}

pub fn walk_local_variable<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    LocalVariable {
        span,
        id,
        arguments,
    }: &'heap LocalVariable<'heap>,
) {
    visitor.visit_span(*span);

    visitor.visit_span(id.span);
    visitor.visit_var_id(id.value);

    for &argument in arguments {
        visitor.visit_type_id(argument.value);
    }
}

pub fn walk_qualified_variable<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    QualifiedVariable {
        span,
        path,
        arguments,
    }: &'heap QualifiedVariable<'heap>,
) {
    visitor.visit_span(*span);
    visitor.visit_qualified_path(path);

    for &argument in arguments {
        visitor.visit_type_id(argument.value);
    }
}

pub fn walk_binder<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Binder { id, name }: &'heap Binder<'heap>,
) {
    visitor.visit_var_id(*id);

    if let Some(name) = name {
        visitor.visit_ident(name);
    }
}

pub fn walk_let<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Let {
        span,
        name,
        value,
        body,
    }: &'heap Let<'heap>,
) {
    visitor.visit_span(*span);
    visitor.visit_binder(name);

    visitor.visit_node(value);
    visitor.visit_node(body);
}

pub fn walk_input<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Input {
        span,
        name,
        r#type,
        default,
    }: &'heap Input<'heap>,
) {
    visitor.visit_span(*span);
    visitor.visit_ident(name);

    visitor.visit_type_id(*r#type);

    if let Some(default) = default {
        visitor.visit_node(default);
    }
}

pub fn walk_operation<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Operation { span, kind }: &'heap Operation<'heap>,
) {
    visitor.visit_span(*span);

    match kind {
        OperationKind::Type(operation) => visitor.visit_type_operation(operation),
        OperationKind::Binary(operation) => visitor.visit_binary_operation(operation),
    }
}

pub fn walk_type_operation<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    TypeOperation { span, kind }: &'heap TypeOperation<'heap>,
) {
    visitor.visit_span(*span);

    match kind {
        TypeOperationKind::Assertion(assertion) => visitor.visit_type_assertion(assertion),
        TypeOperationKind::Constructor(constructor) => visitor.visit_type_constructor(constructor),
    }
}

pub fn walk_type_assertion<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    TypeAssertion {
        span,
        value,
        r#type,
        force: _,
    }: &'heap TypeAssertion<'heap>,
) {
    visitor.visit_span(*span);
    visitor.visit_node(value);
    visitor.visit_type_id(*r#type);
}

pub fn walk_type_constructor<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    TypeConstructor {
        span,
        name,
        closure,
        arguments,
    }: &'heap TypeConstructor<'heap>,
) {
    visitor.visit_span(*span);
    visitor.visit_symbol(name);
    visitor.visit_type_id(*closure);

    for reference in arguments {
        visitor.visit_generic_argument_reference(reference);
    }
}

pub fn walk_binary_operation<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    BinaryOperation {
        span,
        op: _,
        left,
        right,
    }: &'heap BinaryOperation<'heap>,
) {
    visitor.visit_span(*span);

    visitor.visit_node(left);
    visitor.visit_node(right);
}

pub fn walk_unary_operation<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    UnaryOperation { span, op: _, expr }: &'heap UnaryOperation<'heap>,
) {
    visitor.visit_span(*span);
    visitor.visit_node(expr);
}

pub fn walk_access<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Access { span, kind }: &'heap Access<'heap>,
) {
    visitor.visit_span(*span);

    match kind {
        AccessKind::Field(access) => visitor.visit_field_access(access),
        AccessKind::Index(access) => visitor.visit_index_access(access),
    }
}

pub fn walk_field_access<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    FieldAccess { span, expr, field }: &'heap FieldAccess<'heap>,
) {
    visitor.visit_span(*span);
    visitor.visit_node(expr);
    visitor.visit_ident(field);
}

pub fn walk_index_access<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    IndexAccess { span, expr, index }: &'heap IndexAccess<'heap>,
) {
    visitor.visit_span(*span);
    visitor.visit_node(expr);
    visitor.visit_node(index);
}

pub fn walk_call<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Call {
        span,
        function,
        arguments,
    }: &'heap Call<'heap>,
) {
    visitor.visit_span(*span);
    visitor.visit_node(function);

    for argument in arguments {
        visitor.visit_call_argument(argument);
    }
}

pub fn walk_call_argument<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    CallArgument { span, value }: &'heap CallArgument<'heap>,
) {
    visitor.visit_span(*span);
    visitor.visit_node(value);
}

pub fn walk_branch<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Branch { span, kind }: &'heap Branch<'heap>,
) {
    visitor.visit_span(*span);

    match kind {
        BranchKind::If(r#if) => visitor.visit_if(r#if),
    }
}

pub fn walk_if<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    If {
        span,
        test,
        then,
        r#else,
    }: &'heap If<'heap>,
) {
    visitor.visit_span(*span);
    visitor.visit_node(test);
    visitor.visit_node(then);

    visitor.visit_node(r#else);
}

pub fn walk_closure<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Closure {
        span,
        signature,
        body,
    }: &'heap Closure<'heap>,
) {
    visitor.visit_span(*span);
    visitor.visit_closure_signature(signature);
    visitor.visit_node(body);
}

pub fn walk_closure_signature<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    ClosureSignature { span, def, params }: &'heap ClosureSignature<'heap>,
) {
    visitor.visit_span(*span);
    visitor.visit_type_id(def.id);

    for reference in def.arguments {
        visitor.visit_generic_argument_reference(reference);
    }

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

pub fn walk_graph<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    Graph { span, kind }: &'heap Graph<'heap>,
) {
    visitor.visit_span(*span);

    match kind {
        GraphKind::Read(read) => visitor.visit_graph_read(read),
    }
}

pub fn walk_graph_read<'heap, T: Visitor<'heap> + ?Sized>(
    visitor: &mut T,
    GraphRead {
        span,
        head,
        body,
        tail,
    }: &'heap GraphRead<'heap>,
) {
    visitor.visit_span(*span);

    match head {
        GraphReadHead::Entity { axis } => visitor.visit_node(axis),
    }

    for body in body {
        match body {
            GraphReadBody::Filter(node) => visitor.visit_node(node),
        }
    }

    match tail {
        GraphReadTail::Collect => {}
    }
}
