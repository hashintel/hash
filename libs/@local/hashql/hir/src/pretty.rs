use hashql_core::{
    literal::LiteralKind,
    r#type::{TypeId, environment::Environment},
};
use hashql_diagnostics::color::Style;
use pretty::RcDoc;

use crate::node::{
    Node,
    data::{Data, DataKind, Literal},
    kind::NodeKind,
    variable::{LocalVariable, QualifiedVariable, Variable, VariableKind},
};

struct PrettyPrinter<'env, 'heap> {
    env: &'env Environment<'heap>,
}

impl<'heap> PrettyPrinter<'_, 'heap> {
    fn data_literal(&self, literal: &Literal<'heap>) -> RcDoc<'heap, Style> {
        match literal.kind {
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

    fn data(&self, data: &Data<'heap>) -> RcDoc<'heap, Style> {
        match &data.kind {
            DataKind::Literal(literal) => self.data_literal(literal),
        }
    }

    fn arguments(&self, arguments: &[TypeId]) -> RcDoc<'heap, Style> {
        if arguments.is_empty() {
            return RcDoc::nil();
        }

        RcDoc::text("<")
    }

    fn local_variable(&self, local: &LocalVariable<'heap>) -> RcDoc<'heap, Style> {
        RcDoc::text(local.name.value.unwrap()).append(self.arguments(&local.arguments))
    }

    fn qualified_variable(
        &self,
        qualified_variable: &QualifiedVariable<'heap>,
    ) -> RcDoc<'heap, Style> {
        RcDoc::text(qualified_variable.name.value.unwrap())
            .append(self.arguments(&qualified_variable.arguments))
    }

    fn variable(&self, variable: &Variable<'heap>) -> RcDoc<'heap, Style> {
        match &variable.kind {
            VariableKind::Local(local_variable) => todo!(),
            VariableKind::Qualified(qualified_variable) => todo!(),
        }
    }

    fn node(&self, node: Node<'heap>) -> RcDoc<'heap, Style> {
        match node.kind {
            NodeKind::Data(data) => self.data(data),
            NodeKind::Variable(variable) => todo!(),
            NodeKind::Let(_) => todo!(),
            NodeKind::Input(input) => todo!(),
            NodeKind::Operation(operation) => todo!(),
            NodeKind::Access(access) => todo!(),
            NodeKind::Call(call) => todo!(),
            NodeKind::Branch(branch) => todo!(),
            NodeKind::Closure(closure) => todo!(),
            NodeKind::Graph(graph) => todo!(),
        }
    }
}
