use alloc::borrow::Cow;
use core::cmp;

use hashql_core::{
    module::locals::TypeDef,
    pretty::{PrettyOptions, PrettyPrint, PrettyPrintBoundary},
    span::Spanned,
    r#type::{TypeId, environment::Environment},
    value::Primitive,
};
use hashql_diagnostics::color::Style;
use pretty::{DocAllocator as _, RcAllocator, RcDoc};

use crate::{
    context::SymbolRegistry,
    map::HirMap,
    node::{
        HirId, NodeData,
        access::{Access, FieldAccess, IndexAccess},
        branch::{Branch, If},
        call::Call,
        closure::Closure,
        data::{Data, Dict, DictField, List, Struct, StructField, Tuple},
        graph::{
            Graph,
            read::{GraphRead, GraphReadBody, GraphReadHead, GraphReadTail},
        },
        input::Input,
        kind::NodeKind,
        r#let::{Binding, Let},
        operation::{BinaryOperation, Operation, TypeAssertion, TypeConstructor, TypeOperation},
        thunk::Thunk,
        variable::{LocalVariable, QualifiedVariable, Variable},
    },
    path::QualifiedPath,
};

pub struct PrettyPrintEnvironment<'env, 'heap> {
    pub env: &'env Environment<'heap>,
    pub symbols: &'env SymbolRegistry<'heap>,
    pub map: &'env HirMap<'heap>,
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>> for Primitive<'heap> {
    fn pretty(
        &self,
        _: &PrettyPrintEnvironment<'env, 'heap>,
        _: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        match self {
            Primitive::Null => RcDoc::text("null"),
            Primitive::Boolean(true) => RcDoc::text("true"),
            Primitive::Boolean(false) => RcDoc::text("false"),
            Primitive::Float(float_literal) => RcDoc::text(float_literal.as_symbol().unwrap()),
            Primitive::Integer(integer_literal) => {
                RcDoc::text(integer_literal.as_symbol().unwrap())
            }
            Primitive::String(string_literal) => {
                RcDoc::text(format!(r#""{}""#, string_literal.as_str().escape_debug()))
            }
        }
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>> for Tuple<'heap> {
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        if self.fields.is_empty() {
            return RcDoc::text("()");
        }

        if self.fields.len() == 1 {
            return RcDoc::text("(")
                .append(self.fields[0].pretty(env, boundary))
                .append(RcDoc::text(","))
                .append(RcDoc::text(")"));
        }

        RcAllocator
            .intersperse(
                self.fields.iter().map(|field| field.pretty(env, boundary)),
                RcDoc::text(",").append(RcDoc::softline()),
            )
            .nest(2)
            .group()
            .parens()
            .group()
            .into_doc()
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>> for StructField<'heap> {
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        RcDoc::text(self.name.value.unwrap())
            .append(RcDoc::text(":"))
            .append(RcDoc::line())
            .append(self.value.pretty(env, boundary))
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>> for Struct<'heap> {
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        if self.fields.is_empty() {
            return RcDoc::text("(:)");
        }

        RcAllocator
            .intersperse(
                self.fields.iter().map(|field| field.pretty(env, boundary)),
                RcDoc::text(",").append(RcDoc::softline()),
            )
            .nest(2)
            .group()
            .parens()
            .group()
            .into_doc()
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>> for List<'heap> {
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        RcAllocator
            .intersperse(
                self.elements
                    .iter()
                    .map(|element| element.pretty(env, boundary)),
                RcDoc::text(",").append(RcDoc::softline()),
            )
            .nest(2)
            .group()
            .brackets()
            .group()
            .into_doc()
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>> for DictField<'heap> {
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        self.key
            .pretty(env, boundary)
            .append(RcDoc::text(":"))
            .append(RcDoc::space())
            .append(self.value.pretty(env, boundary))
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>> for Dict<'heap> {
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        RcAllocator
            .intersperse(
                self.fields.iter().map(|field| field.pretty(env, boundary)),
                RcDoc::text(",").append(RcDoc::softline()),
            )
            .nest(2)
            .group()
            .braces()
            .group()
            .into_doc()
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>> for Data<'heap> {
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        match &self {
            Self::Primitive(primitive) => primitive.pretty(env, boundary),
            Self::Tuple(tuple) => tuple.pretty(env, boundary),
            Self::Struct(r#struct) => r#struct.pretty(env, boundary),
            Self::List(list) => list.pretty(env, boundary),
            Self::Dict(dict) => dict.pretty(env, boundary),
        }
    }
}

fn pretty_print_config() -> PrettyOptions {
    PrettyOptions::default()
        .with_identity_tracking()
        .with_recursion_limit(Some(32))
        .with_resolve_substitutions(true)
}

fn pretty_print_type_id<'heap>(id: TypeId, env: &Environment<'heap>) -> RcDoc<'heap, Style> {
    let mut boundary = PrettyPrintBoundary::new(pretty_print_config());

    boundary.pretty_type(env, id)
}

fn pretty_print_arguments<'heap>(
    ids: &[Spanned<TypeId>],
    env: &Environment<'heap>,
) -> RcDoc<'heap, Style> {
    if ids.is_empty() {
        return RcDoc::nil();
    }

    let mut boundary = PrettyPrintBoundary::new(pretty_print_config());

    RcAllocator
        .intersperse(
            ids.iter()
                .map(|&Spanned { value: id, .. }| boundary.pretty_type(env, id)),
            RcDoc::text(",").append(RcDoc::softline()),
        )
        .nest(1)
        .group()
        .angles()
        .group()
        .into_doc()
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>> for LocalVariable<'heap> {
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        _: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        let name = env.symbols.binder.get(self.id.value).map_or_else(
            || Cow::Owned(self.to_binder(env.symbols).mangled().to_string()),
            |name| Cow::Borrowed(name.unwrap()),
        );

        RcDoc::text(name)
            .append(pretty_print_arguments(&self.arguments, env.env))
            .group()
    }
}

