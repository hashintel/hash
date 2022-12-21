use alloc::borrow::ToOwned;
use core::{
    ops::{Deref, DerefMut, Range},
    slice::SliceIndex,
};

use bitvec::{
    boxed::BitBox,
    order::Lsb0,
    slice::{BitSlice, BitSliceIndex},
    vec::BitVec,
};
use deer::{
    error::{ArrayAccessError, DeserializerError, ObjectAccessError, SetBoundedError, Variant},
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
enum Trivia<'de> {
    Owned(BitBox),
    Slice(&'de mut BitSlice),
}

impl Deref for Trivia<'_> {
    type Target = BitSlice;

    fn deref(&self) -> &Self::Target {
        match self {
            Trivia::Owned(value) => value.as_bitslice(),
            Trivia::Slice(value) => value.as_ref(),
        }
    }
}

impl DerefMut for Trivia<'_> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        match self {
            Trivia::Owned(value) => value.as_mut_bitslice(),
            Trivia::Slice(value) => *value,
        }
    }
}

impl From<BitBox> for Trivia<'_> {
    fn from(value: BitBox) -> Self {
        Self::Owned(value)
    }
}

impl<'de> From<&'de mut BitSlice> for Trivia<'de> {
    fn from(value: &'de mut BitSlice) -> Self {
        Self::Slice(value)
    }
}

#[derive(Debug)]
struct Tape<'de> {
    tokens: &'de [Token],
    trivia: Trivia<'de>,
}

impl Tape<'static> {
    fn empty() -> Self {
        Self {
            tokens: &[],
            trivia: Trivia::Owned(BitVec::new().into_boxed_bitslice()),
        }
    }
}

impl<'de> Tape<'de> {
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

        if let Some(slice) = self.trivia.get_mut(range) {
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
        self.trivia.shift_left(1);
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

    fn view<'a, B>(&'a mut self, n: B) -> Option<Tape<'a>>
    where
        B: BitSliceIndex<'a, usize, Lsb0, Mut = &'a mut BitSlice<usize, Lsb0>>
            + SliceIndex<[Token], Output = [Token]>
            + Clone,
    {
        let tokens = self.tokens.get(n.clone())?;
        let trivia = self.trivia.get_mut(n)?;

        Some(Tape {
            tokens,
            trivia: trivia.into(),
        })
    }
}

impl<'de> From<&'de [Token]> for Tape<'de> {
    fn from(value: &'de [Token]) -> Self {
        Self {
            tokens: value,
            trivia: BitVec::repeat(false, value.len())
                .into_boxed_bitslice()
                .into(),
        }
    }
}

#[derive(Debug)]
pub struct Deserializer<'a, 'de> {
    context: &'a Context,
    tokens: Tape<'de>,
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

    fn scan_end(&self) -> Option<usize> {
        let mut objects: usize = 0;
        let mut arrays: usize = 0;

        let mut n = 0;

        loop {
            let token = self.deserializer.peek_n(n)?;

            match token {
                Token::Array { .. } => arrays += 1,
                Token::ArrayEnd if arrays == 0 && objects == 0 => {
                    // we're at the outer layer, meaning we can know where we end
                    return Some(n);
                }
                Token::ArrayEnd => arrays = arrays.saturating_sub(1),
                Token::Object { .. } => objects += 1,
                Token::ObjectEnd => objects = objects.saturating_sub(1),
                _ => {}
            }

            n += 1;
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
            let value = T::deserialize(&mut *self.deserializer);
            Some(value.change_context(ArrayAccessError))
        }
    }

    fn size_hint(&self) -> Option<usize> {
        self.length
    }

