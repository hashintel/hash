use core::fmt::Display;
use std::io;

use hashql_core::{
    pretty::{Doc, Formatter, RenderOptions},
    r#type::{TypeFormatterOptions, environment::Environment},
    value::Primitive,
};

use crate::{
    context::HirContext,
    node::{
        HirPtr, Node,
        access::{Access, FieldAccess, IndexAccess},
        branch::{Branch, If},
        call::Call,
        closure::{Closure, ClosureSignature},
        data::{Data, Dict, List, Struct, Tuple},
        graph::{Graph, GraphRead, GraphReadBody, GraphReadHead, GraphReadTail},
        kind::NodeKind,
        r#let::{Binder, Binding, Let},
        operation::{
            BinaryOperation, InputOperation, Operation, TypeAssertion, TypeConstructor,
            TypeOperation, UnaryOperation,
        },
        thunk::Thunk,
        variable::{LocalVariable, QualifiedVariable, Variable},
    },
};

pub(crate) trait FormatNode<'fmt, T> {
    fn format_node(&mut self, node: T) -> Doc<'fmt>;
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
pub struct NodeFormatterOptions {
    pub r#type: TypeFormatterOptions,
}

pub struct NodeFormatter<'fmt, 'env, 'heap> {
    ptr: HirPtr,
    fmt: &'fmt Formatter<'fmt, 'heap>,
    env: &'env Environment<'heap>,

    context: &'env HirContext<'env, 'heap>,
    options: NodeFormatterOptions,
}

impl<'fmt, 'env, 'heap> NodeFormatter<'fmt, 'env, 'heap> {
    pub fn new(
        fmt: &'fmt Formatter<'fmt, 'heap>,
        env: &'env Environment<'heap>,

        context: &'env HirContext<'env, 'heap>,
        options: NodeFormatterOptions,
    ) -> Self {
        Self {
            ptr: HirPtr::PLACEHOLDER,
            fmt,
            env,

            context,
            options,
        }
    }

    pub fn with_defaults(
        fmt: &'fmt Formatter<'fmt, 'heap>,
        env: &'env Environment<'heap>,

        context: &'env HirContext<'env, 'heap>,
    ) -> Self {
        Self::new(fmt, env, context, NodeFormatterOptions::default())
    }

