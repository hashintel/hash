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

pub mod nested;

use core::ops::{FromResidual, Try};

use hashql_core::{
    intern::{Beef, Interned},
    span::{SpanId, Spanned},
    symbol::{Ident, Symbol},
    r#type::TypeId,
    value::Primitive,
};

use self::nested::NestedFilter;
use crate::{
    intern::Interner,
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
        kind::NodeKind,
        r#let::{Binder, Binding, Let, VarId},
        operation::{
            BinaryOperation, InputOperation, Operation, TypeAssertion, TypeConstructor,
            TypeOperation, UnaryOperation,
        },
        thunk::Thunk,
        variable::{LocalVariable, QualifiedVariable, Variable},
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
    /// The residual type (e.g., [`Result<Infallible, E>`] for [`Result<T, E>`]).
    type Residual;
    /// The output type that wraps a transformation.
    ///
    /// Must implement [`Try`], such as [`Result<T, E>`] or [`Option<T>`].
    type Output<T>: Try<Output = T, Residual = Self::Residual> + FromResidual<Self::Residual>
    where
        T: 'heap;

    /// Controls how deeply to process nested nodes.
    type NestedFilter: NestedFilter = nested::Shallow;

    /// Access the interner for re-interning modified structures.
    fn interner(&self) -> &Interner<'heap>;

    fn fold_hir_id(&mut self, id: HirId) -> Self::Output<HirId> {
        Try::from_output(id)
    }

    fn fold_var_id(&mut self, id: VarId) -> Self::Output<VarId> {
        Try::from_output(id)
    }

    fn fold_type_id(&mut self, id: TypeId) -> Self::Output<TypeId> {
        Try::from_output(id)
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

    fn fold_node_data(&mut self, node: NodeData<'heap>) -> Self::Output<NodeData<'heap>> {
        walk_node_data(self, node)
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

    fn fold_primitive(&mut self, primitive: Primitive<'heap>) -> Self::Output<Primitive<'heap>> {
        Try::from_output(primitive)
    }

    fn fold_struct_field(&mut self, field: StructField<'heap>) -> Self::Output<StructField<'heap>> {
        walk_struct_field(self, field)
    }

    /// Fold a struct.
    ///
    /// The caller must ensure that the struct fields do not have duplicate field names.
    fn fold_struct(&mut self, r#struct: Struct<'heap>) -> Self::Output<Struct<'heap>> {
        walk_struct(self, r#struct)
    }

    fn fold_tuple(&mut self, tuple: Tuple<'heap>) -> Self::Output<Tuple<'heap>> {
        walk_tuple(self, tuple)
    }

    fn fold_list(&mut self, list: List<'heap>) -> Self::Output<List<'heap>> {
        walk_list(self, list)
    }

    fn fold_dict(&mut self, dict: Dict<'heap>) -> Self::Output<Dict<'heap>> {
        walk_dict(self, dict)
    }

    fn fold_dict_field(&mut self, field: DictField<'heap>) -> Self::Output<DictField<'heap>> {
        walk_dict_field(self, field)
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

    fn fold_binding(&mut self, binding: Binding<'heap>) -> Self::Output<Binding<'heap>> {
        walk_binding(self, binding)
    }

    fn fold_bindings(
        &mut self,
        bindings: Interned<'heap, [Binding<'heap>]>,
    ) -> Self::Output<Interned<'heap, [Binding<'heap>]>> {
        walk_bindings(self, bindings)
    }

    fn fold_binder(&mut self, binding: Binder<'heap>) -> Self::Output<Binder<'heap>> {
        walk_binder(self, binding)
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

    fn fold_input_operation(
        &mut self,
        operation: InputOperation<'heap>,
    ) -> Self::Output<InputOperation<'heap>> {
        walk_input_operation(self, operation)
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

    fn fold_branch(&mut self, branch: Branch<'heap>) -> Self::Output<Branch<'heap>> {
        walk_branch(self, branch)
    }

    fn fold_if(&mut self, r#if: If<'heap>) -> Self::Output<If<'heap>> {
        walk_if(self, r#if)
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

    fn fold_thunk(&mut self, thunk: Thunk<'heap>) -> Self::Output<Thunk<'heap>> {
        walk_thunk(self, thunk)
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
    node: Node<'heap>,
) -> T::Output<Node<'heap>> {
    let data = visitor.fold_node_data(*node.0)?;
    let node = visitor.interner().intern_node(data);

    Try::from_output(node)
}

pub fn walk_node_data<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    NodeData { id, span, kind }: NodeData<'heap>,
) -> T::Output<NodeData<'heap>> {
    // We don't fold the id, because said id might not be the future id of the interned type
    let id = visitor.fold_hir_id(id)?;
    let span = visitor.fold_span(span)?;

    let kind = match kind {
        NodeKind::Data(data) => NodeKind::Data(visitor.fold_data(data)?),
        NodeKind::Variable(variable) => NodeKind::Variable(visitor.fold_variable(variable)?),
        NodeKind::Let(r#let) => NodeKind::Let(visitor.fold_let(r#let)?),
        NodeKind::Operation(operation) => NodeKind::Operation(visitor.fold_operation(operation)?),
        NodeKind::Access(access) => NodeKind::Access(visitor.fold_access(access)?),
        NodeKind::Call(call) => NodeKind::Call(visitor.fold_call(call)?),
        NodeKind::Branch(branch) => NodeKind::Branch(visitor.fold_branch(branch)?),
        NodeKind::Closure(closure) => NodeKind::Closure(visitor.fold_closure(closure)?),
        NodeKind::Thunk(thunk) => NodeKind::Thunk(visitor.fold_thunk(thunk)?),
        NodeKind::Graph(graph) => NodeKind::Graph(visitor.fold_graph(graph)?),
    };

    let data = NodeData { id, span, kind };
    Try::from_output(data)
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
    data: Data<'heap>,
) -> T::Output<Data<'heap>> {
    let data = match data {
        Data::Primitive(primitive) => Data::Primitive(visitor.fold_primitive(primitive)?),
        Data::Tuple(tuple) => Data::Tuple(visitor.fold_tuple(tuple)?),
        Data::Struct(r#struct) => Data::Struct(visitor.fold_struct(r#struct)?),
        Data::List(list) => Data::List(visitor.fold_list(list)?),
        Data::Dict(dict) => Data::Dict(visitor.fold_dict(dict)?),
    };

    Try::from_output(data)
}

pub fn walk_struct_field<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    StructField { name, value }: StructField<'heap>,
) -> T::Output<StructField<'heap>> {
    let name = visitor.fold_ident(name)?;
    let value = visitor.fold_nested_node(value)?;

    Try::from_output(StructField { name, value })
}

pub fn walk_struct<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    Struct { fields }: Struct<'heap>,
) -> T::Output<Struct<'heap>> {
    let mut fields = Beef::new(fields);
    fields.try_map::<_, T::Output<()>>(|field| visitor.fold_struct_field(field))?;
    let fields = fields.finish_with(|slice| visitor.interner().intern_struct_fields(slice));

    Try::from_output(Struct { fields })
}

pub fn walk_tuple<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    Tuple { fields }: Tuple<'heap>,
) -> T::Output<Tuple<'heap>> {
    let mut fields = Beef::new(fields);
    fields.try_map::<_, T::Output<()>>(|field| visitor.fold_nested_node(field))?;
    let fields = fields.finish(&visitor.interner().nodes);

    Try::from_output(Tuple { fields })
}

pub fn walk_list<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    List { elements }: List<'heap>,
) -> T::Output<List<'heap>> {
    let mut elements = Beef::new(elements);
    elements.try_map::<_, T::Output<()>>(|element| visitor.fold_nested_node(element))?;
    let elements = elements.finish(&visitor.interner().nodes);

    Try::from_output(List { elements })
}

pub fn walk_dict<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    Dict { fields }: Dict<'heap>,
) -> T::Output<Dict<'heap>> {
    let mut fields = Beef::new(fields);
    fields.try_map::<_, T::Output<()>>(|field| visitor.fold_dict_field(field))?;
    let fields = fields.finish(&visitor.interner().dict_fields);

    Try::from_output(Dict { fields })
}

pub fn walk_dict_field<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    DictField { key, value }: DictField<'heap>,
) -> T::Output<DictField<'heap>> {
    let key = visitor.fold_nested_node(key)?;
    let value = visitor.fold_nested_node(value)?;

    Try::from_output(DictField { key, value })
}

pub fn walk_variable<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    variable: Variable<'heap>,
) -> T::Output<Variable<'heap>> {
    let variable = match variable {
        Variable::Local(variable) => Variable::Local(visitor.fold_local_variable(variable)?),
        Variable::Qualified(variable) => {
            Variable::Qualified(visitor.fold_qualified_variable(variable)?)
        }
    };

    Try::from_output(variable)
}

pub fn walk_local_variable<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    LocalVariable { id, arguments }: LocalVariable<'heap>,
) -> T::Output<LocalVariable<'heap>> {
    let id = Spanned {
        span: visitor.fold_span(id.span)?,
        value: visitor.fold_var_id(id.value)?,
    };

    let arguments = visitor.fold_type_ids(arguments)?;

    Try::from_output(LocalVariable { id, arguments })
}

