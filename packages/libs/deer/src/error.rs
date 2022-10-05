use core::fmt::Display;
use std::collections::HashMap;

use crate::Number;

pub enum Segment {
    Key(String),
    Index(usize),
}

pub struct Path {
    segments: Vec<Segment>,
}

impl Path {
    pub fn new() -> Self {
        Self {
            segments: Vec::new(),
        }
    }
}

pub enum Primitive {
    Null,
    Bool(bool),
    Number(Number),
    String(String),
}

impl From<bool> for Primitive {
    fn from(value: bool) -> Self {
        Self::Bool(value)
    }
}

impl From<Number> for Primitive {
    fn from(number: Number) -> Self {
        Self::Number(number)
    }
}

impl From<String> for Primitive {
    fn from(string: String) -> Self {
        Self::String(string)
    }
}

#[derive(Debug, Copy, Clone)]
#[non_exhaustive]
pub enum Type {
    Null,
    Bool,
    Number,
    String,
    Array,
    Object,

    // custom data-types
    Struct(&'static str),
    Enum(&'static str),

    Other(&'static str),
}

struct ErrorCode {
    ns: &'static str,
    id: &'static str,
}

pub struct Expected {
    ty: Type,

    error_code: Option<ErrorCode>,
    constraints: HashMap<String, Primitive>,
    message: Option<String>,
}

impl Expected {
    pub fn new(ty: Type) -> Self {
        Self {
            ty,
            error_code: None,
            constraints: HashMap::new(),
            message: None,
        }
    }

    pub fn with_error_code(mut self, ns: &'static str, id: &'static str) -> Self {
        self.error_code = Some(ErrorCode { ns, id });
        self
    }

    pub fn with_message(mut self, message: impl Into<String>) -> Self {
        self.message = Some(message.into());
        self
    }

    pub fn with_constraint(mut self, key: impl Into<String>, value: impl Into<Primitive>) -> Self {
        self.constraints.insert(key.into(), value.into());
        self
    }
}

pub trait Error: Sized + std::error::Error + error_stack::Context {
    fn invalid_type(unexpected: Type, expected: Expected) -> Self;
    fn invalid_value(unexpected: Type, expected: Expected) -> Self;

    fn invalid_length(len: usize) -> Self;
    fn invalid_extra_entries(keys: Vec<usize>) -> Self;
}
