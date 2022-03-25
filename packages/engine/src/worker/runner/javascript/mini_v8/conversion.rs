use std::{
    collections::{BTreeMap, BTreeSet, HashMap, HashSet},
    hash::{BuildHasher, Hash},
    string::String as StdString,
    time::Duration,
};

use super::{
    Array, Error, FromValue, FromValues, Function, MiniV8, Object, Result, String, ToValue,
    ToValues, Value, Values, Variadic,
};

impl<'mv8> ToValue<'mv8> for Value<'mv8> {
    fn to_value(self, _mv8: &'mv8 MiniV8) -> Result<'mv8, Value<'mv8>> {
        Ok(self)
    }
}

impl<'mv8> FromValue<'mv8> for Value<'mv8> {
    fn from_value(value: Value<'mv8>, _mv8: &'mv8 MiniV8) -> Result<'mv8, Self> {
        Ok(value)
    }
}

impl<'mv8> ToValue<'mv8> for () {
    fn to_value(self, _mv8: &'mv8 MiniV8) -> Result<'mv8, Value<'mv8>> {
        Ok(Value::Undefined)
    }
}

impl<'mv8> FromValue<'mv8> for () {
    fn from_value(_value: Value<'mv8>, _mv8: &'mv8 MiniV8) -> Result<'mv8, Self> {
        Ok(())
    }
}

impl<'mv8, T: ToValue<'mv8>> ToValue<'mv8> for Option<T> {
    fn to_value(self, mv8: &'mv8 MiniV8) -> Result<'mv8, Value<'mv8>> {
        match self {
            Some(val) => val.to_value(mv8),
            None => Ok(Value::Null),
        }
    }
}

impl<'mv8, T: FromValue<'mv8>> FromValue<'mv8> for Option<T> {
    fn from_value(value: Value<'mv8>, mv8: &'mv8 MiniV8) -> Result<'mv8, Self> {
        match value {
            Value::Null | Value::Undefined => Ok(None),
            value => Ok(Some(T::from_value(value, mv8)?)),
        }
    }
}

impl<'mv8> ToValue<'mv8> for String<'mv8> {
    fn to_value(self, _mv8: &'mv8 MiniV8) -> Result<'mv8, Value<'mv8>> {
        Ok(Value::String(self))
    }
}

impl<'mv8> FromValue<'mv8> for String<'mv8> {
    fn from_value(value: Value<'mv8>, mv8: &'mv8 MiniV8) -> Result<'mv8, String<'mv8>> {
        mv8.coerce_string(value)
    }
}

impl<'mv8> ToValue<'mv8> for Array<'mv8> {
    fn to_value(self, _mv8: &'mv8 MiniV8) -> Result<'mv8, Value<'mv8>> {
        Ok(Value::Array(self))
    }
}

impl<'mv8> FromValue<'mv8> for Array<'mv8> {
    fn from_value(value: Value<'mv8>, _mv8: &'mv8 MiniV8) -> Result<'mv8, Array<'mv8>> {
        match value {
            Value::Array(a) => Ok(a),
            value => Err(Error::from_js_conversion(value.type_name(), "Array")),
        }
    }
}

impl<'mv8> ToValue<'mv8> for Function<'mv8> {
    fn to_value(self, _mv8: &'mv8 MiniV8) -> Result<'mv8, Value<'mv8>> {
        Ok(Value::Function(self))
    }
}

impl<'mv8> FromValue<'mv8> for Function<'mv8> {
    fn from_value(value: Value<'mv8>, _mv8: &'mv8 MiniV8) -> Result<'mv8, Function<'mv8>> {
        match value {
            Value::Function(f) => Ok(f),
            value => Err(Error::from_js_conversion(value.type_name(), "Function")),
        }
    }
}

impl<'mv8> ToValue<'mv8> for Object<'mv8> {
    fn to_value(self, _mv8: &'mv8 MiniV8) -> Result<'mv8, Value<'mv8>> {
        Ok(Value::Object(self))
    }
}

impl<'mv8> FromValue<'mv8> for Object<'mv8> {
    fn from_value(value: Value<'mv8>, _mv8: &'mv8 MiniV8) -> Result<'mv8, Object<'mv8>> {
        match value {
            Value::Object(o) => Ok(o),
            value => Err(Error::from_js_conversion(value.type_name(), "Object")),
        }
    }
}

