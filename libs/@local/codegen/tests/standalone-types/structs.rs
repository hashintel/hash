#![expect(unused, clippy::empty_structs_with_brackets)]

use oxc::allocator::HashMap;

use crate::enums::EnumInternal;

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
    nullable: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    optional_ser: Option<f32>,
    #[serde(default)]
    optional_de: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    optional_ser_de: Option<f32>,
}

// Struct with nested structs
#[derive(specta::Type)]
pub(crate) struct StructNested {
    name: String,
    simple: StructSimple,
}

// Struct with nested structs
#[derive(specta::Type)]
pub(crate) struct StructSimpleFlattened {
    name: String,
    #[serde(flatten)]
    simple: StructSimple,
}

// Struct with nested structs
#[derive(specta::Type)]
pub(crate) struct StructMultipleFlattened {
    name: String,
    #[serde(flatten)]
    simple: StructSimpleFlattened,
    #[serde(flatten)]
    nested: StructNested,
}

/// Nesting interfaces should simply work without any special handling.
#[derive(specta::Type)]
pub(crate) struct StructNestedInterfaceFlattened {
    name: String,
    #[serde(flatten)]
    nested: StructMultipleFlattened,
}

/// This should generate a `type` alias as [`EnumInternal`] cannot be represented as an interface.
#[derive(specta::Type)]
pub(crate) struct StructFlattenedEnum {
    name: String,
    #[serde(flatten)]
    map: EnumInternal,
}

/// This also generates a `type` alias as the {`EnumInternal`} within [`StructFlattenedEnum`] cannot
/// be represented as an interface.
#[derive(specta::Type)]
pub(crate) struct StructNestedTypeFlattened {
    name: String,
    #[serde(flatten)]
    nested: StructFlattenedEnum,
}

#[derive(specta::Type)]
pub(crate) struct StructSingleSkipped {
    #[specta(skip)]
    integer: i32,
}
#[derive(specta::Type)]
pub(crate) struct StructDoubleSkipped {
    integer: i32,
    #[specta(skip)]
    float: f64,
}

#[derive(specta::Type)]
pub(crate) struct StructMultipleSkipped {
    integer: i32,
    #[specta(skip)]
    float: f64,
    string: String,
}

#[derive(specta::Type)]
pub(crate) struct StructUnnamedSingleSkipped(#[specta(skip)] i32);

#[derive(specta::Type)]
pub(crate) struct StructUnnamedDoubleSkipped(i32, #[specta(skip)] f64);

#[derive(specta::Type)]
pub(crate) struct StructUnnamedMultipleSkipped(i32, #[specta(skip)] f64, String);
