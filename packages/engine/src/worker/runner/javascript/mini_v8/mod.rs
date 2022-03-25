//! MiniV8 is a minimal embedded V8 JavaScript engine wrapper for Rust.

mod array;
mod conversion;
mod error;
mod ffi;
mod function;
mod mini_v8;
mod object;
mod string;
#[cfg(test)]
mod tests;
mod value;

//#[ignore(unused_imports)]
use self::ffi::{
    desc_to_result, desc_to_result_noval, desc_to_result_val, ffi_init, mv8_array_get,
    mv8_array_len, mv8_array_new, mv8_array_set, mv8_arraybuffer_new, mv8_coerce_boolean,
    mv8_coerce_number, mv8_coerce_string, mv8_data_node_from_js, mv8_function_call,
    mv8_function_call_new, mv8_function_create, mv8_interface_drop, mv8_interface_eval,
    mv8_interface_get_data, mv8_interface_global, mv8_interface_new, mv8_interface_set_data,
    mv8_object_get, mv8_object_has, mv8_object_keys, mv8_object_new, mv8_object_remove,
    mv8_object_set, mv8_string_new, mv8_string_to_utf8_value, mv8_utf8_value_drop, value_to_desc,
    Interface, Ref, ValueDesc,
};
pub use self::{array::*, error::*, function::*, mini_v8::*, object::*, string::*, value::*};
