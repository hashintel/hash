use error_stack::{Report, Result, ResultExt};
use hql_cst_lex::{Lexer, Location, SyntaxKind, TokenKind};
use text_size::TextRange;
use winnow::{Located, Parser};

use super::{util::ArrayParser, value::ValueParser, ExprParser, WinnowError};
use crate::{
    arena, parse::json::util::EofParser, path::parse_path, signature::parse_signature,
    value::Value, Arena, Call, Expr, Node, Path, Signature, Spanned,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, thiserror::Error)]
pub enum ObjectParseError {
    #[error("duplicate key `{name}`")]
    DuplicateKey { name: &'static str },
    #[error("unable to parse")]
    Parse,
    #[error("signature object only allows for `sig` key")]
    SignatureInvalidKey,
    #[error("expected `args` array, received `{received}`")]
    ExpectedArgsArray { received: SyntaxKind },
    #[error("call object only allows for `fn` and `args` keys")]
    CallInvalidKey,
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
}

trait ObjectState<'arena> {
    fn unknown<'source>(key: &str) -> Option<Self>
    where
        Self: Sized;

    fn apply<'source>(
        &mut self,
        key: &str,
        expr: &ExprParser<'arena>,
        lexer: &mut Lexer<'source>,
    ) -> Result<(), ObjectParseError>;

    fn finalize<'source>(
        self,
        arena: &'arena Arena,
        span: TextRange,
    ) -> Result<Node<'arena>, ObjectParseError>;
}

struct CallState<'arena> {
    r#fn: Option<Node<'arena>>,
    r#args: Option<arena::Vec<'arena, Node<'arena>>>,
}

impl<'arena> ObjectState<'arena> for CallState<'arena> {
    fn unknown<'source>(key: &str) -> Option<Self>
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

    fn apply<'source>(
        &mut self,
        key: &str,
        expr: &ExprParser<'arena>,
        lexer: &mut Lexer<'source>,
    ) -> Result<(), ObjectParseError> {
        match key {
            "fn" if self.r#fn.is_some() => {
                return Err(Report::new(ObjectParseError::DuplicateKey { name: "fn" }));
            }
            "fn" => {
                let node = expr
                    .parse_expr(lexer, None)
                    .change_context(ObjectParseError::Parse)?;

                self.r#fn = Some(node);
            }
            "args" if self.args.is_some() => {
                return Err(Report::new(ObjectParseError::DuplicateKey { name: "args" }));
            }
            "args" => {
                let token = {
                    let mut parser = EofParser { lexer };
                    parser.advance().change_context(ObjectParseError::Parse)?
                };
                if token.kind != TokenKind::LBracket {
                    return Err(Report::new(ObjectParseError::ExpectedArgsArray {
                        received: SyntaxKind::from(&token.kind),
                    }));
                }

                let mut args = expr.arena.vec(None);

                ArrayParser::new(lexer)
                    .parse(token, |lexer, token| {
                        let arg = expr.parse_expr(lexer, token)?;
                        args.push(arg);
                        Ok(())
                    })
                    .change_context(ObjectParseError::Parse)?;

                self.r#args = Some(args);
            }
            _ => return Err(Report::new(ObjectParseError::CallInvalidKey)),
        }

        Ok(())
    }

    fn finalize<'source>(
        self,
        arena: &'arena Arena,
        span: TextRange,
    ) -> Result<Node<'arena>, ObjectParseError> {
        let r#fn = self
            .r#fn
            .ok_or_else(|| Report::new(ObjectParseError::MissingKey { name: "fn" }))?;
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

struct ConstState<'arena, 'source> {
    r#const: Option<Value<'arena, 'source>>,
    r#type: Option<Spanned<Path<'arena>>>,
}

impl<'arena, 'source> ObjectState<'arena> for ConstState<'arena, 'source> {
    fn unknown<'source>(key: &str) -> Option<Self>
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

    fn apply<'source>(
        &mut self,
        key: &str,
        expr: &ExprParser<'arena>,
        lexer: &mut Lexer<'source>,
    ) -> Result<(), ObjectParseError> {
        match key {
            "const" if self.r#const.is_some() => {
                return Err(Report::new(ObjectParseError::DuplicateKey {
                    name: "const",
                }));
            }
            "const" => {
                let parser = ValueParser::new(expr.arena);

                let value = parser
                    .parse(lexer, None)
                    .change_context(ObjectParseError::Parse)?;

                self.r#const = Some(value);
            }
            "type" if self.r#type.is_some() => {
                return Err(Report::new(ObjectParseError::DuplicateKey { name: "type" }));
            }
            "type" => {
                let token = {
                    let mut parser = EofParser { lexer };
                    parser.advance().change_context(ObjectParseError::Parse)?
                };

                let TokenKind::String(value) = token.kind else {
                    return Err(Report::new(ObjectParseError::ExpectedTypeString {
                        received: SyntaxKind::from(&token.kind),
                    }));
                };

                let path = parse_path
                    .parse(winnow::Stateful {
                        input: Located::new(value.as_ref()),
                        state: expr.arena,
                    })
                    .map_err(WinnowError::from)
                    .change_context(ObjectParseError::ParsePath)
                    .attach(Location::new(token.span))?;

                self.r#type = Some(path);
            }
            _ => return Err(Report::new(ObjectParseError::CallInvalidKey)),
        }

        Ok(())
    }

    fn finalize<'source>(
        self,
        arena: &'arena Arena,
        span: TextRange,
    ) -> Result<Node<'arena>, ObjectParseError> {
        todo!()
    }
}

