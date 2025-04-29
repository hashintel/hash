#![expect(unused)]

// Struct with empty tuple field
#[derive(specta::Type)]
pub(crate) struct TupleEmpty {
    empty: (),
}

// Struct with single element tuple field
#[derive(specta::Type)]
pub(crate) struct TupleSingle {
    single: (i32,),
}

// Struct with two element tuple field
#[derive(specta::Type)]
pub(crate) struct TupleDouble {
    double: (i32, String),
}

// Struct with multiple element tuple field
#[derive(specta::Type)]
pub(crate) struct TupleMultiple {
    multiple: (i32, String, bool, f64),
}

// Struct with nested tuple field
#[derive(specta::Type)]
pub(crate) struct TupleNested {
    nested: (String, (i32, bool)),
}

// Struct with optional tuple field
#[derive(specta::Type)]
pub(crate) struct TupleOptional {
    optional: Option<(f32, f32)>,
}
