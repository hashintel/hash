use std::io::Cursor;

use error_stack::{Report, Result, ResultExt};
use jiter::{Jiter, JiterError, JiterResult, JsonValue, Peek};
use struson::reader::{
    simple::{SimpleJsonReader, ValueReader},
    JsonReader, JsonStreamReader, ReaderError, ValueType,
};
use text_size::{TextRange, TextSize};
use winnow::{
    combinator::{alt, ParserIterator},
    error::{ContextError, ErrMode, ParserError},
    stream::{AsBStr, Stream},
    Parser,
};

use crate::{
    arena, path::parse_path, signature::parse_signature, Arena, Call, Expr, Node, Path, Signature,
    Symbol,
};

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ParseError {
    #[error("unable to parse JSON")]
    Json,
    #[error("unable to parse path or signature expression")]
    PathOrSignature,
    #[error("call expected a function to be called")]
    CallExpectedFn,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("{0}")]
pub struct JsonError(JiterError);

impl From<JiterError> for JsonError {
    fn from(error: JiterError) -> Self {
        Self(error)
    }
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

fn range(start: usize, end: usize) -> TextRange {
    TextRange::new(
        TextSize::try_from(start).expect("the input should never be larger than 4GiB"),
        TextSize::try_from(end).expect("the input should never be larger than 4GiB"),
    )
}

fn parse_expr<'a>(
    arena: &'a Arena,
    parser: &mut Jiter,
    peek: Option<Peek>,
) -> Result<Node<'a>, ParseError> {
    let peek = match peek {
        Some(peek) => peek,
        None => parser
            .peek()
            .map_err(JsonError::from)
            .change_context(ParseError::Json)?,
    };

    match peek {
        Peek::String => parse_string(arena, parser),
        Peek::Array => parse_call_array(arena, parser),
        Peek::Object => parse_object(arena, parser),
        _ => todo!(),
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
        var: Symbol,
    },
    Signature {
        sig: Signature<'a>,
    },
}

fn parse_object<'a>(arena: &'a Arena, parser: &mut Jiter) -> Result<Node<'a>, ParseError> {
    let start = parser.current_index();
    let mut key = parser
        .known_object()
        .map_err(JsonError::from)
        .change_context(ParseError::Json)?;

    let mut state = ObjectState::Unknown;
    while let Some(peek) = key {
        // todo: parse the next value
        match peek {
            "fn" if matches!(state, ObjectState::Unknown) => {
                let node = parse_expr(arena, parser, None)?;
                state = ObjectState::Call {
                    r#fn: Some(node),
                    args: None,
                };
            }
            "fn" if matches!(state, ObjectState::Call { r#fn: None, args }) => {
                let node = parse_expr(arena, parser, None)?;
                state = ObjectState::Call {
                    r#fn: Some(node),
                    args,
                };
            }
            "fn" if matches!(state, ObjectState::Call { r#fn: Some(_), .. }) => {
                return Err(Report::new(ParseError::RepeatedObjectKey { key: "fn" }));
            }
            "args" if matches!(state, ObjectState::Unknown) => {
                let args = parse_expr_array(arena, parser)?;
                state = ObjectState::Call {
                    r#fn: None,
                    args: Some(args),
                };
            }
            "args" if matches!(state, ObjectState::Call { r#fn, args: None }) => {
                let args = parse_expr_array(arena, parser)?;
                state = ObjectState::Call {
                    r#fn,
                    args: Some(args),
                };
            }
            "args" if matches!(state, ObjectState::Call { args: Some(_), .. }) => {
                return Err(Report::new(ParseError::RepeatedObjectKey { key: "args" }));
            }
        }

        key = parser
            .next_key()
            .map_err(JsonError::from)
            .change_context(ParseError::Json)?;
    }

    let end = parser.current_index();
    let range = range(start, end);

    todo!()
}

fn parse_call_array<'a>(arena: &'a Arena, parser: &mut Jiter) -> Result<Node<'a>, ParseError> {
    let start = parser.current_index();
    let mut item = parser
        .known_array()
        .map_err(JsonError::from)
        .change_context(ParseError::Json)?;

    let mut callee = None;
    let mut args = arena.vec(None);

    while let Some(peek) = item {
        let node = parse_expr(arena, parser, Some(peek))?;

        if callee.is_none() {
            callee = Some(arena.boxed(node));
        } else {
            args.push(node);
        }

        item = parser
            .array_step()
            .map_err(JsonError::from)
            .change_context(ParseError::Json)?;
    }

    // TODO: attach the location to the error as diagnostic!
    let end = parser.current_index();
    let range = range(start, end);

    let Some(callee) = callee else {
        return Err(Report::from(ParseError::CallExpectedFn));
    };

    Ok(Node {
        expr: Expr::Call(Call {
            r#fn: callee,
            args: args.into_boxed_slice(),
        }),
        range,
    })
}

fn parse_string<'a>(arena: &'a Arena, parser: &mut Jiter) -> Result<Node<'a>, ParseError> {
    // we know we're a string
    let start = parser.current_index();
    let value = parser
        .known_str()
        .map_err(JsonError::from)
        .change_context(ParseError::Json)?;

    let expr = alt((
        parse_signature.map(Expr::Signature),
        parse_path.map(Expr::Path),
    ))
    .parse(winnow::Stateful {
        input: value,
        state: arena,
    })
    .map_err(WinnowError::from)
    .change_context(ParseError::PathOrSignature)?;

    let end = parser.current_index();
    let range = range(start, end);

    Ok(Node { expr, range })
}
