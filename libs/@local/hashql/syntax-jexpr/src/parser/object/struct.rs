use hashql_ast::node::{
    expr::{Expr, ExprKind, StructExpr, r#struct::StructEntry},
    id::NodeId,
};
use text_size::TextRange;

use super::{
    ObjectState, State,
    r#type::{TypeNode, handle_typed},
    visit::Key,
};
use crate::{
    ParserState,
    error::ResultExt as _,
    lexer::{syntax_kind::SyntaxKind, syntax_kind_set::SyntaxKindSet},
    parser::{
        error::{ParserDiagnostic, unexpected_token},
        expr::parse_expr,
        object::{
            error::{ObjectDiagnosticCategory, struct_key_expected_identifier},
            visit::visit_object,
        },
        string::parse_ident_from_string,
    },
};

pub(crate) struct StructNode<'heap> {
    key_span: TextRange,

    expr: StructExpr<'heap>,
    r#type: Option<TypeNode<'heap>>,
}

impl<'heap> StructNode<'heap> {
    pub(crate) fn parse(
        state: &mut ParserState<'heap, '_>,
        key: &Key<'_>,
    ) -> Result<Self, ParserDiagnostic> {
        let expr = parse_struct(state)?;

        Ok(Self {
            key_span: key.span,
            expr,
            r#type: None,
        })
    }

    pub(crate) fn with_type(mut self, type_node: TypeNode<'heap>) -> Self {
        self.r#type = Some(type_node);
        self
    }
}

impl<'heap> State<'heap> for StructNode<'heap> {
    fn handle(
        mut self,
        state: &mut ParserState<'heap, '_>,
        key: Key<'_>,
    ) -> Result<ObjectState<'heap>, ParserDiagnostic> {
        handle_typed("#struct", self.key_span, &mut self.r#type, state, &key)?;
        Ok(ObjectState::Struct(self))
    }

    fn build(
        mut self,
        state: &mut ParserState<'heap, '_>,
        span: TextRange,
    ) -> Result<Expr<'heap>, ParserDiagnostic> {
        self.expr.r#type = TypeNode::finish(self.r#type, state);

        Ok(Expr {
            id: NodeId::PLACEHOLDER,
            span: state.insert_range(span),
            kind: ExprKind::Struct(self.expr),
        })
    }
}

fn parse_struct<'heap>(
    state: &mut ParserState<'heap, '_>,
) -> Result<StructExpr<'heap>, ParserDiagnostic> {
    let token = state.advance().change_category(From::from)?;
    if token.kind.syntax() != SyntaxKind::LBrace {
        let span = state.insert_range(token.span);

        return Err(unexpected_token(
            span,
            ObjectDiagnosticCategory::StructExpectedObject,
            SyntaxKindSet::from_slice(&[SyntaxKind::LBrace]),
        ))
        .change_category(From::from)?;
    }

    let mut entries = Vec::new();

    let span = visit_object(state, token, |state, key| {
        let key_span = state.insert_range(key.span);

        let ident = match parse_ident_from_string(state, key_span, &key.value) {
            Ok(ident) => ident,
            Err(error) => {
                return Err(
                    struct_key_expected_identifier(state.spans(), key_span, error)
                        .map_category(From::from),
                );
            }
        };

        let value = parse_expr(state)?;
        let value_span = state.current_span();

        entries.push(StructEntry {
            id: NodeId::PLACEHOLDER,
            span: state.insert_range(key.span.cover(value_span)),
            key: ident,
            value: state.heap().boxed(value),
        });

        Ok(())
    })?;

    Ok(StructExpr {
        id: NodeId::PLACEHOLDER,
        span: state.insert_range(span),
        entries: state.heap().boxed_slice(entries),
        r#type: None,
    })
}
