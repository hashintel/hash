#![expect(unused, clippy::empty_enum_variants_with_brackets)]

// External tagging - default serde behavior (tag is the variant name)
#[derive(specta::Type)]
pub(crate) enum EnumExternal {
    Unit,
    EmptyUnnamed(),
    SingleUnnamed(i32),
    DoubleUnnamed(bool, String),
    EmptyNamed {},
    SingleNamed { value: i32 },
    MultiNamed { value_1: i32, value_2: String },
}

// Internal tagging - tag field is inside the object
#[derive(specta::Type)]
#[serde(tag = "type")]
pub(crate) enum EnumInternal {
    Unit,
    EmptyNamed {},
    SingleNamed { value: i32 },
    MultiNamed { value_1: i32, value_2: String },
}

// Adjacent tagging - separate fields for tag and content
#[derive(specta::Type)]
#[serde(tag = "type", content = "content")]
pub(crate) enum EnumAdjacent {
    Unit,
    EmptyUnnamed(),
    SingleUnnamed(i32),
    DoubleUnnamed(bool, String),
    EmptyNamed {},
    SingleNamed { value: i32 },
    MultiNamed { value_1: i32, value_2: String },
}

// Untagged - no discriminator field, purely based on shape
#[derive(specta::Type)]
#[serde(untagged)]
pub(crate) enum EnumUntagged {
    Unit,
    EmptyUnnamed(),
    SingleUnnamed(i32),
    DoubleUnnamed(bool, String),
    EmptyNamed {},
    SingleNamed { value: i32 },
    MultiNamed { value_1: i32, value_2: String },
}