pub fn walk_qualified_variable<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    QualifiedVariable { path, arguments }: QualifiedVariable<'heap>,
) -> T::Output<QualifiedVariable<'heap>> {
    let path = visitor.fold_qualified_path(path)?;
    let arguments = visitor.fold_type_ids(arguments)?;

    Try::from_output(QualifiedVariable { path, arguments })
}

pub fn walk_let<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    Let { bindings, body }: Let<'heap>,
) -> T::Output<Let<'heap>> {
    let bindings = visitor.fold_bindings(bindings)?;
    let body = visitor.fold_nested_node(body)?;

    Try::from_output(Let { bindings, body })
}

pub fn walk_binding<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    Binding {
        span,
        binder,
        value,
    }: Binding<'heap>,
) -> T::Output<Binding<'heap>> {
    let span = visitor.fold_span(span)?;
    let binder = visitor.fold_binder(binder)?;
    let value = visitor.fold_nested_node(value)?;

    Try::from_output(Binding {
        span,
        binder,
        value,
    })
}

pub fn walk_bindings<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    bindings: Interned<'heap, [Binding<'heap>]>,
) -> T::Output<Interned<'heap, [Binding<'heap>]>> {
    if bindings.is_empty() {
        return Try::from_output(bindings);
    }

    let mut bindings = Beef::new(bindings);
    bindings.try_map::<_, T::Output<()>>(|binding| visitor.fold_binding(binding))?;

    Try::from_output(bindings.finish(&visitor.interner().bindings))
}