impl<'mv8, K, V, S> ToValue<'mv8> for HashMap<K, V, S>
where
    K: Eq + Hash + ToValue<'mv8>,
    V: ToValue<'mv8>,
    S: BuildHasher,
{
    fn to_value(self, mv8: &'mv8 MiniV8) -> Result<'mv8, Value<'mv8>> {
        let object = mv8.create_object();
        for (k, v) in self.into_iter() {
            object.set(k, v)?;
        }
        Ok(Value::Object(object))
    }
}

impl<'mv8, K, V, S> FromValue<'mv8> for HashMap<K, V, S>
where
    K: Eq + Hash + FromValue<'mv8>,
    V: FromValue<'mv8>,
    S: BuildHasher + Default,
{
    fn from_value(value: Value<'mv8>, _mv8: &'mv8 MiniV8) -> Result<'mv8, Self> {
        match value {
            Value::Object(o) => o.properties(false)?.collect(),
            value => Err(Error::from_js_conversion(value.type_name(), "HashMap")),
        }
    }
}

impl<'mv8, K, V> ToValue<'mv8> for BTreeMap<K, V>
where
    K: Ord + ToValue<'mv8>,
    V: ToValue<'mv8>,
{
    fn to_value(self, mv8: &'mv8 MiniV8) -> Result<'mv8, Value<'mv8>> {
        let object = mv8.create_object();
        for (k, v) in self.into_iter() {
            object.set(k, v)?;
        }
        Ok(Value::Object(object))
    }
}

impl<'mv8, K, V> FromValue<'mv8> for BTreeMap<K, V>
where
    K: Ord + FromValue<'mv8>,
    V: FromValue<'mv8>,
{
    fn from_value(value: Value<'mv8>, _mv8: &'mv8 MiniV8) -> Result<'mv8, Self> {
        match value {
            Value::Object(o) => o.properties(false)?.collect(),
            value => Err(Error::from_js_conversion(value.type_name(), "BTreeMap")),
        }
    }
}

impl<'mv8, V: ToValue<'mv8>> ToValue<'mv8> for BTreeSet<V> {
    fn to_value(self, mv8: &'mv8 MiniV8) -> Result<'mv8, Value<'mv8>> {
        let array = mv8.create_array();
        for v in self.into_iter() {
            array.push(v)?;
        }
        Ok(Value::Array(array))
    }
}

impl<'mv8, V: FromValue<'mv8> + Ord> FromValue<'mv8> for BTreeSet<V> {
    fn from_value(value: Value<'mv8>, _mv8: &'mv8 MiniV8) -> Result<'mv8, Self> {
        match value {
            Value::Array(a) => a.elements().collect(),
            value => Err(Error::from_js_conversion(value.type_name(), "BTreeSet")),
        }
    }
}

impl<'mv8, V: ToValue<'mv8>> ToValue<'mv8> for HashSet<V> {
    fn to_value(self, mv8: &'mv8 MiniV8) -> Result<'mv8, Value<'mv8>> {
        let array = mv8.create_array();
        for v in self.into_iter() {
            array.push(v)?;
        }
        Ok(Value::Array(array))
    }
}

impl<'mv8, V: FromValue<'mv8> + Hash + Eq> FromValue<'mv8> for HashSet<V> {
    fn from_value(value: Value<'mv8>, _mv8: &'mv8 MiniV8) -> Result<'mv8, Self> {
        match value {
            Value::Array(a) => a.elements().collect(),
            value => Err(Error::from_js_conversion(value.type_name(), "HashSet")),
        }
    }
}

impl<'mv8, V: ToValue<'mv8>> ToValue<'mv8> for Vec<V> {
    fn to_value(self, mv8: &'mv8 MiniV8) -> Result<'mv8, Value<'mv8>> {
        let array = mv8.create_array();
        for v in self.into_iter() {
            array.push(v)?;
        }
        Ok(Value::Array(array))
    }
}

impl<'mv8, V: FromValue<'mv8>> FromValue<'mv8> for Vec<V> {
    fn from_value(value: Value<'mv8>, _mv8: &'mv8 MiniV8) -> Result<'mv8, Self> {
        match value {
            Value::Array(a) => a.elements().collect(),
            value => Err(Error::from_js_conversion(value.type_name(), "Vec")),
        }
    }
}

