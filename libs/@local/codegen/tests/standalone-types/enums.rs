#![expect(unused, clippy::empty_enum_variants_with_brackets)]

use crate::structs::{StructNested, StructSimple};

// External tagging - default serde behavior (tag is the variant name)
#[derive(specta::Type)]
pub(crate) enum EnumExternal {
    Unit,
    EmptyUnnamed(),
    SingleUnnamed(i32),
    DoubleUnnamed(bool, String),
    EmptyNamed {},
    SingleNamed {
        value: i32,
    },
    MultiNamed {
        value_1: i32,
        value_2: String,
    },
    FlattenedStruct {
        name: String,
        #[serde(flatten)]
        simple: StructSimple,
    },
}

// Internal tagging - tag field is inside the object
#[derive(specta::Type)]
#[serde(tag = "type")]
pub(crate) enum EnumInternal {
    Unit,
    SingleUnnamed(StructSimple),
    EmptyNamed {},
    SingleNamed {
        value: i32,
    },
    MultiNamed {
        value_1: i32,
        value_2: String,
    },
    FlattenedStruct {
        name: String,
        #[serde(flatten)]
        simple: StructSimple,
    },
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
    SingleNamed {
        value: i32,
    },
    MultiNamed {
        value_1: i32,
        value_2: String,
    },
    FlattenedStruct {
        name: String,
        #[serde(flatten)]
        simple: StructSimple,
    },
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
    SingleNamed {
        value: i32,
    },
    MultiNamed {
        value_1: i32,
        value_2: String,
    },
    FlattenedStruct {
        name: String,
        #[serde(flatten)]
        simple: StructSimple,
    },
}

#[derive(specta::Type)]
pub(crate) enum EnumWithSkippedVariants {
    NotSkipped,
    #[specta(skip)]
    SkippedSpectaUnit,
    #[serde(skip)]
    SkippedSerdeUnit,
    #[specta(skip)]
    SkippedSpectaSingleUnnamed(i32),
    #[serde(skip)]
    SkippedSerdeSingleUnnamed(i32),
    #[specta(skip)]
    SkippedSpectaDoubleUnnamed(bool, String),
    #[serde(skip)]
    SkippedSerdeDoubleUnnamed(bool, String),
    #[specta(skip)]
    SkippedSpectaEmptyNamed {},
    #[serde(skip)]
    SkippedSerdeEmptyNamed {},
    #[specta(skip)]
    SkippedSpectaSingleNamed {
        value: i32,
    },
    #[serde(skip)]
    SkippedSerdeSingleNamed {
        value: i32,
    },
    #[specta(skip)]
    SkippedSpectaMultiNamed {
        value_1: i32,
        value_2: String,
    },
    #[serde(skip)]
    SkippedSerdeMultiNamed {
        value_1: i32,
        value_2: String,
    },
    #[specta(skip)]
    SkippedSpectaFlattenedStruct {
        name: String,
        #[serde(flatten)]
        simple: StructSimple,
    },
    #[serde(skip)]
    SkippedSerdeFlattenedStruct {
        name: String,
        #[serde(flatten)]
        simple: StructSimple,
    },
}