pub fn walk_binder<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    Binder { id, span, name }: Binder<'heap>,
) -> T::Output<Binder<'heap>> {
    let id = visitor.fold_var_id(id)?;
    let span = visitor.fold_span(span)?;

    let name = if let Some(name) = name {
        Some(visitor.fold_symbol(name)?)
    } else {
        None
    };

    Try::from_output(Binder { id, span, name })
}

pub fn walk_operation<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    operation: Operation<'heap>,
) -> T::Output<Operation<'heap>> {
    let operation = match operation {
        Operation::Type(operation) => Operation::Type(visitor.fold_type_operation(operation)?),
        Operation::Binary(operation) => {
            Operation::Binary(visitor.fold_binary_operation(operation)?)
        }
        Operation::Input(operation) => Operation::Input(visitor.fold_input_operation(operation)?),
    };

    Try::from_output(operation)
}

pub fn walk_type_operation<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    operation: TypeOperation<'heap>,
) -> T::Output<TypeOperation<'heap>> {
    let operation = match operation {
        TypeOperation::Assertion(assertion) => {
            TypeOperation::Assertion(visitor.fold_type_assertion(assertion)?)
        }
        TypeOperation::Constructor(constructor) => {
            TypeOperation::Constructor(visitor.fold_type_constructor(constructor)?)
        }
    };

    Try::from_output(operation)
}

pub fn walk_type_assertion<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    TypeAssertion {
        value,
        r#type,
        force,
    }: TypeAssertion<'heap>,
) -> T::Output<TypeAssertion<'heap>> {
    let value = visitor.fold_nested_node(value)?;
    let r#type = visitor.fold_type_id(r#type)?;

    Try::from_output(TypeAssertion {
        value,
        r#type,
        force,
    })
}

pub fn walk_type_constructor<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    TypeConstructor { name }: TypeConstructor<'heap>,
) -> T::Output<TypeConstructor<'heap>> {
    let name = visitor.fold_symbol(name)?;

    Try::from_output(TypeConstructor { name })
}

pub fn walk_binary_operation<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    BinaryOperation { op, left, right }: BinaryOperation<'heap>,
) -> T::Output<BinaryOperation<'heap>> {
    let op = Spanned {
        span: visitor.fold_span(op.span)?,
        value: op.value,
    };

    let left = visitor.fold_nested_node(left)?;
    let right = visitor.fold_nested_node(right)?;

    Try::from_output(BinaryOperation { op, left, right })
}

