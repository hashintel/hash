use error_stack::{Report, Result, ResultExt};
use hql_cst_lex::{Lexer, Location, SyntaxKind, SyntaxKindSet, Token, TokenKind};
use winnow::{combinator::alt, Parser};

use super::{
    node_object::NodeObjectParser,
    util::{ArrayParser, EofParser},
    WinnowError,
};
use crate::{
    arena::Arena,
    expr::{call::Call, path::parse_path, signature::parse_signature, Expr},
    symbol::ParseRestriction,
    Node,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
pub enum NodeParseError {
    #[error("unable to parse input")]
    Parse,
    #[error("expected one of {expected}, but received {received}")]
    Expected {
        expected: SyntaxKindSet,
        received: SyntaxKind,
    },
    #[error("call expression array, requires at least a single item, the function to be called.")]
    RequiredFn,
    #[error("malformed call expression array")]
    Array,
    #[error("malformed expression object")]
    Object,
    #[error("expected string to be either a path or signature")]
    PathOrSignature,
}

pub(crate) struct NodeParser<'arena> {
    arena: &'arena Arena,
}

impl<'arena> NodeParser<'arena> {
    pub(crate) fn new(arena: &'arena Arena) -> Self {
        Self { arena }
    }

    pub(crate) fn parse<'source>(
        &self,
        source: &'source str,
    ) -> Result<Node<'arena, 'source>, NodeParseError> {
        let mut lexer = Lexer::new(source);

        self.parse_node(&mut lexer, None)
    }

    pub(crate) fn parse_node<'source>(
        &self,
        lexer: &mut Lexer<'source>,
        token: Option<Token<'source>>,
    ) -> Result<Node<'arena, 'source>, NodeParseError> {
        let token = match token {
            Some(token) => token,
            None => {
                let mut eof = EofParser { lexer };
                eof.advance().change_context(NodeParseError::Parse)?
            }
        };

        match &token.kind {
            TokenKind::String(..) => self.parse_string(token),
            TokenKind::LBracket => self.parse_call(lexer, token),
            TokenKind::LBrace => self.parse_object(lexer, token),
            _ => Err(Report::new(NodeParseError::Expected {
                expected: SyntaxKindSet::new([
                    SyntaxKind::String,
                    SyntaxKind::LBracket,
                    SyntaxKind::LBrace,
                ]),
                received: SyntaxKind::from(&token.kind),
            })
            .attach(Location::new(token.span))),
        }
    }

    pub(crate) fn parse_call<'source>(
        &self,
        lexer: &mut Lexer<'source>,
        token: Token<'source>,
    ) -> Result<Node<'arena, 'source>, NodeParseError> {
        let mut r#fn = None;
        let mut args = self.arena.vec(None);

        let span = ArrayParser::new(lexer)
            .parse(token, |lexer, token| {
                let node = self.parse_node(lexer, token)?;
                match r#fn {
                    Some(..) => args.push(node),
                    None => r#fn = Some(node),
                }

                Ok(())
            })
            .change_context(NodeParseError::Array)?;

        let Some(r#fn) = r#fn else {
            return Err(Report::new(NodeParseError::RequiredFn).attach(Location::new(span)));
        };

        Ok(Node {
            expr: Expr::Call(Call {
                r#fn: self.arena.boxed(r#fn),
                args: args.into_boxed_slice(),
            }),
            span,
        })
    }

    pub(crate) fn parse_object<'source>(
        &self,
        lexer: &mut Lexer<'source>,
        token: Token<'source>,
    ) -> Result<Node<'arena, 'source>, NodeParseError> {
        NodeObjectParser::new(lexer, self.arena)
            .parse(token)
            .change_context(NodeParseError::Object)
    }

    pub(crate) fn parse_string<'source>(
        &self,
        token: Token<'source>,
    ) -> Result<Node<'arena, 'source>, NodeParseError> {
        let span = token.span;

        let TokenKind::String(value) = token.kind else {
            return Err(Report::new(NodeParseError::Expected {
                expected: SyntaxKindSet::new([SyntaxKind::String]),
                received: SyntaxKind::from(&token.kind),
            })
            .attach(Location::new(span)));
        };

        // TODO: offset error
        let expr = alt((
            parse_signature.map(Expr::Signature),
            parse_path(ParseRestriction::None).map(Expr::Path),
        ))
        .parse(winnow::Stateful {
            input: value.as_ref(),
            state: self.arena,
        })
        .map_err(WinnowError::from)
        .change_context(NodeParseError::PathOrSignature)
        .attach(Location::new(span))?;

        Ok(Node { expr, span })
    }
}
