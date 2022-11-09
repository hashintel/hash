use super::ErrorProperty;

#[derive(Debug, serde::Serialize)]
pub enum Location {
    /// Index of something tuple-like, like tuple of tuple struct.
    Tuple(usize),
    /// Index of something array-like, like slice, or [`Vec`]
    Array(usize),
    /// Static field of a struct or enum variant
    Field(&'static str),
    /// Entry in a HashMap or equivalent, for anything that has a variable amount of keys/values.
    Entry(String),
    /// Name of an enum variant
    Variant(&'static str),
}

impl ErrorProperty for Location {
    type Value<'a> = Vec<&'a Self>
        where Self: 'a;

    fn key() -> &'static str {
        "location"
    }

    fn value<'a>(stack: impl Iterator<Item = &'a Self>) -> Self::Value<'a> {
        let mut stack: Vec<_> = stack.collect();
        stack.reverse();

        stack
    }
}
