use justjson::{parser::PeekableTokenKind, ErrorKind};
use text_size::{TextRange, TextSize};

fn offset_to_text_size(offset: usize) -> TextSize {
    TextSize::try_from(offset).expect("infallible, input is never larger than 4GiB")
}

fn token_to_kind(token: &justjson::parser::Token) -> PeekableTokenKind {
    match token {
        justjson::parser::Token::Null => PeekableTokenKind::Null,
        justjson::parser::Token::Bool(true) => PeekableTokenKind::True,
        justjson::parser::Token::Bool(false) => PeekableTokenKind::False,
        justjson::parser::Token::String(_) => PeekableTokenKind::String,
        justjson::parser::Token::Number(_) => PeekableTokenKind::Number,
        justjson::parser::Token::Object => PeekableTokenKind::Object,
        justjson::parser::Token::ObjectEnd => PeekableTokenKind::ObjectEnd,
        justjson::parser::Token::Array => PeekableTokenKind::Array,
        justjson::parser::Token::ArrayEnd => PeekableTokenKind::ArrayEnd,
        justjson::parser::Token::Colon => PeekableTokenKind::Colon,
        justjson::parser::Token::Comma => PeekableTokenKind::Comma,
    }
}

fn token_length(token: &justjson::parser::Token) -> TextSize {
    let length: u32 = match token {
        justjson::parser::Token::Null => 4,
        justjson::parser::Token::Bool(true) => 4,
        justjson::parser::Token::Bool(false) => 5,
        justjson::parser::Token::String(s) => {
            u32::try_from(s.len()).expect("infallible, input is never larger than 4GiB") + 2
        }
        justjson::parser::Token::Number(s) => {
            u32::try_from(s.source().len()).expect("infallible, input is never larger than 4GiB")
        }
        justjson::parser::Token::Object => 1,
        justjson::parser::Token::ObjectEnd => 1,
        justjson::parser::Token::Array => 1,
        justjson::parser::Token::ArrayEnd => 1,
        justjson::parser::Token::Colon => 1,
        justjson::parser::Token::Comma => 1,
    };

    TextSize::from(length)
}

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
#[error("error at {location:?}: {kind}")]
pub struct Error {
    pub kind: ErrorKind,
    pub location: TextRange,
}

impl From<justjson::Error> for Error {
    fn from(error: justjson::Error) -> Self {
        Self {
            kind: error.kind().clone(),
            location: TextRange::empty(offset_to_text_size(error.offset())),
        }
    }
}

pub struct Token<'a> {
    pub kind: justjson::parser::Token<'a>,
    pub location: TextRange,
}

pub struct Lexer<'a> {
    inner: justjson::parser::Tokenizer<'a, true>,
}

impl<'a> Lexer<'a> {
    fn sequence<E>(
        &mut self,
        end: PeekableTokenKind,
        mut every: impl FnMut(&mut Self, Token<'a>) -> Result<(), E>,
    ) -> Result<(), Error>
    where
        Error: From<E>,
    {
        loop {
            let Some(token) = self.inner.next() else {
                return Err(Error {
                    kind: ErrorKind::UnexpectedEof,
                    location: TextRange::empty(offset_to_text_size(self.inner.offset())),
                });
            };

            let token = token?;
            if token_to_kind(&token) == end {
                return Ok(());
            }

            let length = token_length(&token);
            every(
                self,
                Token {
                    kind: token,
                    location: TextRange::new(offset_to_text_size(self.inner.offset()), length),
                },
            )?;

            every(
                self,
                Token {
                    kind: token,
                    location: TextRange::empty(offset_to_text_size(self.inner.offset())),
                },
            )?;
        }
        // TODO: multiple errors?!
    }
}
