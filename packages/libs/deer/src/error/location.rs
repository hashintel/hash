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