struct VariableState<'arena> {
    var: Option<Path<'arena>>,
}

impl<'arena> ObjectState<'arena> for VariableState<'arena> {
    fn unknown<'source>(key: &str) -> Option<Self>
    where
        Self: Sized,
    {
        match key {
            "var" => Some(Self { var: None }),
            _ => None,
        }
    }

    fn apply<'source>(
        &mut self,
        key: &str,
        expr: &ExprParser<'arena>,
        lexer: &mut Lexer<'source>,
    ) -> Result<(), ObjectParseError> {
        match key {
            "var" if self.var.is_some() => {
                return Err(Report::new(ObjectParseError::DuplicateKey { name: "var" }));
            }
            "var" => {
                let token = {
                    let mut parser = EofParser { lexer };
                    parser.advance().change_context(ObjectParseError::Parse)?
                };

                let TokenKind::String(value) = token.kind else {
                    return Err(Report::new(ObjectParseError::ExpectedVariableString {
                        received: SyntaxKind::from(&token.kind),
                    }));
                };

                let path = parse_path
                    .parse(winnow::Stateful {
                        input: Located::new(value.as_ref()),
                        state: expr.arena,
                    })
                    .map_err(WinnowError::from)
                    .change_context(ObjectParseError::ParsePath)
                    .attach(Location::new(token.span))?;

                self.var = Some(path);
                Ok(())
            }
            _ => return Err(Report::new(ObjectParseError::SignatureInvalidKey)),
        }
    }

    fn finalize<'source>(
        self,
        _: &'arena Arena,
        span: TextRange,
    ) -> Result<Node<'arena>, ObjectParseError> {
        let var = self
            .var
            .ok_or_else(|| Report::new(ObjectParseError::MissingKey { name: "var" }))?;

        Ok(Node {
            expr: Expr::Path(var),
            span,
        })
    }
}

struct SignatureState<'arena> {
    sig: Option<Signature<'arena>>,
}

impl<'arena> ObjectState<'arena> for SignatureState<'arena> {
    fn unknown<'source>(key: &str) -> Option<Self>
    where
        Self: Sized,
    {
        match key {
            "sig" => Some(Self { sig: None }),
            _ => None,
        }
    }

    fn apply<'source>(
        &mut self,
        key: &str,
        expr: &ExprParser<'arena>,
        lexer: &mut Lexer<'source>,
    ) -> Result<(), ObjectParseError> {
        match key {
            "sig" if self.sig.is_some() => {
                return Err(Report::new(ObjectParseError::DuplicateKey { name: "sig" }));
            }
            "sig" => {
                let token = {
                    let mut parser = EofParser { lexer };
                    parser.advance().change_context(ObjectParseError::Parse)?
                };

                let TokenKind::String(value) = token.kind else {
                    return Err(Report::new(ObjectParseError::ExpectedSignatureString {
                        received: SyntaxKind::from(&token.kind),
                    }));
                };

                let sig = parse_signature
                    .parse(winnow::Stateful {
                        input: Located::new(value.as_ref()),
                        state: expr.arena,
                    })
                    .map_err(WinnowError::from)
                    .change_context(ObjectParseError::ParseSignature)
                    .attach(Location::new(token.span))?;

                self.sig = Some(sig);
                Ok(())
            }
            _ => return Err(Report::new(ObjectParseError::SignatureInvalidKey)),
        }
    }

    fn finalize<'source>(
        self,
        _: &'arena Arena,
        span: TextRange,
    ) -> Result<Node<'arena>, ObjectParseError> {
        let sig = self
            .sig
            .ok_or_else(|| Report::new(ObjectParseError::MissingKey { name: "sig" }))?;

        Ok(Node {
            expr: Expr::Signature(sig),
            span,
        })
    }
}

enum State<'arena, 'source> {
    Unknown,
}

pub struct ObjectParser {}
