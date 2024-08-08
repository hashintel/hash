use error_stack::{Report, Result, ResultExt};
use hql_cst::Node;
use jsonptr::PointerBuf;
use winnow::{combinator::alt, Parser};

use crate::lexer::{
    syntax_kind::SyntaxKind, syntax_kind_set::SyntaxKindSet, token::Token, token_kind::TokenKind,
    Lexer,
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
    #[error("expected end of input, but received {received}")]
    ExpectedEndOfInput { received: SyntaxKind },
}

// TODO: use winnow instead :peepo:

pub(crate) struct NodeParser<'arena> {
    arena: &'arena Arena,
    pointer: Vec<jsonptr::Token<'static>>,
}

impl<'arena> NodeParser<'arena> {
    pub(crate) const fn new(arena: &'arena Arena) -> Self {
        Self {
            arena,
            pointer: Vec::new(),
        }
    }

    pub(crate) fn parse<'source>(
        &self,
        source: &'source str,
    ) -> Result<Node<'arena, 'source>, NodeParseError> {
        let mut lexer = Lexer::new(source);

        let node = self.parse_node(&mut lexer, None)?;

        if let Some(token) = lexer.next() {
            // we would error out either way, so it's fine to propagate the error
            let token = token.change_context(NodeParseError::Parse)?;

            return Err(Report::new(NodeParseError::ExpectedEndOfInput {
                received: SyntaxKind::from(&token.kind),
            })
            .attach(Location::new(token.span)));
        }

        Ok(node)
    }

    pub(crate) fn parse_node<'source>(
        &self,
        lexer: &mut Lexer<'source>,
        token: Option<Token<'source>>,
    ) -> Result<Node<'arena, 'source>, NodeParseError> {
        let token = if let Some(token) = token {
            token
        } else {
            let mut eof = EofParser { lexer };
            eof.advance().change_context(NodeParseError::Parse)?
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

#[cfg(test)]
mod test {
    use insta::assert_debug_snapshot;

    use crate::{arena::Arena, parse::json::node::NodeParser};

    #[test]
    fn fn_is_expr() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse(
            r#"[
            ["input", "variable"],
            "arg1",
            "arg2"
        ]"#,
        );

        assert_debug_snapshot!(result);
    }

    #[test]
    fn fn_empty_args() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse(r#"["func"]"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn fn_empty() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse("[]");

        assert_debug_snapshot!(result);
    }

    #[test]
    fn string_is_path() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse(r#""symbol""#);
        assert_debug_snapshot!(result);

        let result = NodeParser::new(&arena).parse(r#""foo::bar""#);
        assert_debug_snapshot!(result);
    }

    #[test]
    fn string_is_signature() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse(r#""<T: Int>(a: T) -> T""#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn string_is_invalid() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse(r#""1234""#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_constant() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse(r#"{"const": 42}"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_constant_with_type() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse(r#"{"type": "u32", "const": 42}"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_constant_with_extra_fields() {
        let arena = Arena::new();

        let result =
            NodeParser::new(&arena).parse(r#"{"type": "u32", "const": 42, "sig": "() -> Unit"}"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_call() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse(r#"{"fn": "func", "args": ["arg1", "arg2"]}"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_args_without_fn() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse(r#"{"args": ["arg1", "arg2"]}"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_call_without_args() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse(r#"{"fn": "func"}"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_signature() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse(r#"{"sig": "<T: Int>(a: T) -> T"}"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_invalid_multiple() {
        let arena = Arena::new();

        let result =
            NodeParser::new(&arena).parse(r#"{"sig": "<T: Int>(a: T) -> T", "fn": "func"}"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_invalid_duplicate_key() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse(r#"{"fn": "func", "fn": "func"}"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_invalid() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse(r#"{"unknown": "key"}"#);

        assert_debug_snapshot!(result);
    }

    #[test]
    fn object_is_empty() {
        let arena = Arena::new();

        let result = NodeParser::new(&arena).parse("{}");

        assert_debug_snapshot!(result);
    }
}