    pub fn format(&mut self, value: Node<'heap>) -> Doc<'fmt> {
        self.format_node(value)
    }

    pub(crate) fn render_node<T>(
        &mut self,
        value: T,
        options: RenderOptions,
    ) -> impl Display + use<'fmt, T>
    where
        Self: FormatNode<'fmt, T>,
    {
        hashql_core::pretty::render(self.format_node(value), options)
    }

    pub fn render(
        &mut self,
        node: Node<'heap>,
        options: RenderOptions,
    ) -> impl Display + use<'fmt, 'heap> {
        self.render_node(node, options)
    }

    pub fn render_into(
        &mut self,
        value: Node<'heap>,
        options: RenderOptions,
        write: &mut impl io::Write,
    ) -> Result<(), io::Error> {
        hashql_core::pretty::render_into(&self.format_node(value), options, write)
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &NodeKind<'heap>> for NodeFormatter<'fmt, 'env, 'heap> {
    fn format_node(&mut self, node: &NodeKind<'heap>) -> Doc<'fmt> {
        match node {
            NodeKind::Data(data) => self.format_node(data),
            NodeKind::Variable(variable) => self.format_node(variable),
            NodeKind::Let(r#let) => self.format_node(r#let),
            NodeKind::Operation(operation) => self.format_node(operation),
            NodeKind::Access(access) => self.format_node(access),
            NodeKind::Call(call) => self.format_node(call),
            NodeKind::Branch(branch) => self.format_node(branch),
            NodeKind::Closure(closure) => self.format_node(closure),
            NodeKind::Thunk(thunk) => self.format_node(thunk),
            NodeKind::Graph(graph) => self.format_node(graph),
        }
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, Node<'heap>> for NodeFormatter<'fmt, 'env, 'heap> {
    fn format_node(&mut self, node: Node<'heap>) -> Doc<'fmt> {
        let previous = self.ptr;
        self.ptr = node.ptr();

        let doc = self.format_node(&node.kind);

        self.ptr = previous;
        doc
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &Data<'heap>> for NodeFormatter<'fmt, 'env, 'heap> {
    fn format_node(&mut self, node: &Data<'heap>) -> Doc<'fmt> {
        match node {
            Data::Struct(r#struct) => self.format_node(r#struct),
            Data::Dict(dict) => self.format_node(dict),
            Data::Tuple(tuple) => self.format_node(tuple),
            Data::List(list) => self.format_node(list),
            Data::Primitive(primitive) => self.format_node(primitive),
        }
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &Struct<'heap>> for NodeFormatter<'fmt, 'env, 'heap> {
    fn format_node(&mut self, node: &Struct<'heap>) -> Doc<'fmt> {
        todo!()
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &Dict<'heap>> for NodeFormatter<'fmt, 'env, 'heap> {
    fn format_node(&mut self, node: &Dict<'heap>) -> Doc<'fmt> {
        todo!()
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &Tuple<'heap>> for NodeFormatter<'fmt, 'env, 'heap> {
    fn format_node(&mut self, node: &Tuple<'heap>) -> Doc<'fmt> {
        todo!()
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &List<'heap>> for NodeFormatter<'fmt, 'env, 'heap> {
    fn format_node(&mut self, node: &List<'heap>) -> Doc<'fmt> {
        todo!()
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &Primitive<'heap>> for NodeFormatter<'fmt, 'env, 'heap> {
    fn format_node(&mut self, node: &Primitive<'heap>) -> Doc<'fmt> {
        match node {
            Primitive::Null => todo!(),
            Primitive::Boolean(_) => todo!(),
            Primitive::Float(float) => todo!(),
            Primitive::Integer(integer) => todo!(),
            Primitive::String(_) => todo!(),
        }
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &Variable<'heap>> for NodeFormatter<'fmt, 'env, 'heap> {
    fn format_node(&mut self, node: &Variable<'heap>) -> Doc<'fmt> {
        match node {
            Variable::Local(local_variable) => self.format_node(local_variable),
            Variable::Qualified(qualified_variable) => self.format_node(qualified_variable),
        }
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &LocalVariable<'heap>>
    for NodeFormatter<'fmt, 'env, 'heap>
{
    fn format_node(&mut self, LocalVariable { id, arguments }: &LocalVariable<'heap>) -> Doc<'fmt> {
        todo!()
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &QualifiedVariable<'heap>>
    for NodeFormatter<'fmt, 'env, 'heap>
{
    fn format_node(
        &mut self,
        QualifiedVariable { path, arguments }: &QualifiedVariable<'heap>,
    ) -> Doc<'fmt> {
        todo!()
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &Let<'heap>> for NodeFormatter<'fmt, 'env, 'heap> {
    fn format_node(&mut self, Let { bindings, body }: &Let<'heap>) -> Doc<'fmt> {
        todo!()
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &Binding<'heap>> for NodeFormatter<'fmt, 'env, 'heap> {
    fn format_node(
        &mut self,
        Binding {
            span,
            binder: Binder { id, span: _, name },
            value,
        }: &Binding<'heap>,
    ) -> Doc<'fmt> {
        todo!()
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &Operation<'heap>> for NodeFormatter<'fmt, 'env, 'heap> {
    fn format_node(&mut self, node: &Operation<'heap>) -> Doc<'fmt> {
        match node {
            Operation::Type(type_operation) => self.format_node(type_operation),
            Operation::Binary(binary_operation) => self.format_node(binary_operation),
            Operation::Unary(unary_operation, _) => self.format_node(unary_operation),
            Operation::Input(input_operation) => self.format_node(input_operation),
        }
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &TypeOperation<'heap>>
    for NodeFormatter<'fmt, 'env, 'heap>
{
    fn format_node(&mut self, node: &TypeOperation<'heap>) -> Doc<'fmt> {
        match node {
            TypeOperation::Assertion(type_assertion) => self.format_node(type_assertion),
            TypeOperation::Constructor(type_constructor) => self.format_node(type_constructor),
        }
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &TypeAssertion<'heap>>
    for NodeFormatter<'fmt, 'env, 'heap>
{
    fn format_node(
        &mut self,
        TypeAssertion {
            value,
            r#type,
            force,
        }: &TypeAssertion<'heap>,
    ) -> Doc<'fmt> {
        todo!()
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &TypeConstructor<'heap>>
    for NodeFormatter<'fmt, 'env, 'heap>
{
    fn format_node(&mut self, TypeConstructor { name }: &TypeConstructor<'heap>) -> Doc<'fmt> {
        // same as a variable really in it's representation and how it works
        todo!()
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &BinaryOperation<'heap>>
    for NodeFormatter<'fmt, 'env, 'heap>
{
    fn format_node(
        &mut self,
        BinaryOperation { op, left, right }: &BinaryOperation<'heap>,
    ) -> Doc<'fmt> {
        todo!()
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &UnaryOperation<'heap>>
    for NodeFormatter<'fmt, 'env, 'heap>
{
    fn format_node(&mut self, UnaryOperation { op, expr }: &UnaryOperation<'heap>) -> Doc<'fmt> {
        todo!()
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &InputOperation<'heap>>
    for NodeFormatter<'fmt, 'env, 'heap>
{
    fn format_node(&mut self, InputOperation { op, name }: &InputOperation<'heap>) -> Doc<'fmt> {
        todo!()
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &Access<'heap>> for NodeFormatter<'fmt, 'env, 'heap> {
    fn format_node(&mut self, node: &Access<'heap>) -> Doc<'fmt> {
        match node {
            Access::Field(field_access) => self.format_node(field_access),
            Access::Index(index_access) => self.format_node(index_access),
        }
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &FieldAccess<'heap>> for NodeFormatter<'fmt, 'env, 'heap> {
    fn format_node(&mut self, FieldAccess { expr, field }: &FieldAccess<'heap>) -> Doc<'fmt> {
        todo!()
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &IndexAccess<'heap>> for NodeFormatter<'fmt, 'env, 'heap> {
    fn format_node(&mut self, IndexAccess { expr, index }: &IndexAccess<'heap>) -> Doc<'fmt> {
        todo!()
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &Call<'heap>> for NodeFormatter<'fmt, 'env, 'heap> {
    fn format_node(
        &mut self,
        Call {
            kind,
            function,
            arguments,
        }: &Call<'heap>,
    ) -> Doc<'fmt> {
        todo!()
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &Branch<'heap>> for NodeFormatter<'fmt, 'env, 'heap> {
    fn format_node(&mut self, node: &Branch<'heap>) -> Doc<'fmt> {
        match node {
            Branch::If(r#if) => todo!(),
        }
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &If<'heap>> for NodeFormatter<'fmt, 'env, 'heap> {
    fn format_node(&mut self, If { test, then, r#else }: &If<'heap>) -> Doc<'fmt> {
        todo!()
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &Closure<'heap>> for NodeFormatter<'fmt, 'env, 'heap> {
    fn format_node(
        &mut self,
        Closure {
            signature: ClosureSignature { span: _, params },
            body,
        }: &Closure<'heap>,
    ) -> Doc<'fmt> {
        todo!()
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &Thunk<'heap>> for NodeFormatter<'fmt, 'env, 'heap> {
    fn format_node(&mut self, Thunk { body }: &Thunk<'heap>) -> Doc<'fmt> {
        todo!()
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &Graph<'heap>> for NodeFormatter<'fmt, 'env, 'heap> {
    fn format_node(&mut self, node: &Graph<'heap>) -> Doc<'fmt> {
        match node {
            Graph::Read(read) => self.format_node(read),
        }
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &GraphRead<'heap>> for NodeFormatter<'fmt, 'env, 'heap> {
    fn format_node(&mut self, GraphRead { head, body, tail }: &GraphRead<'heap>) -> Doc<'fmt> {
        todo!()
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &GraphReadHead<'heap>>
    for NodeFormatter<'fmt, 'env, 'heap>
{
    fn format_node(&mut self, node: &GraphReadHead<'heap>) -> Doc<'fmt> {
        match node {
            GraphReadHead::Entity { axis } => todo!(),
        }
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, &GraphReadBody<'heap>>
    for NodeFormatter<'fmt, 'env, 'heap>
{
    fn format_node(&mut self, node: &GraphReadBody<'heap>) -> Doc<'fmt> {
        match node {
            GraphReadBody::Filter(closure) => todo!(),
        }
    }
}

impl<'fmt, 'env, 'heap> FormatNode<'fmt, GraphReadTail> for NodeFormatter<'fmt, 'env, 'heap> {
    fn format_node(&mut self, node: GraphReadTail) -> Doc<'fmt> {
        match node {
            GraphReadTail::Collect => todo!(),
        }
    }
}
