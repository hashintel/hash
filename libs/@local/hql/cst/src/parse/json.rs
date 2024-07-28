use error_stack::{Report, Result, ResultExt};
use hql_cst_lex::{Lexer, Location, Token, TokenKind};
use winnow::{
    combinator::alt,
    error::{ContextError, ErrMode},
    stream::AsBStr,
    Parser,
};

use crate::{
    arena, path::parse_path, signature::parse_signature, Arena, Call, Constant, Expr, Node, Path,
    Signature,
};

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ParseError {
    #[error("unable to lex JSON")]
    Lexing,
    #[error("unexpected end of input")]
    UnexpectedEndOfInput,
    #[error("unable to parse path or signature expression")]
    PathOrSignature,
    #[error("call expected a function to be called")]
    CallExpectedFn,
    #[error("expected a `,` or `]` after an expression in an array")]
    ExpectedCommaOrRBracket,
    #[error("expected a string")]
    ExpectedString,
    #[error("expected a key")]
    ExpectedKey,
    #[error("expected a `,` or `}}`")]
    ExpectedCommaOrRBrace,
    #[error("expected a `:`")]
    ExpectedColon,
    #[error("repeated object key `{key}`")]
    RepeatedObjectKey { key: &'static str },
    #[error("The `{key}` key is valid, but not expected in this context")]
    UnexpectedKey { key: &'static str },
    #[error("unknown object key `{key}`")]
    UnknownObjectKey { key: Box<str> },
    #[error("unexpected empty object")]
    EmptyObject,
    #[error("missing object key `{key}`")]
    MissingObjectKey { key: &'static str },
    #[error("unexpected token kind for expr, expected a string, array, or object")]
    UnexpectedExprTokenKind,
}

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
#[error("{display}")]
pub struct WinnowError {
    display: Box<str>,
    error: ErrMode<ContextError>,
}

impl<I> From<winnow::error::ParseError<I, ErrMode<ContextError>>> for WinnowError
where
    I: AsBStr,
{
    fn from(error: winnow::error::ParseError<I, ErrMode<ContextError>>) -> Self {
        Self {
            display: error.to_string().into_boxed_str(),
            error: error.into_inner(),
        }
    }
}

macro_rules! next {
    ($lexer:ident) => {{
        $lexer
            .next()
            .ok_or_else(|| Report::new(ParseError::UnexpectedEndOfInput))?
            .change_context(ParseError::Lexing)?
    }};
}

fn parse_expr<'a>(
    arena: &'a Arena,
    parser: &mut Lexer,
    token: Option<Token>,
) -> Result<Node<'a>, ParseError> {
    let token = match token {
        Some(token) => token,
        None => next!(parser),
    };

    match &token.kind {
        TokenKind::String(..) => parse_string(arena, token),
        TokenKind::LBracket => parse_call_array(arena, parser, token),
        TokenKind::LBrace => parse_object(arena, parser, token),
        _ => {
            Err(Report::new(ParseError::UnexpectedExprTokenKind).attach(Location::new(token.span)))
        }
    }
}

enum ObjectState<'a> {
    // we don't know yet what we're decoding
    Unknown,
    Call {
        r#fn: Option<Node<'a>>,
        args: Option<arena::Vec<'a, Node<'a>>>,
    },
    Const {
        r#const: Option<JsonValue<'static>>,
        r#type: Option<Path<'a>>,
    },
    Variable {
        var: Path<'a>,
    },
    Signature {
        sig: Signature<'a>,
    },
}

