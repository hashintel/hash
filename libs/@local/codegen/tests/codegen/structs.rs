#![expect(unused, clippy::empty_structs_with_brackets)]

// Unit struct (no fields or braces)
#[derive(specta::Type)]
pub(crate) struct StructUnit;

// Tuple structs with unnamed fields
#[derive(specta::Type)]
pub(crate) struct StructUnnamedSingle(i32);

#[derive(specta::Type)]
pub(crate) struct StructUnnamedDouble(i32, String);

#[derive(specta::Type)]
pub(crate) struct StructUnnamedTriple(i32, String, bool);

// Simple struct with primitive fields (named fields)
#[derive(specta::Type)]
pub(crate) struct StructSimple {
    integer: i32,
    float: f64,
    string: String,
    boolean: bool,
}

// Empty struct
#[derive(specta::Type)]
pub(crate) struct StructEmpty {}

// Struct with optional fields
#[derive(specta::Type)]
pub(crate) struct StructOptional {
    required: String,
    optional: Option<i32>,
}

// Struct with nested structs
#[derive(specta::Type)]
pub(crate) struct StructNested {
    name: String,
    simple: StructSimple,
}
