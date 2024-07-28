use error_stack::{Report, Result, ResultExt};
use hql_cst_lex::{Lexer, Location, SyntaxKind, Token, TokenKind};
use text_size::TextRange;
use winnow::{Located, Parser};

use super::{
    node::NodeParser,
    util::{self, ArrayParser},
    value::ValueParser,
    WinnowError,
};
use crate::{
    arena::{self, Arena},
    expr::{
        call::Call,
        constant::{Constant, ConstantType},
        path::{parse_path, Path},
        signature::{parse_signature, Signature},
        Expr,
    },
    parse::json::util::EofParser,
    symbol::ParseRestriction,
    r#type::parse_type,
    value::Value,
    Node,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash, thiserror::Error)]
pub enum NodePbjectParseError {
    #[error("duplicate key `{name}`")]
    DuplicateKey { name: &'static str },
    #[error("unable to parse")]
    Parse,
    #[error("signature object only allows for `sig` key, received `{name}`")]
    SignatureInvalidKey { name: Box<str> },
    #[error("variable object only allows for `var` key, received `{name}`")]
    VariableInvalidKey { name: Box<str> },
    #[error("expected `args` array, received `{received}`")]
    ExpectedArgsArray { received: SyntaxKind },
    #[error("call object only allows for `fn` and `args` keys, received `{name}`")]
    CallInvalidKey { name: Box<str> },
    #[error("missing required key `{name}`")]
    MissingKey { name: &'static str },
    #[error("expected key `var` to be a string, received `{received}`")]
    ExpectedVariableString { received: SyntaxKind },
    #[error("expected key `sig` to be a signature, received `{received}`")]
    ExpectedSignatureString { received: SyntaxKind },
    #[error("unable to parse signature")]
    ParseSignature,
    #[error("unable to parse path")]
    ParsePath,
    #[error("unexpected key `{name}`")]
    UnknownKey { name: Box<str> },
    #[error("expected key `type` to be a string, received `{received}`")]
    ExpectedTypeString { received: SyntaxKind },
    #[error("received empty object, but expected non-empty one")]
    EmptyObject,
}

trait ObjectState<'arena, 'source> {
    fn unknown(key: &str) -> Option<Self>
    where
        Self: Sized;

    fn apply(
        &mut self,
        key: &str,
        key_span: TextRange,
        arena: &'arena Arena,
        lexer: &mut Lexer<'source>,
    ) -> Result<(), NodePbjectParseError>;

    fn finalize(
        self,
        arena: &'arena Arena,
        span: TextRange,
    ) -> Result<Node<'arena, 'source>, NodePbjectParseError>;
}

struct CallState<'arena, 'source> {
    r#fn: Option<Node<'arena, 'source>>,
    r#args: Option<arena::Vec<'arena, Node<'arena, 'source>>>,
}

impl<'arena, 'source> ObjectState<'arena, 'source> for CallState<'arena, 'source> {
    fn unknown(key: &str) -> Option<Self>
    where
        Self: Sized,
    {
        match key {
            "fn" | "args" => Some(Self {
                r#fn: None,
                r#args: None,
            }),
            _ => None,
        }
    }

    fn apply(
        &mut self,
        key: &str,
        key_span: TextRange,
        arena: &'arena Arena,
        lexer: &mut Lexer<'source>,
    ) -> Result<(), NodePbjectParseError> {
        match key {
            "fn" if self.r#fn.is_some() => {
                return Err(Report::new(NodePbjectParseError::DuplicateKey {
                    name: "fn",
                }))
                .attach(Location::new(key_span));
            }
            "fn" => {
                let node = NodeParser::new(arena)
                    .parse_node(lexer, None)
                    .change_context(NodePbjectParseError::Parse)?;

                self.r#fn = Some(node);
            }
            "args" if self.args.is_some() => {
                return Err(Report::new(NodePbjectParseError::DuplicateKey {
                    name: "args",
                }))
                .attach(Location::new(key_span));
            }
            "args" => {
                let token = {
                    let mut parser = EofParser { lexer };
                    parser
                        .advance()
                        .change_context(NodePbjectParseError::Parse)?
                };
                if token.kind != TokenKind::LBracket {
                    return Err(Report::new(NodePbjectParseError::ExpectedArgsArray {
                        received: SyntaxKind::from(&token.kind),
                    }));
                }

                let mut args = arena.vec(None);

                ArrayParser::new(lexer)
                    .parse(token, |lexer, token| {
                        let arg = NodeParser::new(arena).parse_node(lexer, token)?;
                        args.push(arg);
                        Ok(())
                    })
                    .change_context(NodePbjectParseError::Parse)?;

                self.r#args = Some(args);
            }
            _ => {
                return Err(Report::new(NodePbjectParseError::CallInvalidKey {
                    name: Box::from(key),
                }))
                .attach(Location::new(key_span));
            }
        }

        Ok(())
    }

    #[expect(
        clippy::map_unwrap_or,
        reason = "map->unwrap_or_else is used for typing purposes of the resulting box"
    )]
    fn finalize(
        self,
        arena: &'arena Arena,
        span: TextRange,
    ) -> Result<Node<'arena, 'source>, NodePbjectParseError> {
        let r#fn = self.r#fn.ok_or_else(|| {
            Report::new(NodePbjectParseError::MissingKey { name: "fn" }).attach(Location::new(span))
        })?;
        let args = self
            .r#args
            .map(Vec::into_boxed_slice)
            .unwrap_or_else(|| arena.boxed([]));

        Ok(Node {
            expr: Expr::Call(Call {
                r#fn: arena.boxed(r#fn),
                args,
            }),
            span,
        })
    }
}

