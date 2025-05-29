use hashql_core::{
    literal::LiteralKind,
    pretty::{PrettyPrint, PrettyRecursionBoundary, PrettyRecursionGuardStrategy},
    span::Spanned,
    r#type::{TypeId, environment::Environment},
};
use hashql_diagnostics::color::Style;
use pretty::{DocAllocator as _, RcAllocator, RcDoc};

use crate::{
    node::{
        Node,
        access::{Access, AccessKind, field::FieldAccess, index::IndexAccess},
        branch::Branch,
        call::Call,
        closure::Closure,
        data::{Data, DataKind, Literal},
        graph::Graph,
        input::Input,
        kind::NodeKind,
        r#let::Let,
        operation::{
            BinaryOperation, Operation, OperationKind, TypeOperation,
            r#type::{TypeAssertion, TypeConstructor, TypeOperationKind},
        },
        variable::{LocalVariable, QualifiedVariable, Variable, VariableKind},
    },
    path::QualifiedPath,
};

impl<'heap> PrettyPrint<'heap> for Literal<'heap> {
    fn pretty(
        &self,
        _: &Environment<'heap>,
        _: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, Style> {
        match self.kind {
            LiteralKind::Null => RcDoc::text("null"),
            LiteralKind::Boolean(true) => RcDoc::text("true"),
            LiteralKind::Boolean(false) => RcDoc::text("false"),
            LiteralKind::Float(float_literal) => RcDoc::text(float_literal.value.unwrap()),
            LiteralKind::Integer(integer_literal) => RcDoc::text(integer_literal.value.unwrap()),
            LiteralKind::String(string_literal) => RcDoc::text(format!(
                r#""{}""#,
                string_literal.value.as_str().escape_debug()
            )),
        }
    }
}

impl<'heap> PrettyPrint<'heap> for Data<'heap> {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, Style> {
        match &self.kind {
            DataKind::Literal(literal) => literal.pretty(env, boundary),
        }
    }
}

fn pretty_print_type_id<'heap>(id: TypeId, env: &Environment<'heap>) -> RcDoc<'heap, Style> {
    let mut boundary =
        PrettyRecursionBoundary::new(PrettyRecursionGuardStrategy::IdentityTracking, Some(32));

    boundary.pretty_type(env, id)
}

fn pretty_print_arguments<'heap>(
    ids: &[Spanned<TypeId>],
    env: &Environment<'heap>,
) -> RcDoc<'heap, Style> {
    if ids.is_empty() {
        return RcDoc::nil();
    }

    let mut boundary =
        PrettyRecursionBoundary::new(PrettyRecursionGuardStrategy::IdentityTracking, Some(32));

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

impl<'heap> PrettyPrint<'heap> for LocalVariable<'heap> {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        _: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, Style> {
        RcDoc::text(self.name.value.unwrap())
            .append(pretty_print_arguments(&self.arguments, env))
            .group()
    }
}

impl<'heap> PrettyPrint<'heap> for QualifiedPath<'heap> {
    fn pretty(
        &self,
        _: &Environment<'heap>,
        _: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, Style> {
        RcDoc::text("::")
            .append(RcDoc::intersperse(
                self.0.iter().map(|ident| RcDoc::text(ident.value.unwrap())),
                RcDoc::text("::"),
            ))
            .group()
    }
}

impl<'heap> PrettyPrint<'heap> for QualifiedVariable<'heap> {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, Style> {
        self.path
            .pretty(env, boundary)
            .append(pretty_print_arguments(&self.arguments, env))
            .group()
    }
}

impl<'heap> PrettyPrint<'heap> for Variable<'heap> {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, Style> {
        match &self.kind {
            VariableKind::Local(local) => local.pretty(env, boundary),
            VariableKind::Qualified(qualified) => qualified.pretty(env, boundary),
        }
    }
}

impl<'heap> PrettyPrint<'heap> for Let<'heap> {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, Style> {
        RcDoc::text("#let")
            .append(RcDoc::softline())
            .append(self.name.value.unwrap())
            .append(RcDoc::softline())
            .append(RcDoc::text("="))
            .append(RcDoc::softline())
            .group()
            .append(self.value.pretty(env, boundary))
            .group()
            .append(RcDoc::softline())
            .append("in")
            .group()
            .append(RcDoc::hardline())
            .append(self.body.pretty(env, boundary))
            .group()
    }
}

