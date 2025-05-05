#![expect(unused, clippy::struct_field_names)]

use alloc::collections::BTreeMap;
use std::collections::HashMap;

use super::structs::StructSimple;

// Maps with string keys and various map types
#[derive(specta::Type)]
pub(crate) struct MapStringKey {
    // HashMap with string keys
    string_to_string: HashMap<String, String>,
    string_to_int: HashMap<String, i32>,
    string_to_bool: HashMap<String, bool>,

    // BTreeMap with string keys
    btree_string_to_string: BTreeMap<String, String>,
    btree_string_to_int: BTreeMap<String, i32>,
}

// Maps with numeric keys
#[derive(specta::Type)]
pub(crate) struct MapNumericKey {
    // HashMap with numeric keys
    int_to_string: HashMap<i32, String>,
    int_to_int: HashMap<i32, i32>,

    // BTreeMap with numeric keys
    btree_int_to_string: BTreeMap<i32, String>,
    btree_int_to_int: BTreeMap<i32, i32>,
}

// Maps with struct values
#[derive(specta::Type)]
pub(crate) struct MapStructValue {
    // HashMap with struct values
    string_to_struct: HashMap<String, StructSimple>,
    int_to_struct: HashMap<i32, StructSimple>,

    // BTreeMap with struct values
    btree_string_to_struct: BTreeMap<String, StructSimple>,
    btree_int_to_struct: BTreeMap<i32, StructSimple>,
}

// Maps with enum keys
#[derive(specta::Type)]
pub(crate) enum MapKeyEnum {
    Foo,
    Bar,
    Baz,
}

#[derive(specta::Type)]
pub(crate) struct MapEnumKey {
    enum_to_string: HashMap<MapKeyEnum, String>,
    enum_to_int: HashMap<MapKeyEnum, i32>,
    btree_enum_to_string: BTreeMap<MapKeyEnum, String>,
}

// Nested maps
#[derive(specta::Type)]
pub(crate) struct MapNested {
    nested_maps: HashMap<String, HashMap<String, i32>>,
    triple_nested: HashMap<String, HashMap<String, HashMap<String, bool>>>,
    btree_nested: BTreeMap<String, BTreeMap<i32, String>>,
    mixed_nesting: HashMap<String, BTreeMap<i32, HashMap<String, bool>>>,
}

// Optional maps
#[derive(specta::Type)]
pub(crate) struct MapOptional {
    maybe_map: Option<HashMap<String, i32>>,
    map_of_optionals: HashMap<String, Option<i32>>,
    maybe_btree: Option<BTreeMap<String, String>>,
    btree_of_optionals: BTreeMap<String, Option<i32>>,
}
