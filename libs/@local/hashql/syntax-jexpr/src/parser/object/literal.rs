use alloc::borrow::Cow;

use hashql_ast::node::{
    expr::{
        Expr, ExprKind, LiteralExpr, StructExpr,
        literal::{FloatLiteral, IntegerLiteral, LiteralKind, StringLiteral},
    },
    id::NodeId,
};
use hashql_core::symbol::Symbol;
use text_size::TextRange;

use super::{ObjectState, State, visit::Key};
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
    expr: LiteralExpr<'heap>,
}

impl<'heap> LiteralNode<'heap> {
    pub(crate) const fn new(expr: LiteralExpr<'heap>) -> Self {
        Self { expr }
    }
}

impl<'heap> State<'heap> for LiteralNode<'heap> {
    fn handle(
        self,
        state: &mut ParserState<'heap, '_>,
        key: Key<'_>,
    ) -> Result<ObjectState<'heap>, ParserDiagnostic> {
        todo!()
    }

    fn build(
        self,
        state: &mut ParserState<'heap, '_>,
        span: TextRange,
    ) -> Result<Expr<'heap>, ParserDiagnostic> {
        todo!()
    }
}

pub(crate) fn parse_literal<'heap>(
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