struct ConstantState<'arena, 'source> {
    r#const: Option<Value<'arena, 'source>>,
    r#type: Option<ConstantType<'arena>>,
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
        key: &str,
        key_span: TextRange,
        arena: &'arena Arena,
        lexer: &mut Lexer<'source>,
    ) -> Result<(), NodePbjectParseError> {
        match key {
            "const" if self.r#const.is_some() => {
                return Err(Report::new(NodePbjectParseError::DuplicateKey {
                    name: "const",
                }))
                .attach(Location::new(key_span));
            }
            "const" => {
                let parser = ValueParser::new(arena);

                let value = parser
                    .parse(lexer, None)
                    .change_context(NodePbjectParseError::Parse)?;

                self.r#const = Some(value);
            }
            "type" if self.r#type.is_some() => {
                return Err(Report::new(NodePbjectParseError::DuplicateKey {
                    name: "type",
                }))
                .attach(Location::new(key_span));
            }
            "type" => {
                let token = {
                    let mut parser = EofParser { lexer };
                    parser
                        .advance()
                        .change_context(NodePbjectParseError::Parse)?
                };

                let TokenKind::String(value) = token.kind else {
                    return Err(Report::new(NodePbjectParseError::ExpectedTypeString {
                        received: SyntaxKind::from(&token.kind),
                    }));
                };

                let r#type = parse_type
                    .parse(winnow::Stateful {
                        input: Located::new(value.as_ref()),
                        state: arena,
                    })
                    .map_err(WinnowError::from)
                    .change_context(NodePbjectParseError::ParsePath)
                    .attach(Location::new(token.span))?;

                self.r#type = Some(ConstantType {
                    r#type,
                    span: token.span,
                });
            }
            _ => {
                return Err(Report::new(NodePbjectParseError::CallInvalidKey {
                    name: Box::from(key),
                }))
                .attach(Location::new(key_span));
            }
        }

        Ok(())
    }

    fn finalize(
        self,
        _: &'arena Arena,
        span: TextRange,
    ) -> Result<Node<'arena, 'source>, NodePbjectParseError> {
        let r#const = self.r#const.ok_or_else(|| {
            Report::new(NodePbjectParseError::MissingKey { name: "const" })
                .attach(Location::new(span))
        })?;
        let r#type = self.r#type;

        Ok(Node {
            expr: Expr::Constant(Constant {
                value: r#const,
                r#type,
            }),
            span,
        })
    }
}

struct VariableState<'arena> {
    var: Option<Path<'arena>>,
}

impl<'arena, 'source> ObjectState<'arena, 'source> for VariableState<'arena> {
    fn unknown(key: &str) -> Option<Self>
    where
        Self: Sized,
    {
        match key {
            "var" => Some(Self { var: None }),
            _ => None,
        }
    }

    fn apply(
        &mut self,
        key: &str,
        key_span: TextRange,
        arena: &'arena Arena,
        lexer: &mut Lexer<'source>,
    ) -> Result<(), NodePbjectParseError> {
        match key {
            "var" if self.var.is_some() => {
                Err(
                    Report::new(NodePbjectParseError::DuplicateKey { name: "var" })
                        .attach(Location::new(key_span)),
                )
            }
            "var" => {
                let token = {
                    let mut parser = EofParser { lexer };
                    parser
                        .advance()
                        .change_context(NodePbjectParseError::Parse)?
                };

                let TokenKind::String(value) = token.kind else {
                    return Err(Report::new(NodePbjectParseError::ExpectedVariableString {
                        received: SyntaxKind::from(&token.kind),
                    }));
                };

                let path = parse_path(ParseRestriction::None)
                    .parse(winnow::Stateful {
                        input: Located::new(value.as_ref()),
                        state: arena,
                    })
                    .map_err(WinnowError::from)
                    .change_context(NodePbjectParseError::ParsePath)
                    .attach(Location::new(token.span))?;

                self.var = Some(path);
                Ok(())
            }
            _ => Err(Report::new(NodePbjectParseError::VariableInvalidKey {
                name: Box::from(key),
            })
            .attach(Location::new(key_span))),
        }
    }

    fn finalize(
        self,
        _: &'arena Arena,
        span: TextRange,
    ) -> Result<Node<'arena, 'source>, NodePbjectParseError> {
        let var = self.var.ok_or_else(|| {
            Report::new(NodePbjectParseError::MissingKey { name: "var" })
                .attach(Location::new(span))
        })?;

        Ok(Node {
            expr: Expr::Path(var),
            span,
        })
    }
}

