use hashql_ast::node::{
    expr::{Expr, ExprKind, TupleExpr, tuple::TupleElement},
    id::NodeId,
};
use text_size::TextRange;

use super::{
    ObjectState, State,
    error::ObjectDiagnosticCategory,
    r#type::{TypeNode, handle_typed},
    visit::Key,
};
use crate::{
    ParserState,
    error::ResultExt as _,
    lexer::{syntax_kind::SyntaxKind, syntax_kind_set::SyntaxKindSet},
    parser::{
        array::visit::visit_array,
        error::{ParserDiagnostic, unexpected_token},
        expr::parse_expr,
    },
};

// The `#tuple` field is present
// but without `#type` present
pub(crate) struct TupleNode<'heap> {
    key_span: TextRange,

    expr: TupleExpr<'heap>,
    r#type: Option<TypeNode<'heap>>,
}

impl<'heap> TupleNode<'heap> {
    pub(crate) fn parse(
        state: &mut ParserState<'heap, '_>,
        key: &Key<'_>,
    ) -> Result<Self, ParserDiagnostic> {
        let expr = parse_tuple(state)?;

        Ok(Self {
            key_span: key.span,
            expr,
            r#type: None,
        })
    }

    pub(crate) fn with_type(mut self, r#type: TypeNode<'heap>) -> Self {
        self.r#type = Some(r#type);
        self
    }
}

impl<'heap> State<'heap> for TupleNode<'heap> {
    fn handle(
        mut self,
        state: &mut ParserState<'heap, '_>,
        key: Key<'_>,
    ) -> Result<ObjectState<'heap>, ParserDiagnostic> {
        handle_typed("#tuple", self.key_span, &mut self.r#type, state, &key)?;
        Ok(ObjectState::Tuple(self))
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
            kind: ExprKind::Tuple(self.expr),
        })
    }
}

fn parse_tuple<'heap>(
    state: &mut ParserState<'heap, '_>,
) -> Result<TupleExpr<'heap>, ParserDiagnostic> {
    let token = state.advance().change_category(From::from)?;

    if token.kind.syntax() != SyntaxKind::LBracket {
        return Err(unexpected_token(
            state.insert_range(token.span),
            ObjectDiagnosticCategory::TupleExpectedArray,
            SyntaxKindSet::from_slice(&[SyntaxKind::LBracket]),
        )
        .map_category(From::from));
    }

    let mut elements = Vec::new();

    let range = visit_array(state, token, |state| {
        let expr = parse_expr(state)?;

        let element = TupleElement {
            id: NodeId::PLACEHOLDER,
            span: expr.span,
            value: state.heap().boxed(expr),
        };

        elements.push(element);

        Ok(())
    })?;

    Ok(TupleExpr {
        id: NodeId::PLACEHOLDER,
        span: state.insert_range(range),
        elements: state.heap().boxed_slice(elements),
        r#type: None,
    })
}
