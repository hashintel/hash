use alloc::borrow::ToOwned;

use deer::{error::DeserializerError, Context, Visitor};
use error_stack::Result;

use crate::token::Token;

macro_rules! forward {
    ($($method:ident),*) => {
        $(
        fn $method<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
        where
            V: Visitor<'de>,
        {
            self.deserialize_any(visitor)
        }
        )*
    };
}

#[derive(Debug)]
pub struct Deserializer<'a, 'de> {
    context: &'a Context,
    tokens: &'de [Token],
}

impl<'a, 'de> deer::Deserializer<'de> for Deserializer<'a, 'de> {
    forward!(
        deserialize_null,
        deserialize_bool,
        deserialize_number,
        deserialize_char,
        deserialize_string,
        deserialize_str,
        deserialize_bytes,
        deserialize_bytes_buffer,
        deserialize_array,
        deserialize_object
    );

    fn context(&self) -> &Context {
        self.context
    }

    fn deserialize_any<V>(mut self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        let token = self.next();

        match token {
            Token::Bool(value) => visitor.visit_bool(value),
            Token::Number(value) => visitor.visit_number(value.clone()),
            Token::Char(value) => visitor.visit_char(value),
            Token::Str(value) => visitor.visit_str(value),
            Token::BorrowedStr(value) => visitor.visit_borrowed_str(value),
            Token::String(value) => visitor.visit_string(value.to_owned()),
            Token::Bytes(value) => visitor.visit_bytes(value),
            Token::BorrowedBytes(value) => visitor.visit_borrowed_bytes(value),
            Token::BytesBuf(value) => visitor.visit_bytes_buffer(value.to_vec()),
            Token::Array { .. } => {}
            Token::Object { .. } => {}
            _ => {
                panic!("Deserializer did not expect {token}");
            }
        }
        .change_context(DeserializerError)
    }
}

impl<'a, 'de> Deserializer<'a, 'de> {
    pub fn new(tokens: &'de [Token], context: &'a Context) -> Self {
        Self { tokens, context }
    }

    fn peek_maybe(&self) -> Option<Token> {
        self.tokens.first().copied()
    }

    fn peek(&self) -> Token {
        self.peek_maybe().expect("should have token to deserialize")
    }

    fn next_maybe(&mut self) -> Option<Token> {
        let (next, tokens) = self.tokens.split_first()?;
        self.tokens = tokens;

        Some(*next)
    }

    fn next(&mut self) -> Token {
        self.next_maybe().expect("should have token to deserialize")
    }

    pub fn remaining(&self) -> usize {
        self.tokens.len()
    }

    pub fn is_empty(&self) -> bool {
        self.tokens.is_empty()
    }
}
