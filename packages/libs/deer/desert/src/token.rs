use core::fmt::{Debug, Display, Formatter};

use deer::Number;

// TODO: test
#[derive(Debug, Copy, Clone)]
pub enum Token {
    Bool(bool),
    Number(&'static Number),
    Char(char),
    Str(&'static str),
    BorrowedStr(&'static str),
    String(&'static str),
    Bytes(&'static [u8]),
    BorrowedBytes(&'static [u8]),
    BytesBuf(&'static [u8]),
    Array { length: Option<usize> },
    ArrayEnd,
    Object { length: Option<usize> },
    ObjectEnd,
    Trivia,
}

impl Display for Token {
    fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
        Debug::fmt(self, f)
    }
}