    fn end(self) -> Result<(), ArrayAccessError> {
        // TODO: error if self.remaining isn't Some(0) or None
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

    // This assumes that Str and such are atomic, meaning `Str Str` as a deserialize value is
    // considered invalid, as that should use `ArrayAccess` instead.
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
                Token::ArrayEnd => arrays = arrays.saturating_sub(1),
                Token::Object { .. } => objects += 1,
                Token::ObjectEnd if objects == 0 && arrays == 0 => {
                    // this is for the outer layer (that's us), therefore we can abort our linear
                    // search
                    return None;
                }
                Token::ObjectEnd => objects = objects.saturating_sub(1),
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

    fn scan_end(&self) -> Option<usize> {
        let mut objects: usize = 0;
        let mut arrays: usize = 0;

        let mut n = 0;

        loop {
            let token = self.deserializer.peek_n(n)?;

            match token {
                Token::Array { .. } => arrays += 1,
                Token::ArrayEnd => arrays = arrays.saturating_sub(1),
                Token::Object { .. } => objects += 1,
                Token::ObjectEnd if arrays == 0 && objects == 0 => {
                    // we're at the outer layer, meaning we can know where we end
                    return Some(n);
                }
                Token::ObjectEnd => objects = objects.saturating_sub(1),
                _ => {}
            }

            n += 1;
        }
    }
}

// TODO: for value we need a scan for some sorts, and then need to replace/remove the elements from
//  the stream
impl<'de> deer::ObjectAccess<'de> for ObjectAccess<'_, '_, 'de> {
    fn set_bounded(&mut self, length: usize) -> Result<(), ObjectAccessError> {
        if self.dirty {
            return Err(
                Report::new(SetBoundedError::Dirty.into_error()).change_context(ObjectAccessError)
            );
        }

        if self.remaining.is_some() {
            return Err(
                Report::new(SetBoundedError::CalledMultipleTimes.into_error())
                    .change_context(ObjectAccessError),
            );
        }

        self.remaining = Some(length);

        Ok(())
    }

    fn value<T>(&mut self, key: &str) -> Result<T, ObjectAccessError>
    where
        T: Deserialize<'de>,
    {
        if self.remaining == Some(0) {
            return T::deserialize(DeserializerNone {
                context: self.deserializer.context,
            })
            .change_context(ObjectAccessError);
        }

        if let Some(remaining) = &mut self.remaining {
            *remaining = remaining.saturating_sub(1);
        }

        // TODO: we need to look bounded stuffs
        match self.scan(key) {
            Some(offset) => {
                // now we need to figure out which values are used, we can do this through offset
                // calculations
                let remaining = self.deserializer.remaining() - offset;

                let tape = self.deserializer.tokens.view(offset + 1..);

                let mut deserializer = Deserializer {
                    tokens: tape.unwrap_or_else(Tape::<'static>::empty),
                    context: self.deserializer.context,
                };

                let value = T::deserialize(&mut deserializer);

                let erase = remaining - deserializer.remaining();
                drop(deserializer);

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
        if self.remaining == Some(0) {
            return None;
        }

        if let Some(remaining) = &mut self.remaining {
            *remaining = remaining.saturating_sub(1);
        }

        let (key, value) = if matches!(self.deserializer.peek(), Token::ObjectEnd) {
            // we're not in bounded mode, which means we need to signal that we're done
            if self.remaining.is_none() {
                return None;
            }

            if self.remaining.is_some() {
                let key = K::deserialize(DeserializerNone {
                    context: self.deserializer.context,
                });
                let value = V::deserialize(DeserializerNone {
                    context: self.deserializer.context,
                });

                (key, value)
            } else {
                return None;
            }
        } else {
            let key = K::deserialize(&mut *self.deserializer);
            let value = V::deserialize(&mut *self.deserializer);

            (key, value)
        };

        let result = match (key, value) {
            (Err(mut key), Err(value)) => {
                key.extend_one(value);

                Err(key.change_context(ObjectAccessError))
            }
            (Err(error), _) | (_, Err(error)) => Err(error.change_context(ObjectAccessError)),
            (Ok(key), Ok(value)) => Ok((key, value)),
        };

        Some(result)
    }

    fn size_hint(&self) -> Option<usize> {
        self.length
    }

    fn end(self) -> Result<(), ObjectAccessError> {
        todo!()
    }
}