impl<'heap, E> PrettyPrint<'heap, E> for QualifiedPath<'heap> {
    fn pretty(&self, _: &E, _: &mut PrettyPrintBoundary) -> RcDoc<'heap, Style> {
        RcDoc::text("::")
            .append(RcDoc::intersperse(
                self.0.iter().map(|ident| RcDoc::text(ident.value.unwrap())),
                RcDoc::text("::"),
            ))
            .group()
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>>
    for QualifiedVariable<'heap>
{
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        self.path
            .pretty(env, boundary)
            .append(pretty_print_arguments(&self.arguments, env.env))
            .group()
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>> for Variable<'heap> {
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        match self {
            Self::Local(local) => local.pretty(env, boundary),
            Self::Qualified(qualified) => qualified.pretty(env, boundary),
        }
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>> for Binding<'heap> {
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        RcDoc::text(self.binder.mangled().to_string())
            .append(RcDoc::space())
            .append(RcDoc::text("="))
            .append(RcDoc::space())
            .append(self.value.pretty(env, boundary).nest(4))
            .group()
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>> for Let<'heap> {
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        RcDoc::text("#let")
            .append(RcDoc::space())
            .append(RcDoc::intersperse(
                self.bindings.iter().enumerate().map(|(index, binding)| {
                    RcAllocator
                        .nil()
                        .append(binding.pretty(env, boundary))
                        .indent(cmp::min(index, 1) * 5)
                }),
                RcDoc::hardline(),
            ))
            .append(RcDoc::line())
            .append(RcDoc::text("in"))
            .append(RcDoc::hardline())
            .group()
            .append(self.body.pretty(env, boundary))
            .group()
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>> for Input<'heap> {
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        let mut doc = RcDoc::text("#input")
            .append("(")
            .group()
            .append(self.name.value.unwrap())
            .append(",")
            .group()
            .append(RcDoc::softline())
            .append("type: ")
            .append(pretty_print_type_id(self.r#type, env.env));

        if let Some(default) = &self.default {
            doc = doc
                .append(",")
                .group()
                .append(RcDoc::softline())
                .append("default: ")
                .append(default.pretty(env, boundary).group());
        }

        doc.group().append(")").group()
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>> for TypeAssertion<'heap> {
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        RcDoc::text("#as")
            .append(if self.force {
                RcDoc::text("!")
            } else {
                RcDoc::nil()
            })
            .append("(")
            .group()
            .append(self.value.pretty(env, boundary))
            .append(",")
            .group()
            .append(RcDoc::softline())
            .append("type: ")
            .append(pretty_print_type_id(self.r#type, env.env))
            .group()
            .append(")")
            .group()
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>>
    for (HirId, &TypeConstructor<'heap>)
{
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        _: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        let &(id, _) = self;

        let TypeDef {
            id: closure,
            arguments,
        } = env.map.type_def(id);

        RcDoc::text("#ctor")
            .append("(")
            .append(pretty_print_type_id(closure, env.env))
            .append(",")
            .group()
            .append(RcDoc::softline())
            .append("arguments: ")
            .append(
                RcAllocator
                    .intersperse(
                        arguments
                            .iter()
                            .map(|argument| RcDoc::text(argument.name.unwrap())),
                        RcDoc::text(",").append(RcDoc::softline()),
                    )
                    .group()
                    .brackets()
                    .group(),
            )
            .group()
            .append(")")
            .group()
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>>
    for (HirId, &TypeOperation<'heap>)
{
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        let &(id, operation) = self;

        match operation {
            TypeOperation::Assertion(assertion) => assertion.pretty(env, boundary),
            TypeOperation::Constructor(constructor) => (id, constructor).pretty(env, boundary),
        }
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>>
    for BinaryOperation<'heap>
{
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        RcDoc::text("(")
            .append(self.left.pretty(env, boundary))
            .append(RcDoc::softline())
            .append(self.op.value.as_str())
            .append(RcDoc::softline())
            .append(self.right.pretty(env, boundary))
            .append(")")
            .group()
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>>
    for (HirId, &Operation<'heap>)
{
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        let &(id, op) = self;
        match op {
            Operation::Type(r#type) => (id, r#type).pretty(env, boundary),
            Operation::Binary(binary) => binary.pretty(env, boundary),
        }
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>> for FieldAccess<'heap> {
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        self.expr
            .pretty(env, boundary)
            .append(RcDoc::softline_())
            .append(".")
            .append(self.field.value.unwrap())
            .group()
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>> for IndexAccess<'heap> {
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        self.expr
            .pretty(env, boundary)
            .append("[")
            .append(self.index.pretty(env, boundary).group())
            .append("]")
            .group()
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>> for Access<'heap> {
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        match self {
            Self::Field(field) => field.pretty(env, boundary),
            Self::Index(index) => index.pretty(env, boundary),
        }
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>> for Call<'heap> {
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        self.function.pretty(env, boundary).append(
            RcAllocator
                .intersperse(
                    self.arguments
                        .iter()
                        .map(|argument| argument.value.pretty(env, boundary)),
                    RcDoc::text(",").append(RcDoc::softline()),
                )
                .group()
                .parens()
                .group(),
        )
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>> for If<'heap> {
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        RcDoc::text("if").append(
            RcDoc::space()
                .append(self.test.pretty(env, boundary))
                .append(RcDoc::space())
                .append(self.then.pretty(env, boundary))
                .append(RcDoc::space())
                .append(self.r#else.pretty(env, boundary)),
        )
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>> for Branch<'heap> {
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        match self {
            Self::If(r#if) => r#if.pretty(env, boundary),
        }
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>>
    for (HirId, &Closure<'heap>)
{
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        let &(id, closure) = self;

        let def = env.map.type_def(id);

        // There are two possibilities here (A):
        // We either "unfold" the type ourselves to print or we create a monster that prints it in a
        // way that's pretty unreadable
        let mut base = RcDoc::text("#fn");

        let mut signature = env.env.r#type(def.id);
        if !def.arguments.is_empty()
            && let Some(generic) = signature.kind.generic()
        {
            // Arguments are no longer present in the type once it has been monomorphized.
            let arguments = generic.arguments;

            base = base.append(
                RcAllocator
                    .intersperse(
                        // The generics might be re-ordered in the type, so we need enforce
                        // ordering per the signature
                        def.arguments.iter().map(|generic| {
                            let argument = arguments
                                .iter()
                                .find(|argument| argument.name == generic.name)
                                .expect("generic argument should exist");

                            argument.pretty(env.env, boundary)
                        }),
                        RcDoc::text(",").append(RcDoc::softline()),
                    )
                    .group()
                    .angles()
                    .group(),
            );

            signature = env.env.r#type(generic.base);
        }

        let closure_type = signature.kind.closure().expect("should be a closure");

        base.append(
            RcAllocator
                .intersperse(
                    closure
                        .signature
                        .params
                        .iter()
                        .zip(closure_type.params)
                        .map(|(param, &r#type)| {
                            RcDoc::text(param.name.mangled().to_string())
                                .append(":")
                                .group()
                                .append(RcDoc::softline())
                                .append(pretty_print_type_id(r#type, env.env))
                                .group()
                        }),
                    RcDoc::text(",").append(RcDoc::softline()),
                )
                .group()
                .parens()
                .group(),
        )
        .append(":")
        .append(RcDoc::softline())
        .append(pretty_print_type_id(closure_type.returns, env.env))
        .append(RcDoc::softline())
        .append("->")
        .append(RcDoc::hardline())
        .append(
            RcAllocator
                .nil()
                .append(closure.body.pretty(env, boundary))
                .indent(4),
        )
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>> for Thunk<'heap> {
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        RcDoc::text("thunk(() ->")
            .append(RcDoc::line())
            .append(
                RcAllocator
                    .nil()
                    .append(self.body.pretty(env, boundary))
                    .nest(4),
            )
            .append(RcDoc::line_())
            .append(")")
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>> for GraphReadHead<'heap> {
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        match self {
            Self::Entity { axis } => RcDoc::text("::graph::head::entities").append(
                RcAllocator
                    .nil()
                    .append(axis.pretty(env, boundary))
                    .group()
                    .parens()
                    .group(),
            ),
        }
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>> for GraphReadBody<'heap> {
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        match self {
            Self::Filter(node) => RcDoc::text("::graph::body::filter").append(
                RcAllocator
                    .nil()
                    .append(node.pretty(env, boundary))
                    .group()
                    .parens()
                    .group(),
            ),
        }
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>> for GraphReadTail {
    fn pretty(
        &self,
        _: &PrettyPrintEnvironment<'env, 'heap>,
        _: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        match self {
            Self::Collect => RcDoc::text("::graph::tail::collect"),
        }
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>> for GraphRead<'heap> {
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        let Self { head, body, tail } = &self;

        let mut doc = head.pretty(env, boundary);
        for node in body {
            doc = doc.append(
                RcDoc::softline()
                    .append(RcDoc::text("|> "))
                    .append(node.pretty(env, boundary))
                    .group(),
            );
        }

        doc = doc.append(
            RcDoc::softline()
                .append(RcDoc::text("|> "))
                .append(tail.pretty(env, boundary))
                .group(),
        );

        doc
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>> for Graph<'heap> {
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        match self {
            Self::Read(read) => read.pretty(env, boundary),
        }
    }
}

impl<'env, 'heap> PrettyPrint<'heap, PrettyPrintEnvironment<'env, 'heap>> for NodeData<'heap> {
    fn pretty(
        &self,
        env: &PrettyPrintEnvironment<'env, 'heap>,
        boundary: &mut PrettyPrintBoundary,
    ) -> RcDoc<'heap, Style> {
        match &self.kind {
            NodeKind::Data(data) => data.pretty(env, boundary),
            NodeKind::Variable(variable) => variable.pretty(env, boundary),
            NodeKind::Let(r#let) => r#let.pretty(env, boundary),
            NodeKind::Input(input) => input.pretty(env, boundary),
            NodeKind::Operation(operation) => (self.id, operation).pretty(env, boundary),
            NodeKind::Access(access) => access.pretty(env, boundary),
            NodeKind::Call(call) => call.pretty(env, boundary),
            NodeKind::Branch(branch) => branch.pretty(env, boundary),
            NodeKind::Closure(closure) => (self.id, closure).pretty(env, boundary),
            NodeKind::Thunk(thunk) => thunk.pretty(env, boundary),
            NodeKind::Graph(graph) => graph.pretty(env, boundary),
        }
    }
}
