// The bridge has the goal of bridging the two worlds, and coordinates the different sources and
// implementations.

use std::{alloc::Allocator, rc::Rc};

use hashql_core::{
    heap::FromIn,
    r#type::{
        Type,
        environment::Environment,
        kind::{Apply, Generic, OpaqueType, PrimitiveType, TypeKind},
    },
};
use hashql_mir::interpret::value::{self, Value};

// TODO: type driven serialization for integer constants over boolean?
struct Codec<'env, 'heap, A> {
    env: &'env Environment<'heap>,
    alloc: A,
}

impl<'heap, A: Allocator> Codec<'_, 'heap, A> {
    fn try_serialize(&self, value: Value<'heap, A>) -> Option<serde_json::Value>
    where
        A: Clone,
    {
        todo!()
    }

    fn try_deserialize(
        &self,
        r#type: Type<'heap>,
        value: &serde_json::Value,
    ) -> Option<Value<'heap, A>>
    where
        A: Clone,
    {
        match r#type.kind {
            &TypeKind::Opaque(OpaqueType { name, repr }) => {
                let inner = self.env.r#type(repr);
                let value = self.try_deserialize(inner, value)?;

                Some(Value::Opaque(value::Opaque::new(
                    name,
                    Rc::new_in(value, self.alloc.clone()),
                )))
            }
            TypeKind::Primitive(primitive_type) => match (primitive_type, value) {
                (PrimitiveType::Number, serde_json::Value::Number(number)) => {
                    number.as_f64().map(From::from).map(Value::Number)
                }
                (PrimitiveType::Integer, serde_json::Value::Number(number))
                    if let Some(value) = number.as_i128() =>
                {
                    Some(Value::Integer(value::Int::from(value)))
                }
                (PrimitiveType::String, serde_json::Value::String(string)) => {
                    let value = value::Str::from(Rc::from_in(string.as_str(), self.alloc.clone()));
                    Some(Value::String(value))
                }
                (PrimitiveType::Null, serde_json::Value::Null) => Some(Value::Unit),
                (PrimitiveType::Boolean, serde_json::Value::Bool(value)) => {
                    Some(Value::Integer(value::Int::from(*value)))
                }
                (
                    PrimitiveType::Number,
                    serde_json::Value::Null
                    | serde_json::Value::Bool(_)
                    | serde_json::Value::String(_)
                    | serde_json::Value::Array(_)
                    | serde_json::Value::Object(_),
                )
                | (
                    PrimitiveType::Integer,
                    serde_json::Value::Null
                    | serde_json::Value::Bool(_)
                    | serde_json::Value::Number(_)
                    | serde_json::Value::String(_)
                    | serde_json::Value::Array(_)
                    | serde_json::Value::Object(_),
                )
                | (
                    PrimitiveType::String,
                    serde_json::Value::Null
                    | serde_json::Value::Bool(_)
                    | serde_json::Value::Number(_)
                    | serde_json::Value::Array(_)
                    | serde_json::Value::Object(_),
                )
                | (
                    PrimitiveType::Null,
                    serde_json::Value::Bool(_)
                    | serde_json::Value::Number(_)
                    | serde_json::Value::String(_)
                    | serde_json::Value::Array(_)
                    | serde_json::Value::Object(_),
                )
                | (
                    PrimitiveType::Boolean,
                    serde_json::Value::Null
                    | serde_json::Value::Number(_)
                    | serde_json::Value::String(_)
                    | serde_json::Value::Array(_)
                    | serde_json::Value::Object(_),
                ) => None,
            },
            TypeKind::Struct(struct_type) => todo!(),
            TypeKind::Tuple(tuple_type) => todo!(),

            TypeKind::Union(union_type) => todo!(),

            TypeKind::Intrinsic(intrinsic_type) => todo!(),

            // How... does one even do that?
            TypeKind::Intersection(intersection_type) => todo!(),

            &TypeKind::Apply(Apply {
                base,
                substitutions: _,
            }) => self.try_deserialize(self.env.r#type(base), value),
            &TypeKind::Generic(Generic { base, arguments: _ }) => {
                self.try_deserialize(self.env.r#type(base), value)
            }

            TypeKind::Closure(_) => todo!("issue ICE; should be rejected by MIR"),
            TypeKind::Never => todo!("issue ICE; tried to deserialize a never type"),

            // we're flying free here, issue a warning, and just try to deserialize using the old
            // tactics
            TypeKind::Param(param) => todo!(),
            TypeKind::Infer(infer) => todo!(),
            TypeKind::Unknown => todo!(),
        }
    }
}

struct Bridge {}

// the goal of the bridge is it to coordinate the different sources and implementations, to allow
// for this, we use a "multi-pronged" approach, we are given the compiled queries, and all the
// bodies, and operate on them.
