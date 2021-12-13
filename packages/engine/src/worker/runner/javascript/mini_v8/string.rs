use std::{fmt, slice, string::String as StdString};

use super::*;

/// Reference to an immutable JavaScript string.
#[derive(Clone)]
pub struct String<'mv8>(pub(super) Ref<'mv8>);

impl<'mv8> String<'mv8> {
    /// Returns a Rust string converted from the V8 string.
    pub fn to_string(&self) -> StdString {
        unsafe {
            let utf8 = mv8_string_to_utf8_value(self.0.mv8.interface, self.0.value_ptr);
            assert!(!utf8.data.is_null());
            let data = slice::from_raw_parts(utf8.data, utf8.length as usize).to_vec();
            let string = StdString::from_utf8_unchecked(data);
            mv8_utf8_value_drop(utf8);
            string
        }
    }
}

impl<'mv8> fmt::Debug for String<'mv8> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}", self.to_string())
    }
}