fn parse_object<'a>(
    arena: &'a Arena,
    lexer: &mut Lexer,
    token: Token,
) -> Result<Node<'a>, ParseError> {
    let span = token.span;
    let mut state = ObjectState::Unknown;

    let mut token = next!(lexer);
    let mut first = true;

    // TODO: test `{}`, `{"fn": "foo"}`, `{"fn": "foo",}`, `{,"fn": "foo"}`, `{123: "foo"}`, `{"foo"
    // "bar"}`
    loop {
        // immediately terminate if we find the closing bracket
        if token.kind == TokenKind::RBrace {
            span = span.cover(token.span);
            break;
        }

        let key_token = if first {
            // if this is the first iteration, we don't expect a comma, just immediately parse the
            // key
            first = false;

            token
        } else if token.kind == TokenKind::Comma {
            // if we find a comma, we expect a key next
            next!(lexer)
        } else {
            return Err(
                Report::new(ParseError::ExpectedCommaOrRBrace).attach(Location::new(token.span))
            );
        };

        let TokenKind::String(key) = token.kind else {
            return Err(Report::new(ParseError::ExpectedKey).attach(Location::new(token.span)));
        };

        let colon = next!(lexer);
        if colon.kind != TokenKind::Colon {
            return Err(Report::new(ParseError::ExpectedColon).attach(Location::new(colon.span)));
        }

        match key.as_ref() {
            "fn" => match state {
                ObjectState::Unknown => {
                    let node = parse_expr(arena, lexer, None)?;
                    state = ObjectState::Call {
                        r#fn: Some(node),
                        args: None,
                    };
                }
                ObjectState::Call { r#fn: None, args } => {
                    let node = parse_expr(arena, lexer, None)?;
                    state = ObjectState::Call {
                        r#fn: Some(node),
                        args,
                    };
                }
                ObjectState::Call { r#fn: Some(_), .. } => {
                    return Err(Report::new(ParseError::RepeatedObjectKey { key: "fn" })
                        .attach(Location::new(key_token.span)));
                }
                _ => {
                    return Err(Report::new(ParseError::UnexpectedKey { key: "fn" })
                        .attach(Location::new(key_token.span)));
                }
            },
            "args" => match state {
                ObjectState::Unknown => {
                    let args = parse_expr_array(arena, lexer)?;
                    state = ObjectState::Call {
                        r#fn: None,
                        args: Some(args),
                    };
                }
                ObjectState::Call { r#fn, args: None } => {
                    let args = parse_expr_array(arena, lexer)?;
                    state = ObjectState::Call {
                        r#fn,
                        args: Some(args),
                    };
                }
                ObjectState::Call { args: Some(_), .. } => {
                    return Err(Report::new(ParseError::RepeatedObjectKey { key: "args" })
                        .attach(Location::new(key_token.span)));
                }
                _ => {
                    return Err(Report::new(ParseError::UnexpectedKey { key: "args" })
                        .attach(Location::new(key_token.span)));
                }
            },
            "const" => match state {
                ObjectState::Unknown => {
                    let r#const = parse_json_value(lexer)?;
                    state = ObjectState::Const {
                        r#const: Some(r#const),
                        r#type: None,
                    };
                }
                ObjectState::Const {
                    r#const: None,
                    r#type,
                } => {
                    let r#const = parse_json_value(lexer)?;
                    state = ObjectState::Const {
                        r#const: Some(r#const),
                        r#type,
                    };
                }
                ObjectState::Const {
                    r#const: Some(_), ..
                } => {
                    return Err(Report::new(ParseError::RepeatedObjectKey { key: "const" })
                        .attach(Location::new(key_token.span)));
                }
                _ => {
                    return Err(Report::new(ParseError::UnexpectedKey { key: "const" })
                        .attach(Location::new(key_token.span)));
                }
            },
            "type" => match state {
                ObjectState::Unknown => {
                    let r#type = parse_path(arena, lexer)?;
                    state = ObjectState::Const {
                        r#const: None,
                        r#type: Some(r#type),
                    };
                }
                ObjectState::Const {
                    r#const,
                    r#type: None,
                } => {
                    let r#type = parse_path(arena, lexer)?;
                    state = ObjectState::Const {
                        r#const,
                        r#type: Some(r#type),
                    };
                }
                ObjectState::Const {
                    r#type: Some(_), ..
                } => {
                    return Err(Report::new(ParseError::RepeatedObjectKey { key: "type" })
                        .attach(Location::new(key_token.span)));
                }
                _ => {
                    return Err(Report::new(ParseError::UnexpectedKey { key: "type" })
                        .attach(Location::new(key_token.span)));
                }
            },
            "var" => match state {
                ObjectState::Unknown => {
                    let var = parse_path(arena, lexer)?;
                    state = ObjectState::Variable { var };
                }
                ObjectState::Variable { .. } => {
                    return Err(Report::new(ParseError::RepeatedObjectKey { key: "var" })
                        .attach(Location::new(key_token.span)));
                }
                _ => {
                    return Err(Report::new(ParseError::UnexpectedKey { key: "var" })
                        .attach(Location::new(key_token.span)));
                }
            },
            "sig" => match state {
                ObjectState::Unknown => {
                    let sig = parse_signature(arena, lexer)?;
                    state = ObjectState::Signature { sig };
                }
                ObjectState::Signature { .. } => {
                    return Err(Report::new(ParseError::RepeatedObjectKey { key: "sig" })
                        .attach(Location::new(key_token.span)));
                }
                _ => {
                    return Err(Report::new(ParseError::UnexpectedKey { key: "sig" })
                        .attach(Location::new(key_token.span)));
                }
            },
            _ => {
                return Err(Report::new(ParseError::UnknownObjectKey {
                    key: key.into_owned().into_boxed_str(),
                })
                .attach(Location::new(key_token.span)));
            }
        }
    }

    let expr = match state {
        ObjectState::Unknown => {
            return Err(Report::new(ParseError::EmptyObject).attach(Location::new(token.span)));
        }
        ObjectState::Call { r#fn, args } => {
            let r#fn = r#fn.ok_or_else(|| {
                Report::new(ParseError::MissingObjectKey { key: "fn" })
                    .attach(Location::new(token.span))
            })?;
            let args = args
                .map(|args| args.into_boxed_slice())
                .unwrap_or_else(|| arena.boxed([]));

            Expr::Call(Call {
                r#fn: arena.boxed(r#fn),
                args,
            })
        }
        ObjectState::Const { r#const, r#type } => {
            let r#const = r#const.ok_or_else(|| {
                Report::new(ParseError::MissingObjectKey { key: "const" })
                    .attach(Location::new(token.span))
            })?;

            Expr::Constant(Constant { r#const, r#type })
        }
        ObjectState::Variable { var } => Expr::Path(var),
        ObjectState::Signature { sig } => Expr::Signature(sig),
    };

    Ok(Node { expr, span })
}

