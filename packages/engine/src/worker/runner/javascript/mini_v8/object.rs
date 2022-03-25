use std::{fmt, marker::PhantomData};

use super::{
    desc_to_result, desc_to_result_noval, desc_to_result_val, mv8_object_get, mv8_object_has,
    mv8_object_keys, mv8_object_remove, mv8_object_set, value_to_desc, Array, FromValue, Function,
    Ref, Result, ToValue, ToValues, Value,
};

/// Reference to a JavaScript object.
#[derive(Clone)]
pub struct Object<'mv8>(pub(super) Ref<'mv8>);

impl<'mv8> Object<'mv8> {
    /// Get an object property value using the given key. Returns `Value::Undefined` if no property
    /// with the key exists.
    ///
    /// Returns an error if `ToValue::to_value` fails for the key or if the key value could not be
    /// cast to a property key string.
    pub fn get<K: ToValue<'mv8>, V: FromValue<'mv8>>(&self, key: K) -> Result<'mv8, V> {
        let mv8 = self.0.mv8;
        let key_desc = value_to_desc(mv8, &key.to_value(mv8)?);
        let result = unsafe { mv8_object_get(mv8.interface, self.0.value_ptr, key_desc) };
        desc_to_result(mv8, result)?.into(mv8)
    }

    /// Sets an object property using the given key and value.
    ///
    /// Returns an error if `ToValue::to_value` fails for either the key or the value or if the key
    /// value could not be cast to a property key string.
    pub fn set<K: ToValue<'mv8>, V: ToValue<'mv8>>(&self, key: K, value: V) -> Result<'mv8, ()> {
        let mv8 = self.0.mv8;
        let key_desc = value_to_desc(mv8, &key.to_value(mv8)?);
        let value_desc = value_to_desc(mv8, &value.to_value(mv8)?);
        desc_to_result_noval(mv8, unsafe {
            mv8_object_set(mv8.interface, self.0.value_ptr, key_desc, value_desc)
        })
    }

    /// Removes the property associated with the given key from the object. This function does
    /// nothing if the property does not exist.
    ///
    /// Returns an error if `ToValue::to_value` fails for the key or if the key value could not be
    /// cast to a property key string.
    pub fn remove<K: ToValue<'mv8>>(&self, key: K) -> Result<'mv8, ()> {
        let mv8 = self.0.mv8;
        let key_desc = value_to_desc(mv8, &key.to_value(mv8)?);
        let result = unsafe { mv8_object_remove(mv8.interface, self.0.value_ptr, key_desc) };
        desc_to_result_noval(mv8, result)
    }

    /// Returns `true` if the given key is a property of the object, `false` otherwise.
    ///
    /// Returns an error if `ToValue::to_value` fails for the key or if the key value could not be
    /// cast to a property key string.
    pub fn has<K: ToValue<'mv8>>(&self, key: K) -> Result<'mv8, bool> {
        let mv8 = self.0.mv8;
        let key_desc = value_to_desc(mv8, &key.to_value(mv8)?);
        let result = unsafe { mv8_object_has(mv8.interface, self.0.value_ptr, key_desc) };
        let has_desc = desc_to_result_val(mv8, result)?;
        Ok(unsafe { has_desc.payload.byte } == 1)
    }

    /// Calls the function at the key with the given arguments, with `this` set to the object.
    /// Returns an error if the value at the key is not a function.
    pub fn call_prop<K, A, R>(&self, key: K, args: A) -> Result<'mv8, R>
    where
        K: ToValue<'mv8>,
        A: ToValues<'mv8>,
        R: FromValue<'mv8>,
    {
        let func: Function<'_> = self.get(key)?;
        func.call_method(self.clone(), args)
    }

    /// Returns an array containing all of this object's enumerable property keys. If
    /// `include_inherited` is `false`, then only the object's own enumerable properties will be
    /// collected (similar to `Object.getOwnPropertyNames` in Javascript). If `include_inherited` is
    /// `true`, then the object's own properties and the enumerable properties from its prototype
    /// chain will be collected.
    pub fn keys(&self, include_inherited: bool) -> Result<'mv8, Array<'mv8>> {
        let mv8 = self.0.mv8;
        let include_inherited = if include_inherited { 1 } else { 0 };
        let result = unsafe { mv8_object_keys(mv8.interface, self.0.value_ptr, include_inherited) };
        Ok(Array(Ref::from_value_desc(
            mv8,
            desc_to_result_val(mv8, result)?,
        )))
    }

    /// Converts the object into an iterator over the object's keys and values, acting like a
    /// `for-in` loop.
    ///
    /// For information on the `include_inherited` argument, see `Object::keys`.
    pub fn properties<K, V>(self, include_inherited: bool) -> Result<'mv8, Properties<'mv8, K, V>>
    where
        K: FromValue<'mv8>,
        V: FromValue<'mv8>,
    {
        let keys = self.keys(include_inherited)?;
        Ok(Properties {
            object: self,
            keys,
            index: 0,
            _phantom: PhantomData,
        })
    }
}

impl fmt::Debug for Object<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let keys = match self.keys(false) {
            Ok(keys) => keys,
            Err(_) => return write!(f, "<object with keys exception>"),
        };

        let len = keys.len();
        if len == 0 {
            return write!(f, "{{}}");
        }

        write!(f, "{{ ")?;
        for i in 0..len {
            if let Ok(k) = keys
                .get::<Value<'_>>(i)
                .and_then(|k| self.0.mv8.coerce_string(k))
            {
                write!(f, "{:?}: ", k)?;
                match self.get::<_, Value<'_>>(k) {
                    Ok(v) => write!(f, "{:?}", v)?,
                    Err(_) => write!(f, "?")?,
                };
            } else {
                write!(f, "?")?;
            }
            if i + 1 < len {
                write!(f, ", ")?;
            }
        }
        write!(f, " }}")
    }
}

/// An iterator over an object's keys and values, acting like a `for-in` loop.
pub struct Properties<'mv8, K, V> {
    object: Object<'mv8>,
    keys: Array<'mv8>,
    index: u32,
    _phantom: PhantomData<(K, V)>,
}

impl<'mv8, K, V> Iterator for Properties<'mv8, K, V>
where
    K: FromValue<'mv8>,
    V: FromValue<'mv8>,
{
    type Item = Result<'mv8, (K, V)>;

    /// This will return `Some(Err(...))` if the next property's key or value failed to be converted
    /// into `K` or `V` respectively (through `ToValue`).
    fn next(&mut self) -> Option<Self::Item> {
        if self.index >= self.keys.len() {
            return None;
        }

        let key = self.keys.get::<Value<'_>>(self.index);
        self.index += 1;

        let key = match key {
            Ok(v) => v,
            Err(e) => return Some(Err(e)),
        };

        let value = match self.object.get::<_, V>(key.clone()) {
            Ok(v) => v,
            Err(e) => return Some(Err(e)),
        };

        let key = match key.into(self.object.0.mv8) {
            Ok(v) => v,
            Err(e) => return Some(Err(e)),
        };

        Some(Ok((key, value)))
    }
}
