use alloc::borrow::ToOwned;

use deer::{
    error::{DeserializerError, TypeError, Variant},
    value::NoneDeserializer,
    Context, EnumVisitor, OptionalVisitor, Visitor,
};
use error_stack::{Report, Result, ResultExt};

use crate::{array::ArrayAccess, object::ObjectAccess, tape::Tape, token::Token};

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
    tape: Tape<'de>,
}

impl<'a, 'de> deer::Deserializer<'de> for &mut Deserializer<'a, 'de> {
    forward!(
        deserialize_null,
        deserialize_bool,
        deserialize_number,
        deserialize_u128,
        deserialize_i128,
        deserialize_usize,
        deserialize_isize,
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
            Token::Number(value) => visitor.visit_number(value),
            Token::I128(value) => visitor.visit_i128(value),
            Token::U128(value) => visitor.visit_u128(value),
            Token::ISize(value) => visitor.visit_isize(value),
            Token::USize(value) => visitor.visit_usize(value),
            Token::Char(value) => visitor.visit_char(value),
            Token::Str(value) => visitor.visit_str(value),
            Token::BorrowedStr(value) => visitor.visit_borrowed_str(value),
            Token::String(value) => visitor.visit_string(value.to_owned()),
            Token::Bytes(value) => visitor.visit_bytes(value),
            Token::BorrowedBytes(value) => visitor.visit_borrowed_bytes(value),
            Token::BytesBuf(value) => visitor.visit_bytes_buffer(value.to_vec()),
            Token::Array { length } => visitor.visit_array(ArrayAccess::new(self, length)),
            Token::Object { length } => visitor.visit_object(ObjectAccess::new(self, length)),
            Token::Null => visitor.visit_null(),
            _ => {
                panic!("Deserializer did not expect {token}");
            }
        }
        .change_context(DeserializerError)
    }

    fn deserialize_optional<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: OptionalVisitor<'de>,
    {
        let token = self.peek();

        match token {
            Token::Null => {
                // only eat the token if we're going to visit null
                self.next();
                visitor.visit_null()
            }
            _ => visitor.visit_some(self),
        }
        .change_context(DeserializerError)
    }

    fn deserialize_enum<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: EnumVisitor<'de>,
    {
        let token = self.peek();

        let is_map = match token {
            Token::Object { .. } => {
                // eat the token so that we're at the key
                self.next();
                true
            }
            _ => false,
        };

        let discriminant = visitor
            .visit_discriminant(&mut *self)
            .change_context(DeserializerError)?;

        let value = if is_map {
            visitor.visit_value(discriminant, &mut *self)
        } else {
            visitor.visit_value(discriminant, NoneDeserializer::new(self.context))
        }
        .change_context(DeserializerError)?;

        if is_map {
            // make sure that we're close and that we have nothing dangling
            if self.peek() == Token::ObjectEnd {
                self.next();
            } else {
                // we received a unit type, therefore error should be a type error
                // we cannot determine the type we received, just that it is a map
                // TODO: once HashMap has a reflection use it here as ReceivedType (or
                //  UnknownObjectSchema?)
                return Err(Report::new(TypeError.into_error()).change_context(DeserializerError));
            }
        }

        Ok(value)
    }
}

impl<'a, 'de> Deserializer<'a, 'de> {
    pub(crate) const fn new_bare(tape: Tape<'de>, context: &'a Context) -> Self {
        Self { context, tape }
    }

    pub fn new(tokens: &'de [Token], context: &'a Context) -> Self {
        Self::new_bare(tokens.into(), context)
    }

    pub(crate) fn peek(&self) -> Token {
        self.tape.peek().expect("should have token to deserialize")
    }

    pub(crate) fn peek_n(&self, n: usize) -> Option<Token> {
        self.tape.peek_n(n)
    }

    pub(crate) fn next(&mut self) -> Token {
        self.tape.next().expect("should have token to deserialize")
    }

    pub(crate) const fn tape(&self) -> &Tape<'de> {
        &self.tape
    }

    pub(crate) fn tape_mut(&mut self) -> &mut Tape<'de> {
        &mut self.tape
    }

    pub const fn remaining(&self) -> usize {
        self.tape.remaining()
    }

    pub const fn is_empty(&self) -> bool {
        self.tape.is_empty()
    }
}

// TODO: replace w/ NoneDeserializer
#[derive(Debug, Copy, Clone)]
pub(crate) struct DeserializerNone<'a> {
    pub(crate) context: &'a Context,
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

    fn deserialize_optional<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: OptionalVisitor<'de>,
    {
        visitor.visit_none().change_context(DeserializerError)
    }

    fn deserialize_enum<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: EnumVisitor<'de>,
    {
        let discriminant = visitor
            .visit_discriminant(self)
            .change_context(DeserializerError)?;

        visitor
            .visit_value(discriminant, self)
            .change_context(DeserializerError)
    }
}