struct SignatureState<'arena> {
    sig: Option<Signature<'arena>>,
}

impl<'arena, 'source> ObjectState<'arena, 'source> for SignatureState<'arena> {
    fn unknown(key: &str) -> Option<Self>
    where
        Self: Sized,
    {
        match key {
            "sig" => Some(Self { sig: None }),
            _ => None,
        }
    }

    fn apply(
        &mut self,
        key: &str,
        key_span: TextRange,
        arena: &'arena Arena,
        lexer: &mut Lexer<'source>,
    ) -> Result<(), NodePbjectParseError> {
        match key {
            "sig" if self.sig.is_some() => {
                Err(
                    Report::new(NodePbjectParseError::DuplicateKey { name: "sig" })
                        .attach(Location::new(key_span)),
                )
            }
            "sig" => {
                let token = {
                    let mut parser = EofParser { lexer };
                    parser
                        .advance()
                        .change_context(NodePbjectParseError::Parse)?
                };

                let TokenKind::String(value) = token.kind else {
                    return Err(Report::new(NodePbjectParseError::ExpectedSignatureString {
                        received: SyntaxKind::from(&token.kind),
                    }));
                };

                let sig = parse_signature
                    .parse(winnow::Stateful {
                        input: Located::new(value.as_ref()),
                        state: arena,
                    })
                    .map_err(WinnowError::from)
                    .change_context(NodePbjectParseError::ParseSignature)
                    .attach(Location::new(token.span))?;

                self.sig = Some(sig);
                Ok(())
            }
            _ => Err(Report::new(NodePbjectParseError::SignatureInvalidKey {
                name: Box::from(key),
            })
            .attach(Location::new(key_span))),
        }
    }

    fn finalize(
        self,
        _: &'arena Arena,
        span: TextRange,
    ) -> Result<Node<'arena, 'source>, NodePbjectParseError> {
        let sig = self.sig.ok_or_else(|| {
            Report::new(NodePbjectParseError::MissingKey { name: "sig" })
                .attach(Location::new(span))
        })?;

        Ok(Node {
            expr: Expr::Signature(sig),
            span,
        })
    }
}

enum State<'arena, 'source> {
    Unknown,
    Call(CallState<'arena, 'source>),
    Constant(ConstantState<'arena, 'source>),
    Variable(VariableState<'arena>),
    Signature(SignatureState<'arena>),
}

pub(crate) struct NodeObjectParser<'arena, 'source, 'lexer> {
    lexer: &'lexer mut Lexer<'source>,
    arena: &'arena Arena,
}

impl<'arena, 'source, 'lexer> NodeObjectParser<'arena, 'source, 'lexer> {
    pub(crate) fn new(lexer: &'lexer mut Lexer<'source>, arena: &'arena Arena) -> Self {
        Self { lexer, arena }
    }

    pub(crate) fn parse(
        &mut self,
        token: Token<'source>,
    ) -> Result<Node<'arena, 'source>, NodePbjectParseError> {
        let mut state = State::Unknown;

        let span = util::ObjectParser::new(self.lexer)
            .parse(token, |lexer, key, key_span| match &mut state {
                State::Unknown => {
                    if let Some(call) = CallState::unknown(key.as_ref()) {
                        state = State::Call(call);
                    } else if let Some(constant) = ConstantState::unknown(key.as_ref()) {
                        state = State::Constant(constant);
                    } else if let Some(variable) = VariableState::unknown(key.as_ref()) {
                        state = State::Variable(variable);
                    } else if let Some(signature) = SignatureState::unknown(key.as_ref()) {
                        state = State::Signature(signature);
                    } else {
                        return Err(Report::new(NodePbjectParseError::UnknownKey {
                            name: key.into_owned().into_boxed_str(),
                        }))
                        .attach(Location::new(key_span));
                    }

                    Ok(())
                }
                State::Call(call) => call.apply(key.as_ref(), key_span, self.arena, lexer),
                State::Constant(constant) => {
                    constant.apply(key.as_ref(), key_span, self.arena, lexer)
                }
                State::Variable(variable) => {
                    variable.apply(key.as_ref(), key_span, self.arena, lexer)
                }
                State::Signature(signature) => {
                    signature.apply(key.as_ref(), key_span, self.arena, lexer)
                }
            })
            .change_context(NodePbjectParseError::Parse)?;

        match state {
            State::Unknown => Err(Report::new(NodePbjectParseError::EmptyObject)),
            State::Call(call) => call.finalize(self.arena, span),
            State::Constant(constant) => constant.finalize(self.arena, span),
            State::Variable(variable) => variable.finalize(self.arena, span),
            State::Signature(signature) => signature.finalize(self.arena, span),
        }
    }
}
