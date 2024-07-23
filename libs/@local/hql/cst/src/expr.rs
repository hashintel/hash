use justjson::{parser::ParseDelegate, Value};

use crate::{
    arena::{self, Arena},
    call::Call,
    constant::Constant,
    signature::Signature,
    symbol::Symbol,
    r#type::Type,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Expr<'a> {
    Call(Call<'a>),
    Signature(Signature<'a>),
    Symbol(Symbol),
    Constant(Constant<'a>),
}

#[derive(Debug, Default)]
struct Object<'a> {
    r#fn: Option<Expr<'a>>,
    r#const: Option<Value<'a>>,
    r#type: Option<Type<'a>>,
    var: Option<Symbol>,
    sig: Option<Signature<'a>>,
}

struct ExprParser<'a> {
    arena: &'a Arena,
}

impl<'a, 'b> ParseDelegate<'b> for ExprParser<'a> {
    type Array = Option<(Expr<'a>, arena::Vec<'a, Expr<'a>>)>;
    // TODO: proper error
    type Error = &'static str;
    type Key = &'b str;
    type Object = Object<'a>;
    type Value = Expr<'a>;

    fn null(&mut self) -> Result<Self::Value, Self::Error> {
        todo!()
    }

    fn boolean(&mut self, value: bool) -> Result<Self::Value, Self::Error> {
        todo!()
    }

    fn number(&mut self, value: justjson::JsonNumber<'b>) -> Result<Self::Value, Self::Error> {
        todo!()
    }

    fn string(&mut self, value: justjson::JsonString<'b>) -> Result<Self::Value, Self::Error> {
        todo!()
    }

    fn begin_object(&mut self) -> Result<Self::Object, Self::Error> {
        Ok(Object::default())
    }

    fn object_key(
        &mut self,
        object: &mut Self::Object,
        key: justjson::JsonString<'b>,
    ) -> Result<Self::Key, Self::Error> {
        todo!()
    }

    fn object_value(
        &mut self,
        object: &mut Self::Object,
        key: Self::Key,
        value: Self::Value,
    ) -> Result<(), Self::Error> {
        todo!()
    }

    fn object_is_empty(&self, object: &Self::Object) -> bool {
        todo!()
    }

    fn end_object(&mut self, object: Self::Object) -> Result<Self::Value, Self::Error> {
        todo!()
    }

    fn begin_array(&mut self) -> Result<Self::Array, Self::Error> {
        Ok(None)
    }

    fn array_value(
        &mut self,
        array: &mut Self::Array,
        value: Self::Value,
    ) -> Result<(), Self::Error> {
        match array {
            Some((_, rest)) => {
                rest.push(value);
            }
            None => {
                *array = Some((value, self.arena.vec(None)));
            }
        }

        Ok(())
    }

    fn array_is_empty(&self, array: &Self::Array) -> bool {
        array.is_none()
    }

    fn end_array(&mut self, array: Self::Array) -> Result<Self::Value, Self::Error> {
        let (r#fn, args) = array.unwrap();

        Ok(Expr::Call(Call {
            r#fn: self.arena.boxed(r#fn),
            args: args.into_boxed_slice(),
        }))
    }

    fn kind_of(&self, value: &Self::Value) -> justjson::parser::JsonKind {
        todo!()
    }
}