impl<'mv8> ToValue<'mv8> for bool {
    fn to_value(self, _mv8: &'mv8 MiniV8) -> Result<'mv8, Value<'mv8>> {
        Ok(Value::Boolean(self))
    }
}

impl<'mv8> FromValue<'mv8> for bool {
    fn from_value(value: Value<'_>, mv8: &'mv8 MiniV8) -> Result<'mv8, Self> {
        Ok(mv8.coerce_boolean(value))
    }
}

impl<'mv8> ToValue<'mv8> for StdString {
    fn to_value(self, mv8: &'mv8 MiniV8) -> Result<'mv8, Value<'mv8>> {
        Ok(Value::String(mv8.create_string(&self)))
    }
}

impl<'mv8> FromValue<'mv8> for StdString {
    fn from_value(value: Value<'mv8>, mv8: &'mv8 MiniV8) -> Result<'mv8, Self> {
        Ok(mv8.coerce_string(value)?.to_string())
    }
}

impl<'mv8> ToValue<'mv8> for &str {
    fn to_value(self, mv8: &'mv8 MiniV8) -> Result<'mv8, Value<'mv8>> {
        Ok(Value::String(mv8.create_string(self)))
    }
}

macro_rules! convert_number {
    ($prim_ty:ty) => {
        impl<'mv8> ToValue<'mv8> for $prim_ty {
            fn to_value(self, _mv8: &'mv8 MiniV8) -> Result<'mv8, Value<'mv8>> {
                Ok(Value::Number(self as f64))
            }
        }

        impl<'mv8> FromValue<'mv8> for $prim_ty {
            fn from_value(value: Value<'mv8>, mv8: &'mv8 MiniV8) -> Result<'mv8, Self> {
                Ok(mv8.coerce_number(value)? as $prim_ty)
            }
        }
    };
}

convert_number!(i8);
convert_number!(u8);
convert_number!(i16);
convert_number!(u16);
convert_number!(i32);
convert_number!(u32);
convert_number!(i64);
convert_number!(u64);
convert_number!(isize);
convert_number!(usize);
convert_number!(f32);
convert_number!(f64);

impl<'mv8> ToValue<'mv8> for Duration {
    fn to_value(self, _mv8: &'mv8 MiniV8) -> Result<'mv8, Value<'mv8>> {
        Ok(Value::Date(
            (self.as_secs() as f64) + (self.as_nanos() as f64) / 1_000_000_000.0,
        ))
    }
}

impl<'mv8> FromValue<'mv8> for Duration {
    fn from_value(value: Value<'mv8>, _mv8: &'mv8 MiniV8) -> Result<'mv8, Duration> {
        match value {
            Value::Date(timestamp) => {
                let secs = timestamp / 1000.0;
                let nanos = ((secs - secs.floor()) * 1_000_000.0).round() as u32;
                Ok(Duration::new(secs as u64, nanos))
            }
            value => Err(Error::from_js_conversion(value.type_name(), "Duration")),
        }
    }
}

impl<'mv8> ToValues<'mv8> for Values<'mv8> {
    fn to_values(self, _mv8: &'mv8 MiniV8) -> Result<'mv8, Values<'mv8>> {
        Ok(self)
    }
}

impl<'mv8> FromValues<'mv8> for Values<'mv8> {
    fn from_values(values: Values<'mv8>, _mv8: &'mv8 MiniV8) -> Result<'mv8, Self> {
        Ok(values)
    }
}

impl<'mv8, T: ToValue<'mv8>> ToValues<'mv8> for Variadic<T> {
    fn to_values(self, mv8: &'mv8 MiniV8) -> Result<'mv8, Values<'mv8>> {
        self.0
            .into_iter()
            .map(|value| value.to_value(mv8))
            .collect()
    }
}

impl<'mv8, T: FromValue<'mv8>> FromValues<'mv8> for Variadic<T> {
    fn from_values(values: Values<'mv8>, mv8: &'mv8 MiniV8) -> Result<'mv8, Self> {
        values
            .into_iter()
            .map(|value| T::from_value(value, mv8))
            .collect::<Result<'_, Vec<T>>>()
            .map(Variadic)
    }
}

impl<'mv8> ToValues<'mv8> for () {
    fn to_values(self, _mv8: &'mv8 MiniV8) -> Result<'mv8, Values<'mv8>> {
        Ok(Values::new())
    }
}

