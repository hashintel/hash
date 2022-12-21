use alloc::borrow::ToOwned;
use core::{
    ops::{Deref, Range},
    slice::SliceIndex,
};

use bitvec::{
    boxed::BitBox,
    order::Lsb0,
    slice::{BitSlice, BitSliceIndex},
    vec::BitVec,
};
use deer::{
    Context,
    error::DeserializerError, Visitor,
};
use error_stack::{Result, ResultExt};
use crate::array::ArrayAccess;
use crate::object::ObjectAccess;

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
enum Trivia<'a> {
    Owned(BitBox),
    Slice(&'a BitSlice),
}

impl<'a> Deref for Trivia<'a> {
    type Target = BitSlice;

    fn deref(&self) -> &Self::Target {
        match self {
            Trivia::Owned(value) => value.as_bitslice(),
            Trivia::Slice(value) => *value,
        }
    }
}

impl<'a> Trivia<'a> {
    fn to_mut(&mut self) -> &mut BitSlice {
        match self {
            Trivia::Owned(value) => value.as_mut_bitslice(),
            Trivia::Slice(value) => {
                let owned = BitBox::from_bitslice(*value);
                *self = Self::Owned(owned);

                self.to_mut()
            }
        }
    }
}

#[derive(Debug)]
struct Tape<'a, 'de> {
    tokens: &'de [Token],
    trivia: Trivia<'a>,
}

impl Tape<'_, '_> {
    fn empty() -> Self {
        Self {
            tokens: &[],
            trivia: Trivia::Slice(BitSlice::empty()),
        }
    }
}

impl<'a, 'de> Tape<'a, 'de> {
    // also includes trivia
    fn peek_all_n(&self, n: usize) -> Option<Token> {
        self.tokens.get(n).copied()
    }

    fn is_trivia_n(&self, n: usize) -> Option<bool> {
        self.trivia.get(n).as_deref().copied()
    }

    fn set_trivia(&mut self, mut range: Range<usize>) {
        // automatically adjust so that we're able to always index to the end, even if the the end
        // is out of bounds
        if range.end >= self.tokens.len() && range.start < self.tokens.len() {
            range.end = self.tokens.len();
        }

        if let Some(slice) = self.trivia.to_mut().get_mut(range) {
            slice.fill(true);
        }
    }

    fn peek_n(&self, n: usize) -> Option<Token> {
        let mut offset = 0;
        let mut m = 0;

        while m != n {
            if !self.is_trivia_n(offset)? {
                m += 1;
            }

            offset += 1;
        }

        self.peek_all_n(m)
    }

    fn peek(&self) -> Option<Token> {
        let mut n = 0;

        while self.is_trivia_n(n)? {
            n += 1;
        }

        self.peek_all_n(n)
    }

    fn bump(&mut self) -> Option<(Token, bool)> {
        // naive version of bump, which just takes the token and returns it with the status
        let (token, tokens) = self.tokens.split_first()?;
        let is_trivia = *self.trivia.get(0)?;
        // use trivia like a feed tape, this avoid reallocation
        self.trivia.to_mut().shift_left(1);
        self.tokens = tokens;

        Some((*token, is_trivia))
    }

    fn bump_n(&mut self, i: usize) {
        for _ in 0..i {
            self.bump();
        }
    }

    fn next(&mut self) -> Option<Token> {
        loop {
            let (token, is_trivia) = self.bump()?;

            if !is_trivia {
                return Some(token);
            }
        }
    }

    fn remaining(&self) -> usize {
        self.tokens.len()
    }

    fn is_empty(&self) -> bool {
        self.tokens.is_empty()
    }

    fn view<'b, B>(&'b self, n: B) -> Option<Tape<'b, 'de>>
    where
        B: BitSliceIndex<'b, usize, Lsb0, Immut = &'b BitSlice<usize, Lsb0>>
            + SliceIndex<[Token], Output = [Token]>
            + Clone,
    {
        let tokens = self.tokens.get(n.clone())?;
        let trivia = self.trivia.get(n)?;

        Some(Tape {
            tokens,
            trivia: Trivia::Slice(trivia),
        })
    }
}

impl<'de> From<&'de [Token]> for Tape<'_, 'de> {
    fn from(value: &'de [Token]) -> Self {
        Self {
            tokens: value,
            trivia: Trivia::Owned(BitVec::repeat(false, value.len()).into_boxed_bitslice()),
        }
    }
}

#[derive(Debug)]
pub struct Deserializer<'a, 'de> {
    context: &'a Context,
    tokens: Tape<'a, 'de>,
}

impl<'a, 'de> Deserializer<'a, 'de> {
    fn erase(&mut self, range: Range<usize>) {
        self.tokens.set_trivia(range);
    }
}

impl<'a, 'de> deer::Deserializer<'de> for &mut Deserializer<'a, 'de> {
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

    fn deserialize_any<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
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
            Token::Array { length } => visitor.visit_array(ArrayAccess::new(self, length)),
            Token::Object { length } => visitor.visit_object(ObjectAccess::new(self, length)),
            _ => {
                panic!("Deserializer did not expect {token}");
            }
        }
        .change_context(DeserializerError)
    }
}

impl<'a, 'de> Deserializer<'a, 'de> {
    pub fn new(tokens: &'de [Token], context: &'a Context) -> Self {
        Self {
            tokens: tokens.into(),
            context,
        }
    }

    fn peek(&self) -> Token {
        self.tokens
            .peek()
            .expect("should have token to deserialize")
    }

    fn peek_n(&self, n: usize) -> Option<Token> {
        self.tokens.peek_n(n)
    }

    fn next(&mut self) -> Token {
        self.tokens
            .next()
            .expect("should have token to deserialize")
    }

    pub fn remaining(&self) -> usize {
        self.tokens.remaining()
    }

    pub fn is_empty(&self) -> bool {
        self.tokens.is_empty()
    }
}

#[derive(Debug)]
struct DeserializerNone<'a> {
    context: &'a Context,
}

impl<'de> deer::Deserializer<'de> for DeserializerNone<'_> {
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

    fn deserialize_any<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        visitor.visit_none().change_context(DeserializerError)
    }
}
