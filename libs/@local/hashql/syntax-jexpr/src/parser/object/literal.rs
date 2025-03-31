use hashql_ast::node::{
    expr::{
        Expr, ExprKind, LiteralExpr,
        literal::{FloatLiteral, IntegerLiteral, LiteralKind, StringLiteral},
    },
    id::NodeId,
};
use hashql_core::symbol::Symbol;
use text_size::TextRange;

use super::{
    ObjectState, State,
    error::{duplicate_key, unknown_key},
    r#type::TypeNode,
    visit::Key,
};
use crate::{
    ParserState,
    error::ResultExt as _,
    lexer::{syntax_kind::SyntaxKind, syntax_kind_set::SyntaxKindSet, token_kind::TokenKind},
    parser::{
        error::{ParserDiagnostic, ParserDiagnosticCategory, unexpected_token},
        object::error::ObjectDiagnosticCategory,
    },
};

// The `#literal` field is present
// The `#type` **may** be present
pub(crate) struct LiteralNode<'heap> {
    key_span: TextRange,

    expr: LiteralExpr<'heap>,
    r#type: Option<TypeNode<'heap>>,
}

impl<'heap> LiteralNode<'heap> {
    pub(crate) fn parse(
        state: &mut ParserState<'heap, '_>,
        key: &Key<'_>,
    ) -> Result<Self, ParserDiagnostic> {
        let expr = parse_literal(state)?;

        Ok(Self {
            key_span: key.span,

            expr,
            r#type: None,
        })
    }
}

impl<'heap> State<'heap> for LiteralNode<'heap> {
    fn handle(
        mut self,
        state: &mut ParserState<'heap, '_>,
        key: Key<'_>,
    ) -> Result<ObjectState<'heap>, ParserDiagnostic> {
        match &*key.value {
            "#literal" => Err(duplicate_key(
                state.insert_range(self.key_span),
                state.insert_range(key.span),
                "#literal",
            )
            .map_category(From::from)),
            "#type" if self.r#type.is_some() => Err(duplicate_key(
                state.insert_range(self.key_span),
                state.insert_range(key.span),
                "#type",
            )
            .map_category(From::from)),
            "#type" => {
                let r#type = TypeNode::parse(state, &key).change_category(From::from)?;

                self.r#type = Some(r#type);
                Ok(ObjectState::Literal(self))
            }
            _ => {
                Err(unknown_key(state.insert_range(key.span), &key.value, &[])
                    .map_category(From::from))
            }
        }
    }

    fn build(
        mut self,
        state: &mut ParserState<'heap, '_>,
        span: TextRange,
    ) -> Result<Expr<'heap>, ParserDiagnostic> {
        let r#type = self
            .r#type
            .map(TypeNode::into_inner)
            .map(|r#type| state.heap().boxed(r#type));

        self.expr.r#type = r#type;

        Ok(Expr {
            id: NodeId::PLACEHOLDER,
            span: state.insert_range(span),
            kind: ExprKind::Literal(self.expr),
        })
    }
}

fn parse_literal<'heap>(
    state: &mut ParserState<'heap, '_>,
) -> Result<LiteralExpr<'heap>, ParserDiagnostic> {
    let token = state
        .advance()
        .change_category(ParserDiagnosticCategory::Lexer)?;

    let span = state.insert_range(token.span);

    let kind = match token.kind {
        TokenKind::Null => LiteralKind::Null,
        TokenKind::Number(number) => {
            if number.has_fraction() {
                LiteralKind::Float(FloatLiteral {
                    id: NodeId::PLACEHOLDER,
                    span,
                    value: Symbol::new(number.as_str()),
                })
            } else {
                LiteralKind::Integer(IntegerLiteral {
                    id: NodeId::PLACEHOLDER,
                    span,
                    value: Symbol::new(number.as_str()),
                })
            }
        }
        TokenKind::Bool(value) => LiteralKind::Boolean(value),
        TokenKind::String(value) => LiteralKind::String(StringLiteral {
            id: NodeId::PLACEHOLDER,
            span,
            value: Symbol::new(value),
        }),
        _ => {
            return Err(unexpected_token(
                span,
                ObjectDiagnosticCategory::InvalidLiteral,
                SyntaxKindSet::from_slice(&[
                    SyntaxKind::Null,
                    SyntaxKind::Number,
                    SyntaxKind::True,
                    SyntaxKind::False,
                    SyntaxKind::String,
                ]),
            )
            .map_category(From::from));
        }
    };

    Ok(LiteralExpr {
        id: NodeId::PLACEHOLDER,
        span,
        kind,
        r#type: None,
    })
}
