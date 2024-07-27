use justjson::{parser::PeekableTokenKind, ErrorKind, JsonNumber, JsonString};
use text_size::{TextRange, TextSize};

macro_rules! size {
    ($expr:expr) => {
        TextSize::try_from($expr).expect("infallible, input is never larger than 4GiB")
    };
    ($start:expr, $end:expr) => {
        TextRange::new(size!($start), size!($end))
    };
}

pub struct Error {
    kind: ErrorKind,
    range: TextRange,
}

impl From<justjson::Error> for Error {
    fn from(error: justjson::Error) -> Self {
        Self {
            kind: error.kind().clone(),
            range: TextRange::empty(size!(error.offset())),
        }
    }
}

pub enum SyntaxKind {
    Null,
    True,
    False,
    String,
    Number,
    LBrace,
    RBrace,
    LBracket,
    RBracket,
    Colon,
    Comma,
    Unrecognized,
}

impl From<PeekableTokenKind> for SyntaxKind {
    fn from(value: PeekableTokenKind) -> Self {
        match value {
            PeekableTokenKind::Null => Self::Null,
            PeekableTokenKind::True => Self::True,
            PeekableTokenKind::False => Self::False,
            PeekableTokenKind::String => Self::String,
            PeekableTokenKind::Number => Self::Number,
            PeekableTokenKind::Object => Self::LBrace,
            PeekableTokenKind::ObjectEnd => Self::RBrace,
            PeekableTokenKind::Array => Self::LBracket,
            PeekableTokenKind::ArrayEnd => Self::RBracket,
            PeekableTokenKind::Colon => Self::Colon,
            PeekableTokenKind::Comma => Self::Comma,
            PeekableTokenKind::Unrecognized => Self::Unrecognized,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TokenKind<'a> {
    Null,
    Bool(bool),
    String(JsonString<'a>),
    Number(JsonNumber<'a>),
    Object,
    ObjectEnd,
    Array,
    ArrayEnd,
    Colon,
    Comma,
}

impl<'a> From<justjson::parser::Token<'a>> for TokenKind<'a> {
    fn from(value: justjson::parser::Token<'a>) -> Self {
        match value {
            justjson::parser::Token::Null => Self::Null,
            justjson::parser::Token::Bool(value) => Self::Bool(value),
            justjson::parser::Token::String(value) => Self::String(value),
            justjson::parser::Token::Number(value) => Self::Number(value),
            justjson::parser::Token::Object => Self::Object,
            justjson::parser::Token::ObjectEnd => Self::ObjectEnd,
            justjson::parser::Token::Array => Self::Array,
            justjson::parser::Token::ArrayEnd => Self::ArrayEnd,
            justjson::parser::Token::Colon => Self::Colon,
            justjson::parser::Token::Comma => Self::Comma,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Nested {
    Object,
    Array,
}

pub struct Token<'a> {
    pub kind: TokenKind<'a>,
    pub range: TextRange,
}

pub struct Lexer<'a> {
    inner: justjson::parser::Tokenizer<'a, true>,
    stack: Vec<Nested>,
}

impl<'a> Lexer<'a> {
    pub fn peek(&mut self) -> Option<SyntaxKind> {
        self.inner.peek().map(From::from)
    }

    /// Returns the next token in the stream.
    ///
    /// # Errors
    ///
    /// Returns an error if the next token is invalid.
    pub fn bump(&mut self) -> Result<Option<Token<'a>>, Error> {
        let start = self.inner.offset();
        let Some(token) = self.inner.next() else {
            return Ok(None);
        };
        let token = token?;
        let end = self.inner.offset();

        Ok(Some(Token {
            kind: token.into(),
            range: size!(start, end),
        }))
    }

    pub fn recover(&mut self, depth: usize) -> Result<(), Error> {
        while self.stack.len() > depth {
            let Some(next) = self.stack.pop() else {
                return Err(Error {
                    kind: ErrorKind::UnexpectedEof,
                    range: TextRange::empty(size!(self.inner.offset())),
                });
            };

            loop {
                let Some(token) = self.bump()? else {
                    return Err(Error {
                        kind: ErrorKind::UnexpectedEof,
                        range: TextRange::empty(size!(self.inner.offset())),
                    });
                };

                if next == Nested::Object && token.kind == TokenKind::ObjectEnd {
                    break;
                }

                if next == Nested::Array && token.kind == TokenKind::ArrayEnd {
                    break;
                }
            }
        }

        Ok(())
    }

    pub fn on_array<E>(
        &mut self,
        mut on_item: impl FnMut(&mut Self, Token<'a>) -> Result<(), E>,
    ) -> Result<(), Error>
    where
        Error: From<E>,
    {
        // TODO: make this a report instead!
        let mut errors = Vec::new();
        // we assume that the LBracket token has already been consumed
        // add a recovery checkpoint
        self.stack.push(Nested::Array);
        let depth = self.stack.len();

        loop {
            let Some(token) = self.bump()? else {
                self.stack.pop();
                return Err(Error {
                    kind: ErrorKind::UnexpectedEof,
                    range: TextRange::empty(size!(self.inner.offset())),
                });
            };

            if token.kind == TokenKind::ArrayEnd {
                break;
            }

            if let Err(error) = on_item(self, token) {
                self.recover(depth)?;
                errors.push(error);
            }

            let Some(token) = self.bump()? else {
                self.stack.pop();
                return Err(Error {
                    kind: ErrorKind::UnexpectedEof,
                    range: TextRange::empty(size!(self.inner.offset())),
                });
            };

            // we're gracious and allow a trailing comma (even tho it is not allowed by the spec)
            if token.kind != TokenKind::Comma && token.kind != TokenKind::ArrayEnd {
                self.stack.pop();
                // TODO: part of error accumulation
                return Err(Error {
                    kind: ErrorKind::ExpectedCommaOrEndOfArray,
                    range: token.range,
                });
            }
        }

        // remove the recovery checkpoint
        self.stack.pop();
        todo!()
    }
}
