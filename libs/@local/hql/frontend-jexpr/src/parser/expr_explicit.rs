use hql_cst::{
    expr::{constant::Constant, Expr, ExprKind},
    r#type::Type,
    value::Value,
};
use hql_diagnostics::{help::Help, Diagnostic};
use hql_span::SpanId;
use winnow::{Located, Parser};

use super::{
    error::{
        duplicate_key, expected_non_empty_object, invalid_type, required_key, unexpected_token,
        unknown_key,
    },
    object::{parse_object, Key},
    stream::TokenStream,
    string::ParseState,
    r#type::parse_type,
    value::parse_value,
};
use crate::{
    lexer::{syntax_kind::SyntaxKind, token::Token, token_kind::TokenKind},
    span::Span,
};

trait ObjectState<'arena, 'source> {
    fn unknown(key: &str) -> Option<Self>
    where
        Self: Sized;

    fn apply(
        &mut self,
        stream: &mut TokenStream<'arena, 'source>,
        key: Key<'source>,
    ) -> Result<(), Diagnostic<'static, SpanId>>;

    fn finalize(
        self,
        stream: &mut TokenStream<'arena, 'source>,
        span: SpanId,
    ) -> Result<Expr<'arena, 'source>, Diagnostic<'static, SpanId>>;
}

struct ConstantState<'arena, 'source> {
    r#const: Option<Value<'arena, 'source>>,
    r#type: Option<Type<'arena>>,
}

impl<'arena, 'source> ObjectState<'arena, 'source> for ConstantState<'arena, 'source> {
    fn unknown(key: &str) -> Option<Self>
    where
        Self: Sized,
    {
        match key {
            "const" | "type" => Some(Self {
                r#const: None,
                r#type: None,
            }),
            _ => None,
        }
    }

    fn apply(
        &mut self,
        stream: &mut TokenStream<'arena, 'source>,
        key: Key<'source>,
    ) -> Result<(), Diagnostic<'static, SpanId>> {
        match (self, key.value.as_ref()) {
            (
                Self {
                    r#const: Some(value),
                    ..
                },
                "const",
            ) => {
                let span = stream.insert_span(Span {
                    range: key.span,
                    pointer: stream.pointer(),
                    parent_id: None,
                });

                return Err(duplicate_key(span, value.span));
            }
            (this, "const") => {
                let value = parse_value(stream, None)?;

                this.r#const = Some(value);
            }
            (
                Self {
                    r#type: Some(value),
                    ..
                },
                "type",
            ) => {
                let span = stream.insert_span(Span {
                    range: key.span,
                    pointer: stream.pointer(),
                    parent_id: None,
                });

                return Err(duplicate_key(span, value.span));
            }
            (this, "type") => {
                let token = stream.next_or_err()?;
                let span = stream.insert_span(Span {
                    range: token.span,
                    pointer: stream.pointer(),
                    parent_id: None,
                });

                let TokenKind::String(value) = token.kind else {
                    let mut diagnostic = unexpected_token(span, [SyntaxKind::String]);

                    diagnostic.help = Some(Help::new(
                        "The type of a constant must be a type expression, not any other kind of \
                         expression.",
                    ));

                    return Err(diagnostic);
                };

                let r#type = parse_type
                    .parse(winnow::Stateful {
                        input: Located::new(value.as_ref()),
                        state: ParseState {
                            arena: stream.arena,
                            spans: &stream.spans,
                            parent_id: Some(span),
                        },
                    })
                    .map_err(|error| invalid_type(span, error))?;

                this.r#type = Some(r#type);
            }
            _ => {
                let span = stream.insert_span(Span {
                    range: key.span,
                    pointer: stream.pointer(),
                    parent_id: None,
                });

                return Err(unknown_key(span, key.value, &["const", "type"]));
            }
        }

        Ok(())
    }

    fn finalize(
        self,
        _: &mut TokenStream<'arena, 'source>,
        span: SpanId,
    ) -> Result<Expr<'arena, 'source>, Diagnostic<'static, SpanId>> {
        let r#const = self.r#const.ok_or_else(|| required_key(span, "const"))?;
        let r#type = self.r#type;

        Ok(Expr {
            kind: ExprKind::Constant(Constant {
                value: r#const,
                r#type,
            }),
            span,
        })
    }
}

enum State<'arena, 'source> {
    Unknown,

    Constant(ConstantState<'arena, 'source>),
}

pub(crate) fn parse_expr_explicit<'arena, 'source>(
    stream: &mut TokenStream<'arena, 'source>,
    token: Token<'source>,
) -> Result<Expr<'arena, 'source>, Diagnostic<'static, SpanId>> {
    let mut state = State::Unknown;

    let span = parse_object(stream, token, |stream, key| {
        match &mut state {
            State::Unknown => {
                if let Some(mut constant) = ConstantState::unknown(key.value.as_ref()) {
                    constant.apply(stream, key)?;
                    state = State::Constant(constant);
                } else {
                    let span = stream.insert_span(Span {
                        range: key.span,
                        pointer: stream.pointer(),
                        parent_id: None,
                    });

                    return Err(unknown_key(span, key.value, &["const", "type"]));
                }
            }
            State::Constant(constant) => {
                constant.apply(stream, key)?;
            }
        }

        Ok(())
    })?;

    let span = stream.insert_span(Span {
        range: span,
        pointer: stream.pointer(),
        parent_id: None,
    });

    match state {
        State::Unknown => Err(expected_non_empty_object(span)),
        State::Constant(constant) => constant.finalize(stream, span),
    }
}
