use std::collections::HashMap;

#[derive(Debug, Copy, Clone)]
#[non_exhaustive]
pub enum Type {
    Null,
    Bool,
    Number,
    String,
    Array,
    Object,

    I8,
    I16,
    I32,
    I64,
    I128,

    U8,
    U16,
    U32,
    U64,
    U128,
    F32,
    F64,

    // custom data-types
    Struct(&'static str),
    Enum(&'static str),

    Other(&'static str),
}

pub struct ErrorCode {
    ns: &'static str,
    id: &'static str,
}

pub struct Expected {
    ty: Type,

    error_code: Option<ErrorCode>,
    constraints: HashMap<String, String>,
    message: String,
}

pub trait Error: Sized + std::error::Error + error_stack::Context {
    fn invalid_type(unexpected: Type, expected: Expected) -> Self;
    fn invalid_value(unexpected: Type, expected: Expected) -> Self;

    fn invalid_length(len: usize) -> Self;
    fn invalid_extra_entries(keys: Vec<usize>) -> Self;
}