impl<'heap> PrettyPrint<'heap> for Input<'heap> {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, Style> {
        let mut doc = RcDoc::text("#input")
            .append("(")
            .group()
            .append(self.name.value.unwrap())
            .append(",")
            .group()
            .append(RcDoc::softline())
            .append("type: ")
            .append(pretty_print_type_id(self.r#type, env));

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

impl<'heap> PrettyPrint<'heap> for TypeAssertion<'heap> {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, Style> {
        RcDoc::text("#is")
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
            .append(pretty_print_type_id(self.r#type, env))
            .group()
            .append(")")
            .group()
    }
}

impl<'heap> PrettyPrint<'heap> for TypeConstructor<'heap> {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        _: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, Style> {
        RcDoc::text("#ctor")
            .append("(")
            .append(pretty_print_type_id(self.closure, env))
            .append(",")
            .group()
            .append(RcDoc::softline())
            .append("arguments: ")
            .append(
                RcAllocator
                    .intersperse(
                        self.arguments
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

impl<'heap> PrettyPrint<'heap> for TypeOperation<'heap> {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, Style> {
        match &self.kind {
            TypeOperationKind::Assertion(assertion) => assertion.pretty(env, boundary),
            TypeOperationKind::Constructor(constructor) => constructor.pretty(env, boundary),
        }
    }
}

impl<'heap> PrettyPrint<'heap> for BinaryOperation<'heap> {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, Style> {
        self.left
            .pretty(env, boundary)
            .append(RcDoc::softline())
            .append(self.op.kind.as_str())
            .append(RcDoc::softline())
            .append(self.right.pretty(env, boundary))
            .append(")")
            .group()
    }
}

impl<'heap> PrettyPrint<'heap> for Operation<'heap> {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, Style> {
        match &self.kind {
            OperationKind::Type(r#type) => r#type.pretty(env, boundary),
            OperationKind::Binary(binary) => binary.pretty(env, boundary),
        }
    }
}

impl<'heap> PrettyPrint<'heap> for FieldAccess<'heap> {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, Style> {
        self.expr
            .pretty(env, boundary)
            .append(RcDoc::softline_())
            .append(".")
            .append(self.field.value.unwrap())
            .group()
    }
}

impl<'heap> PrettyPrint<'heap> for IndexAccess<'heap> {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, Style> {
        self.expr
            .pretty(env, boundary)
            .append("[")
            .append(self.index.pretty(env, boundary).group())
            .append("]")
            .group()
    }
}

impl<'heap> PrettyPrint<'heap> for Access<'heap> {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, Style> {
        match &self.kind {
            AccessKind::Field(field) => field.pretty(env, boundary),
            AccessKind::Index(index) => index.pretty(env, boundary),
        }
    }
}

impl<'heap> PrettyPrint<'heap> for Call<'heap> {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
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

impl<'heap> PrettyPrint<'heap> for Branch<'heap> {
    fn pretty(
        &self,
        _: &Environment<'heap>,
        _: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, Style> {
        match self.kind {}
    }
}

impl<'heap> PrettyPrint<'heap> for Closure<'heap> {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, Style> {
        // There are two possibilities here (A):
        // We either "unfold" the type ourselves to print or we create a monster that prints it in a
        // way that's pretty unreadable
        let mut base = RcDoc::text("#fn");

        let mut signature = env.r#type(self.signature.def.id);
        if !self.signature.def.arguments.is_empty() {
            let generic = signature.kind.generic().expect("should be a generic");

            let arguments = generic.arguments;

            base = base.append(
                RcAllocator
                    .intersperse(
                        // The generics might be re-ordered in the type, so we need enforce
                        // ordering per the signature
                        self.signature.def.arguments.iter().map(|generic| {
                            let argument = arguments
                                .iter()
                                .find(|argument| argument.name == generic.name)
                                .expect("generic argument should exist");

                            argument.pretty(env, boundary)
                        }),
                        RcDoc::text(",").append(RcDoc::softline()),
                    )
                    .group()
                    .angles()
                    .group(),
            );

            signature = env.r#type(generic.base);
        }

        let closure = signature.kind.closure().expect("should be a closure");

        base.append(
            RcAllocator
                .intersperse(
                    self.signature
                        .params
                        .iter()
                        .zip(closure.params)
                        .map(|(param, &r#type)| {
                            RcDoc::text(param.name.value.unwrap())
                                .append(":")
                                .group()
                                .append(RcDoc::softline())
                                .append(pretty_print_type_id(r#type, env))
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
        .append(pretty_print_type_id(closure.returns, env))
        .append(RcDoc::softline())
        .append("->")
        .append(RcDoc::hardline())
        .append(
            RcAllocator
                .nil()
                .append(self.body.pretty(env, boundary))
                .indent(4),
        )
    }
}

impl<'heap> PrettyPrint<'heap> for Graph<'heap> {
    fn pretty(
        &self,
        _: &Environment<'heap>,
        _: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, Style> {
        match self.kind {}
    }
}

impl<'heap> PrettyPrint<'heap> for Node<'heap> {
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
    ) -> RcDoc<'heap, Style> {
        match &self.kind {
            NodeKind::Data(data) => data.pretty(env, boundary),
            NodeKind::Variable(variable) => variable.pretty(env, boundary),
            NodeKind::Let(r#let) => r#let.pretty(env, boundary),
            NodeKind::Input(input) => input.pretty(env, boundary),
            NodeKind::Operation(operation) => operation.pretty(env, boundary),
            NodeKind::Access(access) => access.pretty(env, boundary),
            NodeKind::Call(call) => call.pretty(env, boundary),
            NodeKind::Branch(branch) => branch.pretty(env, boundary),
            NodeKind::Closure(closure) => closure.pretty(env, boundary),
            NodeKind::Graph(graph) => graph.pretty(env, boundary),
        }
    }
}
