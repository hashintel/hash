use deer::{
    error::{DeserializerError, ExpectedType, MissingError, ReceivedType, Schema, TypeError},
    Visitor,
};
use error_stack::{Report, Result, ResultExt};
use serde_json::{value::RawValue, Value};

// TODO: incremental parsing instead!
// TODO: arbitrary-precision
fn serde_to_deer_number(number: &serde_json::Number) -> Option<deer::Number> {
    if let Some(int) = number.as_i64() {
        Some(deer::Number::from(int))
    } else if let Some(int) = number.as_u64() {
        Some(deer::Number::from(int))
    } else {
        number.as_f64().map(deer::Number::from)
    }
}

fn into_schema(value: &Value) -> Schema {
    match value {
        Value::Null => Schema::new("null"),
        Value::Bool(_) => Schema::new("boolean"),
        Value::Number(_) => Schema::new("number"),
        Value::String(_) => Schema::new("string"),
        Value::Array(_) => Schema::new("array"),
        Value::Object(_) => Schema::new("object"),
    }
}

struct Deserializer {
    value: Option<Value>,
}

impl<'de> deer::Deserializer<'de> for Deserializer {
    fn deserialize_any<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_none<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        match self.value {
            None => visitor.visit_none().change_context(DeserializerError),
            Some(value) => Err(Report::new(TypeError)
                .attach(ExpectedType::new(Schema::new("none")))
                .attach(ReceivedType::new(into_schema(&value)))
                .change_context(DeserializerError)),
        }
    }

    fn deserialize_null<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        match self.value {
            Some(Value::Null) => visitor.visit_null().change_context(DeserializerError),
            Some(value) => Err(Report::new(TypeError)
                .attach(ExpectedType::new(Schema::new("null")))
                .attach(ReceivedType::new(into_schema(&value)))
                .change_context(DeserializerError)),
            None => Err(Report::new(MissingError)
                .attach(ExpectedType::new(Schema::new("null")))
                .change_context(DeserializerError)),
        }
    }

    fn deserialize_bool<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        // TODO: use Deserializer instead? ~> we'd need a compatability layer

        match self.value {
            Some(Value::Bool(bool)) => visitor.visit_bool(bool).change_context(DeserializerError),
            Some(value) => Err(Report::new(TypeError)
                .attach(ExpectedType::new(Schema::new("boolean")))
                .attach(ReceivedType::new(into_schema(&value)))
                .change_context(DeserializerError)),
            None => Err(Report::new(MissingError)
                .attach(ExpectedType::new(Schema::new("boolean")))
                .change_context(DeserializerError)),
        }
    }

    fn deserialize_number<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        if let Some(Value::Number(number)) = self.value {
            if let Some(number) = serde_to_deer_number(number) {
                visitor
                    .visit_number(number)
                    .change_context(DeserializerError)
            } else {
                todo!()
            }
        } else {
            todo!()
        }
    }

    fn deserialize_char<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        if let Some(Value::String(string)) = self.value {
            let mut chars = string.chars();

            let (a, b) = (chars.next(), chars.next());

            match (a, b) {
                (Some(a), None) => visitor.visit_char(a).change_context(DeserializerError),
                (Some(_), Some(_)) => todo!(),
                (None, None) => todo!(),
                (None, Some(_)) => unreachable!(),
            }
        } else {
            todo!()
        }
    }

    fn deserialize_string<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        // TODO: borrowed string vs str?! ~> default implementation?!?!
        if let Some(Value::String(string)) = self.value {
            visitor
                .visit_string(string.clone())
                .change_context(DeserializerError)
        } else {
            todo!()
        }
    }

    fn deserialize_str<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        if let Some(Value::String(string)) = self.value {
            visitor.visit_str(string).change_context(DeserializerError)
        } else {
            todo!()
        }
    }

    fn deserialize_bytes<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_bytes_buffer<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_array<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }

    fn deserialize_object<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        todo!()
    }
}
