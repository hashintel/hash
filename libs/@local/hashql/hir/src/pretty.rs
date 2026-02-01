use core::fmt::Display;
use std::io;

use hashql_core::{
    pretty::{Doc, Formatter, RenderOptions},
    span::SpanId,
    symbol::sym,
    r#type::{TypeFormatter, TypeFormatterOptions, environment::Environment, kind::Generic},
    value::Primitive,
};
use pretty::Pretty as _;

use crate::{
    context::HirContext,
    node::{
        HirPtr, Node,
        access::{Access, FieldAccess, IndexAccess},
        branch::{Branch, If},
        call::{Call, CallArgument},
        closure::{Closure, ClosureSignature, extract_signature, extract_signature_generic},
        data::{Data, Dict, DictField, List, Struct, StructField, Tuple},
        graph::{Graph, GraphRead, GraphReadBody, GraphReadHead, GraphReadTail},
        kind::NodeKind,
        r#let::{Binding, Let},
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

/// Formatting configuration for HIR node pretty-printing.
///
/// Controls how HIR nodes are rendered, including options for nested type formatting.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
pub struct NodeFormatterOptions {
    /// Options for formatting type annotations within nodes.
    pub r#type: TypeFormatterOptions,
}

/// Pretty-printer for HIR (High-level Intermediate Representation) nodes.
///
/// Converts HIR expressions into human-readable formatted output with proper
/// handling of precedence, type annotations, and nested structures.
pub struct NodeFormatter<'fmt, 'env, 'heap> {
    ptr: HirPtr,
    fmt: &'fmt Formatter<'fmt, 'heap>,
    env: &'env Environment<'heap>,

    context: &'env HirContext<'env, 'heap>,
    options: NodeFormatterOptions,

    parent_is_op: bool,
}

impl<'fmt, 'env, 'heap> NodeFormatter<'fmt, 'env, 'heap> {
    /// Creates a new HIR node formatter with specified options.
    ///
    /// Requires a document [`Formatter`] for building output, an [`Environment`]
    /// for resolving types, and a [`HirContext`] for accessing HIR metadata.
    pub const fn new(
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
            parent_is_op: false,
        }
    }

    /// Creates a node formatter with default options.
    ///
    /// Uses default type formatting options and does not resolve substitutions.
    pub fn with_defaults(
        fmt: &'fmt Formatter<'fmt, 'heap>,
        env: &'env Environment<'heap>,

        context: &'env HirContext<'env, 'heap>,
    ) -> Self {
        Self::new(fmt, env, context, NodeFormatterOptions::default())
    }

    /// Formats an HIR node into a document.
    ///
    /// This is the primary entry point for formatting nodes. Returns a [`Doc`]
    /// that can be rendered to various output formats.
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

    /// Renders an HIR node to a displayable string.
    ///
    /// Returns an object implementing [`Display`] which can be printed or
    /// formatted. The rendering applies the specified options for width,
    /// colors, etc.
    pub fn render(
        &mut self,
        node: Node<'heap>,
        options: RenderOptions,
    ) -> impl Display + use<'fmt, 'heap> {
        self.render_node(node, options)
    }

    /// Renders an HIR node directly to a writer.
    ///
    /// # Errors
    ///
    /// Returns [`io::Error`] if writing to the output stream fails.
    pub fn render_into(
        &mut self,
        value: Node<'heap>,
        options: RenderOptions,
        write: &mut impl io::Write,
    ) -> Result<(), io::Error> {
        hashql_core::pretty::render_into(&self.format_node(value), options, write)
    }

    fn format_type_arguments(
        &self,
        arguments: &[hashql_core::span::Spanned<hashql_core::r#type::TypeId>],
    ) -> Doc<'fmt> {
        if arguments.is_empty() {
            return self.fmt.nil();
        }

        let mut type_formatter = TypeFormatter::new(self.fmt, self.env, self.options.r#type);
        let type_docs = arguments
            .iter()
            .map(|spanned| type_formatter.format(spanned.value));
        self.fmt.generic_args(type_docs)
    }

    fn format_type(&self, type_id: hashql_core::r#type::TypeId) -> Doc<'fmt> {
        let mut type_formatter = TypeFormatter::new(self.fmt, self.env, self.options.r#type);
        type_formatter.format(type_id)
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &NodeKind<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
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

impl<'fmt, 'heap> FormatNode<'fmt, Node<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(&mut self, node: Node<'heap>) -> Doc<'fmt> {
        let previous = self.ptr;
        self.ptr = node.ptr();
        let prev_parent_is_op = self.parent_is_op;
        self.parent_is_op = matches!(node.kind, NodeKind::Operation(_));

        let mut doc = self.format_node(&node.kind);

        if self.parent_is_op && prev_parent_is_op {
            doc = doc.parens();
        }

        self.ptr = previous;
        self.parent_is_op = prev_parent_is_op;
        doc
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &Data<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
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

impl<'fmt, 'heap> FormatNode<'fmt, &Struct<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(&mut self, Struct { fields }: &Struct<'heap>) -> Doc<'fmt> {
        let fmt = self.fmt;

        let fields = fields.iter().map(|StructField { name, value }| {
            (self.fmt.field(name.value), self.format_node(*value))
        });

        fmt.r#struct(fields)
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &Dict<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(&mut self, Dict { fields }: &Dict<'heap>) -> Doc<'fmt> {
        let fmt = self.fmt;

        let pairs = fields
            .iter()
            .map(|&DictField { key, value }| (self.format_node(key), self.format_node(value)));

        fmt.dict(pairs)
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &Tuple<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(&mut self, Tuple { fields }: &Tuple<'heap>) -> Doc<'fmt> {
        let fmt = self.fmt;

        let elements = fields.iter().map(|&element| self.format_node(element));

        fmt.tuple(elements)
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &List<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(&mut self, List { elements }: &List<'heap>) -> Doc<'fmt> {
        let fmt = self.fmt;

        let elements = elements.iter().map(|&element| self.format_node(element));

        fmt.list(elements)
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &Primitive<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(&mut self, node: &Primitive<'heap>) -> Doc<'fmt> {
        match node {
            Primitive::Null => self.fmt.literal(sym::null),
            Primitive::Boolean(true) => self.fmt.literal(sym::r#true),
            Primitive::Boolean(false) => self.fmt.literal(sym::r#false),
            Primitive::Float(float) => self.fmt.literal(float.as_symbol()),
            Primitive::Integer(integer) => self.fmt.literal(integer.as_symbol()),
            Primitive::String(string) => {
                let escaped = format!("\"{}\"", string.as_str().escape_default());
                self.fmt.literal_str(escaped)
            }
        }
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &Variable<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(&mut self, node: &Variable<'heap>) -> Doc<'fmt> {
        match node {
            Variable::Local(local_variable) => self.format_node(local_variable),
            Variable::Qualified(qualified_variable) => self.format_node(qualified_variable),
        }
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &LocalVariable<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(
        &mut self,
        node @ LocalVariable { id: _, arguments }: &LocalVariable<'heap>,
    ) -> Doc<'fmt> {
        let name = self
            .fmt
            .variable_owned(node.name(&self.context.symbols).to_string());

        if arguments.is_empty() {
            name
        } else {
            // Format as: name<Type1, Type2>
            name.append(self.format_type_arguments(arguments))
        }
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &QualifiedVariable<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(
        &mut self,
        QualifiedVariable { path, arguments }: &QualifiedVariable<'heap>,
    ) -> Doc<'fmt> {
        // Format as: ::path::to::var<TypeArgs>
        self.fmt
            .punct(sym::symbol::coloncolon)
            .append(self.fmt.intersperse(
                path.0.iter().map(|ident| self.fmt.variable(ident.value)),
                self.fmt.punct(sym::symbol::coloncolon),
            ))
            .append(self.format_type_arguments(arguments))
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &Let<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(&mut self, Let { bindings, body }: &Let<'heap>) -> Doc<'fmt> {
        let fmt = self.fmt;

        // Format as: let foo = ..., bar = ... in body
        let r#let = self.fmt.keyword(sym::r#let);
        let r#in = self.fmt.keyword(sym::r#in);

        let bindings = bindings.iter().map(|binding| self.format_node(binding));
        let bindings = fmt.intersperse(
            bindings,
            fmt.punct(sym::symbol::comma).append(fmt.hardline()),
        );

        let body = self.format_node(*body);

        r#let
            .append(self.fmt.space())
            .append(bindings.nest(self.fmt.options.indent))
            .append(self.fmt.line())
            .append(r#in)
            .append(self.fmt.line())
            .append(body)
            .group()
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &Binding<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(
        &mut self,
        Binding {
            span: _,
            binder,
            value,
        }: &Binding<'heap>,
    ) -> Doc<'fmt> {
        let name_doc = self.fmt.variable_owned(binder.mangled().to_string());
        let mut value_doc = self.format_node(*value);

        // Check if the value is a closure of thunk, in that case do not nest additionally
        if !matches!(value.kind, NodeKind::Thunk(_) | NodeKind::Closure(_)) {
            value_doc = value_doc.align().nest(self.fmt.options.indent);
        }

        name_doc
            .append(self.fmt.space())
            .append(self.fmt.punct(sym::symbol::eq))
            .append(self.fmt.space())
            .append(value_doc)
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &Operation<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(&mut self, node: &Operation<'heap>) -> Doc<'fmt> {
        match node {
            Operation::Type(type_operation) => self.format_node(type_operation),
            Operation::Binary(binary_operation) => self.format_node(binary_operation),
            Operation::Unary(unary_operation, _) => self.format_node(unary_operation),
            Operation::Input(input_operation) => self.format_node(input_operation),
        }
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &TypeOperation<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(&mut self, node: &TypeOperation<'heap>) -> Doc<'fmt> {
        match node {
            TypeOperation::Assertion(type_assertion) => self.format_node(type_assertion),
            TypeOperation::Constructor(type_constructor) => self.format_node(type_constructor),
        }
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &TypeAssertion<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(
        &mut self,
        TypeAssertion {
            value,
            r#type,
            force,
        }: &TypeAssertion<'heap>,
    ) -> Doc<'fmt> {
        // Format as: value as Type (non-forcing) or value as! Type (forcing)
        let value = self.format_node(*value);
        let r#type = self.format_type(*r#type);

        let op = if *force { sym::r#as_force } else { sym::r#as };

        value
            .append(self.fmt.space())
            .append(self.fmt.op(op))
            .append(self.fmt.space())
            .append(r#type)
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &TypeConstructor<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(&mut self, TypeConstructor { name }: &TypeConstructor<'heap>) -> Doc<'fmt> {
        // Type constructors are like variables in representation
        self.fmt.type_name(*name)
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &BinaryOperation<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(
        &mut self,
        BinaryOperation { op, left, right }: &BinaryOperation<'heap>,
    ) -> Doc<'fmt> {
        // Format as: left op right
        let left = self.format_node(*left);
        let right = self.format_node(*right);

        left.append(self.fmt.space())
            .append(self.fmt.op(op.value.as_symbol()))
            .append(self.fmt.space())
            .append(right)
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &UnaryOperation<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(&mut self, UnaryOperation { op, expr }: &UnaryOperation<'heap>) -> Doc<'fmt> {
        // Format as: op expr (no space for prefix unary operators)
        let expr = self.format_node(*expr);

        self.fmt.op(op.as_symbol()).append(expr)
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &InputOperation<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(&mut self, InputOperation { op, name }: &InputOperation<'heap>) -> Doc<'fmt> {
        use crate::node::operation::InputOp;

        match op.value {
            InputOp::Load { required } => {
                // Format as: $name or $?name (for optional)
                let prefix = if required {
                    sym::symbol::dollar
                } else {
                    sym::symbol::question_mark
                };

                self.fmt.op(prefix).append(self.fmt.variable(name.value))
            }
            InputOp::Exists => {
                // Format as: $exists(name)
                let keyword = self.fmt.keyword(sym::input_exists);
                let name = self.fmt.variable(name.value);

                keyword.append(self.fmt.parens(name))
            }
        }
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &Access<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(&mut self, node: &Access<'heap>) -> Doc<'fmt> {
        match node {
            Access::Field(field_access) => self.format_node(field_access),
            Access::Index(index_access) => self.format_node(index_access),
        }
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &FieldAccess<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(&mut self, FieldAccess { expr, field }: &FieldAccess<'heap>) -> Doc<'fmt> {
        // Format as: expr.field
        let expr = self.format_node(*expr);

        expr.append(self.fmt.punct(sym::symbol::dot))
            .append(self.fmt.field(field.value))
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &IndexAccess<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(&mut self, IndexAccess { expr, index }: &IndexAccess<'heap>) -> Doc<'fmt> {
        // Format as: expr[index]
        let expr = self.format_node(*expr);
        let index = self.format_node(*index);

        expr.append(self.fmt.brackets(index))
    }
}

fn format_call<'fmt, 'heap>(
    formatter: &mut NodeFormatter<'fmt, '_, 'heap>,
    function: Doc<'fmt>,
    arguments: &[CallArgument<'heap>],
) -> Doc<'fmt> {
    let fmt = formatter.fmt;

    // If we have a *single* argument, and that argument is a closure, then we use a different
    // indentation scheme
    let arguments = if let [argument] = arguments
        && let NodeKind::Closure(_) = argument.value.kind
    {
        let closure = formatter.format_node(argument.value);

        // If this is the case, we format the first line always on the same line (the signature)
        // and do not indent the contents
        fmt.enclosed("(", closure.append(fmt.line_()), ")").group()
    } else {
        fmt.delimited(
            "(",
            arguments
                .iter()
                .map(|CallArgument { span: _, value }| formatter.format_node(*value)),
            ")",
        )
    };

    // Format as: function(arg1, arg2, ...)
    // The kind (Fat/Thin) is an internal detail and not shown in the pretty output
    function.append(arguments)
}

impl<'fmt, 'heap> FormatNode<'fmt, &Call<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(
        &mut self,
        Call {
            kind: _,
            function,
            arguments,
        }: &Call<'heap>,
    ) -> Doc<'fmt> {
        let function = self.format_node(*function);

        format_call(self, function, arguments)
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &Branch<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(&mut self, node: &Branch<'heap>) -> Doc<'fmt> {
        match node {
            Branch::If(r#if) => self.format_node(r#if),
        }
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &If<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(&mut self, &If { test, then, r#else }: &If<'heap>) -> Doc<'fmt> {
        // Format as: if test then branch else branch
        // Compact: if test then value1 else value2
        // Expanded: if test
        //           then
        //               value1
        //           else
        //               value2
        let if_keyword = self.fmt.keyword(sym::r#if);
        let then_keyword = self.fmt.keyword(sym::then).into_doc();
        let else_keyword = self.fmt.keyword(sym::r#else).into_doc();

        let test_doc = self.format_node(test).into_doc();
        let then_doc = self.format_node(then).into_doc();
        let else_doc = self.format_node(r#else).into_doc();

        let flat = if_keyword
            .clone()
            .append(self.fmt.space())
            .append(test_doc)
            .append(self.fmt.space())
            .append(then_keyword)
            .append(self.fmt.space())
            .append(then_doc)
            .append(self.fmt.space())
            .append(else_keyword)
            .append(self.fmt.space())
            .append(else_doc)
            .group();

        let expanded = if_keyword
            .append(self.fmt.space())
            .append(test_doc)
            .append(self.fmt.line())
            .group()
            .append(self.fmt.hardline())
            .append(
                then_keyword
                    .pretty(self.fmt.arena())
                    .append(self.fmt.line())
                    .append(then_doc)
                    .nest(self.fmt.options.indent)
                    .group(),
            )
            .append(self.fmt.hardline())
            .append(
                else_keyword
                    .pretty(self.fmt.arena())
                    .append(self.fmt.line())
                    .append(else_doc)
                    .nest(self.fmt.options.indent)
                    .group(),
            )
            .group();

        expanded.flat_alt(flat)
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &Closure<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(
        &mut self,
        Closure {
            signature: ClosureSignature { span: _, params },
            body,
        }: &Closure<'heap>,
    ) -> Doc<'fmt> {
        let fmt = self.fmt;

        // Get the type of the closure from the context
        let closure_type_id = self.context.map.type_id(self.ptr.id);

        // Extract generic parameters and closure signature
        let generic_params = extract_signature_generic(closure_type_id, self.env);
        let closure_sig = extract_signature(closure_type_id, self.env);

        // Format generic parameters: <T, U>
        let generics_doc = if let Some(Generic { base: _, arguments }) = generic_params {
            let mut type_formatter = TypeFormatter::new(self.fmt, self.env, self.options.r#type);

            let arguments = arguments
                .iter()
                .map(|&argument| type_formatter.format_generic_argument(argument));
            self.fmt.generic_args(arguments)
        } else {
            self.fmt.nil()
        };

        // Format parameters: (a: T, b: U)
        let param_docs =
            params
                .iter()
                .zip(closure_sig.params.iter())
                .map(|(param, &param_type)| {
                    let name = self
                        .fmt
                        .variable(self.context.symbols.binder[param.name.id]);
                    let type_doc = self.format_type(param_type);
                    self.fmt.field_type(name, type_doc)
                });
        let params_doc = fmt.delimited("(", param_docs, ")");

        // Format return type: : ReturnType
        let return_type_doc = self
            .fmt
            .punct(sym::symbol::colon)
            .append(self.fmt.space())
            .append(self.format_type(closure_sig.returns));

        // Format body
        let body_doc = self.format_node(*body);

        // Format as: <T, U>(a: T, b: U): ReturnType -> body
        // Group the signature together, body can break independently
        let arrow = self.fmt.op(sym::symbol::arrow);
        let signature = generics_doc
            .append(params_doc)
            .append(return_type_doc)
            .group();

        signature.append(self.fmt.space()).append(arrow).append(
            self.fmt
                .line()
                .append(body_doc)
                .nest(self.fmt.options.indent)
                .group(),
        )
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &Thunk<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(&mut self, Thunk { body }: &Thunk<'heap>) -> Doc<'fmt> {
        // Format thunks differently from closures using the thunk keyword
        // Format as: thunk -> body
        let keyword = self.fmt.keyword(sym::thunk);
        let arrow = self.fmt.op(sym::symbol::arrow);
        let body_doc = self.format_node(*body);

        keyword.append(self.fmt.space()).append(arrow).append(
            self.fmt
                .line()
                .append(body_doc)
                .nest(self.fmt.options.indent)
                .group(),
        )
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &Graph<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(&mut self, node: &Graph<'heap>) -> Doc<'fmt> {
        match node {
            Graph::Read(read) => self.format_node(read),
        }
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &GraphRead<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(&mut self, GraphRead { head, body, tail }: &GraphRead<'heap>) -> Doc<'fmt> {
        // Format as a pipeline: head | body operations | tail
        let mut doc = self.format_node(head);

        // Add body operations with pipe operator
        for operation in body {
            let pipe = self.fmt.op(sym::symbol::arrow_head);
            let op_doc = self.format_node(operation);
            doc = doc
                .append(self.fmt.line())
                .append(pipe)
                .append(self.fmt.space())
                .append(op_doc);
        }

        // Add tail operation
        let pipe = self.fmt.op(sym::symbol::arrow_head);
        let tail_doc = self.format_node(*tail);
        doc.append(self.fmt.line())
            .append(pipe)
            .append(self.fmt.space())
            .append(tail_doc)
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &GraphReadHead<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(&mut self, node: &GraphReadHead<'heap>) -> Doc<'fmt> {
        match node {
            GraphReadHead::Entity { axis } => {
                // Format as: entity(axis)
                let keyword = self.fmt.keyword(sym::path::graph_head_entities);
                let axis = self.format_node(*axis);
                keyword.append(self.fmt.parens(axis))
            }
        }
    }
}

impl<'fmt, 'heap> FormatNode<'fmt, &GraphReadBody<'heap>> for NodeFormatter<'fmt, '_, 'heap> {
    fn format_node(&mut self, node: &GraphReadBody<'heap>) -> Doc<'fmt> {
        match node {
            GraphReadBody::Filter(closure) => {
                // Format as: filter(closure)
                let keyword = self.fmt.keyword(sym::path::graph_body_filter);

                format_call(
                    self,
                    keyword,
                    &[CallArgument {
                        span: SpanId::SYNTHETIC,
                        value: *closure,
                    }],
                )
            }
        }
    }
}

impl<'fmt> FormatNode<'fmt, GraphReadTail> for NodeFormatter<'fmt, '_, '_> {
    fn format_node(&mut self, node: GraphReadTail) -> Doc<'fmt> {
        match node {
            GraphReadTail::Collect => {
                // Format as: collect
                self.fmt.keyword(sym::path::graph_tail_collect)
            }
        }
    }
}
