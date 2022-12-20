use alloc::borrow::ToOwned;
use core::ops::Range;

use deer::{
    error::{ArrayAccessError, DeserializerError, ObjectAccessError},
    Context, Deserialize, Visitor,
};
use error_stack::{Report, Result, ResultExt};

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

impl<'a, 'de> Deserializer<'a, 'de> {
    pub(crate) fn erase(&mut self, range: Range<usize>) {
        for index in range {
            if let Some(token) = self.tokens.get_mut(index) {
                *token = Token::Trivia
            }
        }
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
        Self { tokens, context }
    }

    fn peek_n(&self, n: usize) -> Option<Token> {
        self.tokens.get(n).copied()
    }

    fn peek_maybe(&self) -> Option<Token> {
        let mut n = 0;
        let mut token = self.peek_n(n);

        while matches!(token, Some(Token::Trivia)) {
            // skip all trivia
            n += 1;
            token = self.peek_n(n);
        }

        token
    }

    fn peek(&self) -> Token {
        self.peek_maybe().expect("should have token to deserialize")
    }

    fn next_maybe(&mut self) -> Option<Token> {
        let (next, tokens) = self.tokens.split_first()?;
        self.tokens = tokens;

        // avoid and skip all trivia
        if matches!(next, Token::Trivia) {
            return self.next_maybe();
        }

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

struct ArrayAccess<'a, 'b, 'de: 'a> {
    deserializer: &'a mut Deserializer<'b, 'de>,

    dirty: bool,
    length: Option<usize>,
    remaining: Option<usize>,
}

impl<'a, 'b, 'de> ArrayAccess<'a, 'b, 'de> {
    pub fn new(deserializer: &'a mut Deserializer<'b, 'de>, length: Option<usize>) -> Self {
        Self {
            deserializer,
            dirty: false,
            length,
            remaining: None,
        }
    }
}

impl<'de> deer::ArrayAccess<'de> for ArrayAccess<'_, '_, 'de> {
    fn set_bounded(&mut self, length: usize) -> Result<(), ArrayAccessError> {
        if self.dirty {
            return Err(
                Report::new(SetBoundedError::Dirty.into_error()).change_context(ArrayAccessError)
            );
        }

        if self.remaining.is_some() {
            return Err(
                Report::new(SetBoundedError::CalledMultipleTimes.into_error())
                    .change_context(ArrayAccessError),
            );
        }

        self.remaining = Some(length);

        Ok(())
    }

    fn next<T>(&mut self) -> Option<Result<T, ArrayAccessError>>
    where
        T: Deserialize<'de>,
    {
        self.dirty = true;

        if matches!(self.deserializer.peek(), Token::ArrayEnd) {
            // we have reached the ending, if `self.remaining` is set we use the `DeserializerNone`
            // to deserialize any values that require `None`
            if let Some(remaining) = &mut self.remaining {
                if *remaining == 0 {
                    return None;
                }

                *remaining = remaining.saturating_sub(1);

                let value = T::deserialize(DeserializerNone {
                    context: self.deserializer.context,
                });

                Some(value.change_context(ArrayAccessError))
            } else {
                None
            }
        } else {
            let value = T::deserialize(self.deserializer);
            Some(value.change_context(ArrayAccessError))
        }
    }

    fn size_hint(&self) -> Option<usize> {
        self.length
    }

    fn end(self) -> Result<(), ArrayAccessError> {
        let mut result = Ok(());

        // ensure that we consume the last token, if it is the wrong token error out
        if !matches!(self.deserializer.peek(), Token::ArrayEnd) {
            // TODO: error
            result = Err(Report::new(ArrayAccessError));
        }

        self.deserializer.next();

        if self.remaining.map_or(false, |remaining| remaining > 0) {
            let error = Report::new(ArrayAccessError);
            // TODO: error
            match &mut result {
                Err(result) => result.extend_one(error),
                result => *result = Err(error),
            }
        }

        result
    }
}

struct ObjectAccess<'a, 'b, 'de: 'a> {
    deserializer: &'a mut Deserializer<'b, 'de>,

    dirty: bool,
    length: Option<usize>,
    remaining: Option<usize>,
}

impl<'a, 'b, 'de: 'a> ObjectAccess<'a, 'b, 'de> {
    pub fn new(deserializer: &'a mut Deserializer<'b, 'de>, length: Option<usize>) -> Self {
        Self {
            deserializer,
            dirty: false,
            length,
            remaining: None,
        }
    }

    fn scan(&self, key: &str) -> Option<usize> {
        let mut objects: usize = 0;
        let mut arrays: usize = 0;
        let mut n = 0;

        #[derive(Copy, Clone, Eq, PartialEq)]
        enum State {
            Key,
            Value,
        }

        impl State {
            fn flip(&mut self) {
                match *self {
                    State::Key => *self = State::Value,
                    State::Value => *self = State::Key,
                }
            }
        }

        let mut state = State::Key;

        loop {
            let next = self.deserializer.peek_n(n)?;

            match next {
                Token::Array { .. } => arrays += 1,
                Token::ArrayEnd => arrays -= 1,
                Token::Object { .. } => objects += 1,
                Token::ObjectEnd if objects == 0 => {
                    // this is for the outer layer (that's us), therefore we can abort our linear
                    // search
                    return None;
                }
                Token::ObjectEnd => objects -= 1,
                Token::Str(value) | Token::BorrowedStr(value) | Token::String(value)
                    if objects == 0 && arrays == 0 && value == key && state == State::Key =>
                {
                    // we found an element that matches the element value that is next in line
                    return Some(n);
                }
                _ => {}
            }

            if arrays == 0 && objects == 0 {
                // we're dependent on the fact if something is a key or value, if we're not nested
                // then we can switch the state.
                state.flip();
            }

            n += 1;
        }
    }
}

// TODO: for value we need a scan for some sorts, and then need to replace/remove the elements from
//  the stream
impl<'de> deer::ObjectAccess<'de> for ObjectAccess<'_, '_, 'de> {
    fn set_bounded(&mut self, length: usize) -> Result<(), ArrayAccessError> {
        if self.dirty {
            return Err(
                Report::new(SetBoundedError::Dirty.into_error()).change_context(ArrayAccessError)
            );
        }

        if self.remaining.is_some() {
            return Err(
                Report::new(SetBoundedError::CalledMultipleTimes.into_error())
                    .change_context(ArrayAccessError),
            );
        }

        self.remaining = Some(length);

        Ok(())
    }

    fn value<T>(&mut self, key: &str) -> Result<T, ObjectAccessError>
    where
        T: Deserialize<'de>,
    {
        // TODO: we need to look bounded stuffs
        match self.scan(key) {
            Some(offset) => {
                // now we need to figure out which values are used, we can do this through offset
                // calculations
                let remaining = self.deserializer.remaining() - offset;

                let mut deserializer = Deserializer {
                    tokens: &self.deserializer.tokens[offset + 1..],
                    context: self.deserializer.context,
                };

                let value = T::deserialize(&mut deserializer);

                let erase = remaining - deserializer.remaining();

                self.deserializer.erase(offset..offset + erase);

                value
            }
            None => T::deserialize(DeserializerNone {
                context: self.deserializer.context,
            }),
        }
        .change_context(ObjectAccessError)
    }

    fn next<K, V>(&mut self) -> Option<Result<(K, V), ObjectAccessError>>
    where
        K: Deserialize<'de>,
        V: Deserialize<'de>,
    {
        todo!()
    }

    fn size_hint(&self) -> Option<usize> {
        todo!()
    }

    fn end(self) -> Result<(), ObjectAccessError> {
        todo!()
    }
}
