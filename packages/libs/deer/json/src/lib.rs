use deer::{error::DeserializerError, Visitor};
use error_stack::{Result, ResultExt};
use serde_json::Value;

// TODO: arbitrary-precision
fn serde_to_deer_number(number: serde_json::Number) -> Option<deer::Number> {
    if let Some(int) = number.as_i64() {
        Some(deer::Number::from(int))
    } else if let Some(int) = number.as_u64() {
        Some(deer::Number::from(int))
    } else {
        number.as_f64().map(deer::Number::from)
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
        if self.value.is_none() {
            visitor.visit_none().change_context(DeserializerError)
        } else {
            todo!()
        }
    }

    fn deserialize_null<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        if let Some(Value::Null) = self.value {
            visitor.visit_null().change_context(DeserializerError)
        } else {
            todo!()
        }
    }

    fn deserialize_bool<V>(self, visitor: V) -> Result<V::Value, DeserializerError>
    where
        V: Visitor<'de>,
    {
        if let Some(Value::Bool(bool)) = self.value {
            visitor.visit_bool(bool).change_context(DeserializerError)
        } else {
            todo!()
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
                .visit_string(string)
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
            visitor.visit_str(&string).change_context(DeserializerError)
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
