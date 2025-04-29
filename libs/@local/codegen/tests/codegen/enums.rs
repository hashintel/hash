#![expect(unused, clippy::empty_enum_variants_with_brackets)]

#[derive(specta::Type)]
pub(crate) enum ExternallyTaggedEnum {
    Unit,
    EmptyUnnamed(),
    SingleUnnamed(i32),
    DoubleUnnamed(bool, String),
    EmptyNamed {},
    SingleNamed { value: i32 },
    MultiNamed { value_1: i32, value_2: String },
}

#[derive(specta::Type)]
#[serde(tag = "type")]
pub(crate) enum InternallyTaggedEnum {
    Unit,
    EmptyNamed {},
    SingleNamed { value: i32 },
    MultiNamed { value_1: i32, value_2: String },
}

#[derive(specta::Type)]
#[serde(tag = "type", content = "content")]
pub(crate) enum AdjacentlyTaggedEnum {
    Unit,
    EmptyUnnamed(),
    SingleUnnamed(i32),
    DoubleUnnamed(bool, String),
    EmptyNamed {},
    SingleNamed { value: i32 },
    MultiNamed { value_1: i32, value_2: String },
}

#[derive(specta::Type)]
#[serde(untagged)]
pub(crate) enum UntaggedEnum {
    Unit,
    EmptyUnnamed(),
    SingleUnnamed(i32),
    DoubleUnnamed(bool, String),
    EmptyNamed {},
    SingleNamed { value: i32 },
    MultiNamed { value_1: i32, value_2: String },
}