impl<'mv8> FromValues<'mv8> for () {
    fn from_values(_values: Values<'_>, _mv8: &'mv8 MiniV8) -> Result<'mv8, Self> {
        Ok(())
    }
}

macro_rules! impl_tuple {
    ($($name:ident),*) => (
        impl<'mv8, $($name),*> ToValues<'mv8> for ($($name,)*)
        where
            $($name: ToValue<'mv8>,)*
        {
            #[allow(non_snake_case, unused)]
            fn to_values(self, mv8: &'mv8 MiniV8) -> Result<'mv8, Values<'mv8>> {
                let ($($name,)*) = self;
                let reservation = $({ &$name; 1 } +)* 0;
                let mut results = Vec::with_capacity(reservation);
                $(results.push($name.to_value(mv8)?);)*
                Ok(Values::from_vec(results))
            }
        }

        impl<'mv8, $($name),*> FromValues<'mv8> for ($($name,)*)
        where
            $($name: FromValue<'mv8>,)*
        {
            #[allow(non_snake_case, unused_mut, unused_variables)]
            fn from_values(values: Values<'mv8>, mv8: &'mv8 MiniV8) -> Result<'mv8, Self> {
                let mut iter = values.into_vec().into_iter();
                Ok(($({
                    let $name = ();
                    FromValue::from_value(iter.next().unwrap_or(Value::Undefined), mv8)?
                },)*))
            }
        }

        impl<'mv8, $($name,)* VAR> ToValues<'mv8> for ($($name,)* Variadic<VAR>)
        where
            $($name: ToValue<'mv8>,)*
            VAR: ToValue<'mv8>,
        {
            #[allow(non_snake_case, unused)]
            fn to_values(self, mv8: &'mv8 MiniV8) -> Result<'mv8, Values<'mv8>> {
                let ($($name,)* variadic) = self;
                let reservation = $({ &$name; 1 } +)* 1;
                let mut results = Vec::with_capacity(reservation);
                $(results.push($name.to_value(mv8)?);)*
                if results.is_empty() {
                    Ok(variadic.to_values(mv8)?)
                } else {
                    results.append(&mut variadic.to_values(mv8)?.into_vec());
                    Ok(Values::from_vec(results))
                }
            }
        }

        impl<'mv8, $($name,)* VAR> FromValues<'mv8> for ($($name,)* Variadic<VAR>)
        where
            $($name: FromValue<'mv8>,)*
            VAR: FromValue<'mv8>,
        {
            #[allow(non_snake_case, unused_mut, unused_variables)]
            fn from_values(values: Values<'mv8>, mv8: &'mv8 MiniV8) -> Result<'mv8, Self> {
                let mut values = values.into_vec();
                let len = values.len();
                let split = $({ let $name = (); 1 } +)* 0;

                if len < split {
                    values.reserve(split - len);
                    for _ in len..split {
                        values.push(Value::Undefined);
                    }
                }

                let last_values = Values::from_vec(values.split_off(split));
                let variadic = FromValues::from_values(last_values, mv8)?;

                let mut iter = values.into_iter();
                let ($($name,)*) = ($({ let $name = (); iter.next().unwrap() },)*);

                Ok(($(FromValue::from_value($name, mv8)?,)* variadic))
            }
        }
    )
}

impl_tuple!(A);
impl_tuple!(A, B);
impl_tuple!(A, B, C);
impl_tuple!(A, B, C, D);
impl_tuple!(A, B, C, D, E);
impl_tuple!(A, B, C, D, E, F);
impl_tuple!(A, B, C, D, E, F, G);
impl_tuple!(A, B, C, D, E, F, G, H);
impl_tuple!(A, B, C, D, E, F, G, H, I);
impl_tuple!(A, B, C, D, E, F, G, H, I, J);
impl_tuple!(A, B, C, D, E, F, G, H, I, J, K);
impl_tuple!(A, B, C, D, E, F, G, H, I, J, K, L);
impl_tuple!(A, B, C, D, E, F, G, H, I, J, K, L, M);
impl_tuple!(A, B, C, D, E, F, G, H, I, J, K, L, M, N);
impl_tuple!(A, B, C, D, E, F, G, H, I, J, K, L, M, N, O);
impl_tuple!(A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P);