/// Parse a call expression
///
/// This function assumes that the lexer has already consumed the opening bracket of the array.
fn parse_call_array<'a>(
    arena: &'a Arena,
    lexer: &mut Lexer,
    token: Token,
) -> Result<Node<'a>, ParseError> {
    let mut span = token.span;
    let mut r#fn = None;
    let mut args = arena.vec(None);

    let mut token = next!(lexer);
    let mut first = true;

    // TODO: test `[]`, `[1]`, `[1, 2]`, error on `[1,]`, `[1, 2,]`, `[,1]`, `[,]`
    loop {
        // immediately terminate if we find the closing bracket
        if token.kind == TokenKind::RBracket {
            span = span.cover(token.span);
            break;
        }

        let node = if first {
            // in case we're first, we don't expect a comma, instead just immediately parse the
            // expression
            first = false;
            parse_expr(arena, lexer, Some(token))?
        } else if token.kind != TokenKind::Comma {
            return Err(
                Report::new(ParseError::ExpectedCommaOrRBracket).attach(Location::new(token.span))
            );
        } else {
            parse_expr(arena, lexer, None)?
        };

        if r#fn.is_none() {
            r#fn = Some(arena.boxed(node));
        } else {
            args.push(node);
        }

        token = next!(lexer);
    }

    let Some(r#fn) = r#fn else {
        return Err(Report::new(ParseError::CallExpectedFn).attach(Location::new(span)));
    };

    Ok(Node {
        expr: Expr::Call(Call {
            r#fn,
            args: args.into_boxed_slice(),
        }),
        span,
    })
}

/// Parse a string
///
/// This function assumes that the token given is a string.
fn parse_string<'a>(arena: &'a Arena, token: Token) -> Result<Node<'a>, ParseError> {
    let span = token.span;

    let TokenKind::String(value) = token.kind else {
        return Err(Report::new(ParseError::ExpectedString).attach(Location::new(span)));
    };

    let expr = alt((
        parse_signature.map(Expr::Signature),
        parse_path.map(Expr::Path),
    ))
    .parse(winnow::Stateful {
        input: value.as_ref(),
        state: arena,
    })
    .map_err(WinnowError::from)
    .change_context(ParseError::PathOrSignature)?;

    Ok(Node { expr, span })
}
