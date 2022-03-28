use std::{fmt, slice, string::String as StdString};

use super::{mv8_string_to_utf8_value, mv8_utf8_value_drop, Ref};

/// Reference to an immutable JavaScript string.
#[derive(Clone)]
pub struct String<'mv8>(pub(super) Ref<'mv8>);

impl fmt::Display for String<'_> {
    /// Returns a Rust string converted from the V8 string.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        unsafe {
            let utf8 = mv8_string_to_utf8_value(self.0.mv8.interface, self.0.value_ptr);
            assert!(!utf8.data.is_null());
            let data = slice::from_raw_parts(utf8.data, utf8.length as usize).to_vec();
            let string = StdString::from_utf8_unchecked(data);
            mv8_utf8_value_drop(utf8);
            write!(f, "{string}")
        }
    }
}

impl fmt::Debug for String<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}", self.to_string())
    }
}
