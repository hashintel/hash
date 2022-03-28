use std::{fmt, marker::PhantomData};

use super::{
    desc_to_result, desc_to_result_noval, mv8_array_get, mv8_array_len, mv8_array_set,
    value_to_desc, FromValue, Object, Ref, Result, ToValue, Value,
};

/// Reference to a JavaScript array.
#[derive(Clone)]
pub struct Array<'mv8>(pub(super) Ref<'mv8>);

impl<'mv8> Array<'mv8> {
    /// Consumes the array and downgrades it to a JavaScript object. This is inexpensive, since an
    /// array *is* an object.
    pub fn into_object(self) -> Object<'mv8> {
        Object(self.0)
    }

    /// Get the value using the given array index. Returns `Value::Undefined` if no element at the
    /// index exists.
    ///
    /// Returns an error if `FromValue::from_value` fails for the element.
    pub fn get<V: FromValue<'mv8>>(&self, index: u32) -> Result<'mv8, V> {
        let mv8 = self.0.mv8;
        let result = unsafe { mv8_array_get(mv8.interface, self.0.value_ptr, index) };
        desc_to_result(mv8, result)?.into(mv8)
    }

    /// Sets an array element using the given index and value.
    ///
    /// Returns an error if `ToValue::to_value` fails for the value.
    pub fn set<V: ToValue<'mv8>>(&self, index: u32, value: V) -> Result<'mv8, ()> {
        let mv8 = self.0.mv8;
        let value_desc = value_to_desc(mv8, &value.to_value(mv8)?);
        desc_to_result_noval(mv8, unsafe {
            mv8_array_set(mv8.interface, self.0.value_ptr, index, value_desc)
        })
    }

    /// Returns the number of elements in the array.
    pub fn len(&self) -> u32 {
        unsafe { mv8_array_len(self.0.mv8.interface, self.0.value_ptr) }
    }

    /// Pushes an element to the end of the array. This is a shortcut for `set` using `len` as the
    /// index.
    pub fn push<V: ToValue<'mv8>>(&self, value: V) -> Result<'mv8, ()> {
        self.set(self.len(), value)
    }

    /// Returns an iterator over the array's indexable values.
    pub fn elements<V: FromValue<'mv8>>(self) -> Elements<'mv8, V> {
        Elements {
            array: self,
            index: 0,
            len: None,
            _phantom: PhantomData,
        }
    }
}

impl fmt::Debug for Array<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let len = self.len();
        write!(f, "[")?;
        for i in 0..len {
            match self.get::<Value<'_>>(i) {
                Ok(v) => write!(f, "{:?}", v)?,
                Err(_) => write!(f, "?")?,
            };
            if i + 1 < len {
                write!(f, ", ")?;
            }
        }
        write!(f, "]")
    }
}

pub struct Elements<'mv8, V> {
    array: Array<'mv8>,
    index: u32,
    len: Option<u32>,
    _phantom: PhantomData<V>,
}

impl<'mv8, V: FromValue<'mv8>> Iterator for Elements<'mv8, V> {
    type Item = Result<'mv8, V>;

    fn next(&mut self) -> Option<Self::Item> {
        if self.len.is_none() {
            self.len = Some(self.array.len());
        }

        if self.index >= self.len.unwrap() {
            return None;
        }

        let result = self.array.get(self.index);
        self.index += 1;
        Some(result)
    }
}
