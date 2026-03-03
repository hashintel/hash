#![expect(unused, clippy::struct_field_names, clippy::linkedlist)]

use alloc::collections::{BTreeSet, LinkedList, VecDeque};
use std::collections::HashSet;

use super::structs::StructSimple;

// Simple list of primitive types with various collection types
#[derive(specta::Type)]
pub(crate) struct ListPrimitives {
    // Vec collections
    strings: Vec<String>,
    integers: Vec<i32>,
    floats: VecDeque<f64>,
    booleans: VecDeque<bool>,

    // Array collections with fixed size
    small_array: [i32; 3],
    string_array: [String; 2],
    boolean_array: [bool; 4],

    // HashSet collections
    string_set: HashSet<String>,
    integer_set: HashSet<i32>,

    // BTreeSet collections
    btree_string_set: BTreeSet<String>,
    btree_integer_set: BTreeSet<i32>,

    // LinkedList collections
    linked_string_list: LinkedList<String>,
    linked_integer_list: LinkedList<i32>,

    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    non_empty_list: Vec<i32>,
}

// List of optional items
#[derive(specta::Type)]
pub(crate) struct ListOptionals {
    optional_strings: Vec<Option<String>>,
    optional_integers: Vec<Option<i32>>,
    optional_arrays: Vec<Option<[i32; 3]>>,
    optional_sets: Vec<Option<HashSet<String>>>,
}

// Nested lists
#[derive(specta::Type)]
pub(crate) struct ListNested {
    list_of_lists: Vec<Vec<i32>>,
    matrix: Vec<Vec<Vec<i32>>>,
    nested_sets: HashSet<HashSet<i32>>,
    mixed_nesting: Vec<HashSet<i32>>,
}

// Lists of structs
#[derive(specta::Type)]
pub(crate) struct ListStructs {
    vec_items: Vec<StructSimple>,
    array_items: [StructSimple; 2],
    set_items: HashSet<StructSimple>,
    linked_items: LinkedList<StructSimple>,
}

// Struct with multiple types of collections
#[derive(specta::Type)]
pub(crate) struct ListCollections {
    string_list: Vec<String>,
    number_list: Vec<i32>,
    nested_list: Vec<StructSimple>,
}