pub fn walk_unary_operation<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    UnaryOperation { op, expr }: UnaryOperation<'heap>,
) -> T::Output<UnaryOperation<'heap>> {
    let op = Spanned {
        span: visitor.fold_span(op.span)?,
        value: op.value,
    };

    let expr = visitor.fold_nested_node(expr)?;

    Try::from_output(UnaryOperation { op, expr })
}

pub fn walk_input_operation<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    InputOperation { op, name }: InputOperation<'heap>,
) -> T::Output<InputOperation<'heap>> {
    let op = Spanned {
        span: visitor.fold_span(op.span)?,
        value: op.value,
    };

    let name = visitor.fold_ident(name)?;

    Try::from_output(InputOperation { op, name })
}

pub fn walk_access<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    access: Access<'heap>,
) -> T::Output<Access<'heap>> {
    let access = match access {
        Access::Field(access) => Access::Field(visitor.fold_field_access(access)?),
        Access::Index(access) => Access::Index(visitor.fold_index_access(access)?),
    };

    Try::from_output(access)
}

pub fn walk_field_access<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    FieldAccess { expr, field }: FieldAccess<'heap>,
) -> T::Output<FieldAccess<'heap>> {
    let expr = visitor.fold_nested_node(expr)?;
    let field = visitor.fold_ident(field)?;

    Try::from_output(FieldAccess { expr, field })
}

pub fn walk_index_access<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    IndexAccess { expr, index }: IndexAccess<'heap>,
) -> T::Output<IndexAccess<'heap>> {
    let expr = visitor.fold_nested_node(expr)?;
    let index = visitor.fold_nested_node(index)?;

    Try::from_output(IndexAccess { expr, index })
}

pub fn walk_call<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    Call {
        kind,
        function,
        arguments,
    }: Call<'heap>,
) -> T::Output<Call<'heap>> {
    let function = visitor.fold_nested_node(function)?;
    let arguments = visitor.fold_call_arguments(arguments)?;

    Try::from_output(Call {
        kind,
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

pub fn walk_branch<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    branch: Branch<'heap>,
) -> T::Output<Branch<'heap>> {
    let branch = match branch {
        Branch::If(r#if) => Branch::If(visitor.fold_if(r#if)?),
    };

    Try::from_output(branch)
}

pub fn walk_if<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    If { test, then, r#else }: If<'heap>,
) -> T::Output<If<'heap>> {
    let test = visitor.fold_node(test)?;
    let then = visitor.fold_node(then)?;
    let r#else = visitor.fold_node(r#else)?;

    Try::from_output(If { test, then, r#else })
}

pub fn walk_closure<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    Closure { signature, body }: Closure<'heap>,
) -> T::Output<Closure<'heap>> {
    let signature = visitor.fold_closure_signature(signature)?;
    let body = visitor.fold_node(body)?;

    Try::from_output(Closure { signature, body })
}

pub fn walk_closure_signature<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    ClosureSignature { span, params }: ClosureSignature<'heap>,
) -> T::Output<ClosureSignature<'heap>> {
    let span = visitor.fold_span(span)?;

    let params = visitor.fold_closure_params(params)?;

    Try::from_output(ClosureSignature { span, params })
}

pub fn walk_closure_param<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    ClosureParam { span, name }: ClosureParam<'heap>,
) -> T::Output<ClosureParam<'heap>> {
    let span = visitor.fold_span(span)?;

    let name = visitor.fold_binder(name)?;

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

pub fn walk_thunk<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    Thunk { body }: Thunk<'heap>,
) -> T::Output<Thunk<'heap>> {
    let body = visitor.fold_nested_node(body)?;

    Try::from_output(Thunk { body })
}

pub fn walk_graph<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    graph: Graph<'heap>,
) -> T::Output<Graph<'heap>> {
    let graph = match graph {
        Graph::Read(read) => Graph::Read(visitor.fold_graph_read(read)?),
    };

    Try::from_output(graph)
}

pub fn walk_graph_read<'heap, T: Fold<'heap> + ?Sized>(
    visitor: &mut T,
    GraphRead { head, body, tail }: GraphRead<'heap>,
) -> T::Output<GraphRead<'heap>> {
    let head = visitor.fold_graph_read_head(head)?;
    let body = visitor.fold_graph_read_body(body)?;
    let tail = visitor.fold_graph_read_tail(tail)?;

    Try::from_output(GraphRead { head, body, tail })
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
