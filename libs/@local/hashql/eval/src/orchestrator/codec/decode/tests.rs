use alloc::{alloc::Global, rc::Rc};
use core::assert_matches;

use hashql_core::{
    heap::Heap,
    symbol::sym,
    r#type::{TypeId, builder::TypeBuilder, environment::Environment},
};
use hashql_mir::interpret::value::{self, Value};

use super::{DecodeError, Decoder, JsonValueRef};
use crate::intern::Interner;

fn str_value(content: &str) -> Value<'_, Global> {
    Value::String(value::Str::from(Rc::<str>::from(content)))
}

fn decoder<'env, 'heap>(
    env: &'env Environment<'heap>,
    interner: &'env Interner<'heap>,
) -> Decoder<'env, 'heap, Global> {
    Decoder::new(env, interner, Global)
}

#[test]
fn primitive_string() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::testing(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let result = decoder
        .decode(types.string(), JsonValueRef::String("hello"))
        .expect("should succeed");
    assert_eq!(result, str_value("hello"));
}

#[test]
fn primitive_integer() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::testing(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let number = serde_json::Number::from(42);
    let result = decoder
        .decode(types.integer(), JsonValueRef::Number(&number))
        .expect("should succeed");
    assert_eq!(result, Value::Integer(value::Int::from(42_i128)));
}

#[test]
fn primitive_number() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::testing(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let number = serde_json::Number::from_f64(2.72).expect("valid f64");
    let result = decoder
        .decode(types.number(), JsonValueRef::Number(&number))
        .expect("should decode number");
    assert_eq!(result, Value::Number(value::Num::from(2.72)));
}

#[test]
fn primitive_boolean_true() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::testing(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let result = decoder
        .decode(types.boolean(), JsonValueRef::Bool(true))
        .expect("should succeed");
    let Value::Integer(int) = result else {
        panic!("expected Value::Integer, got {result:?}");
    };
    assert_eq!(int.as_bool(), Some(true));
}

#[test]
fn primitive_boolean_false() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::testing(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let result = decoder
        .decode(types.boolean(), JsonValueRef::Bool(false))
        .expect("should succeed");
    let Value::Integer(int) = result else {
        panic!("expected Value::Integer, got {result:?}");
    };
    assert_eq!(int.as_bool(), Some(false));
}

#[test]
fn primitive_null() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::testing(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let result = decoder
        .decode(types.null(), JsonValueRef::Null)
        .expect("should succeed");
    assert_eq!(result, Value::Unit);
}

#[test]
fn primitive_type_mismatch() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::testing(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let result = decoder.decode(types.integer(), JsonValueRef::String("hello"));
    assert_matches!(result, Err(DecodeError::TypeMismatch { .. }));
}

#[test]
fn struct_matching_fields() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::testing(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let struct_type = types.r#struct([("a", types.integer()), ("b", types.string())]);

    let mut object = serde_json::Map::new();
    object.insert("a".to_owned(), serde_json::Value::Number(1.into()));
    object.insert("b".to_owned(), serde_json::Value::String("two".to_owned()));

    let result = decoder
        .decode(struct_type, JsonValueRef::Object(&object))
        .expect("should succeed");
    let Value::Struct(fields) = &result else {
        panic!("expected Value::Struct, got {result:?}");
    };
    assert_eq!(fields.len(), 2);
    assert_eq!(fields.values()[0], Value::Integer(value::Int::from(1_i128)));
    assert_eq!(fields.values()[1], str_value("two"));
}

#[test]
fn struct_missing_field() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::testing(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let struct_type = types.r#struct([("a", types.integer()), ("b", types.string())]);

    let mut object = serde_json::Map::new();
    object.insert("a".to_owned(), serde_json::Value::Number(1.into()));

    let result = decoder.decode(struct_type, JsonValueRef::Object(&object));
    assert_matches!(result, Err(DecodeError::StructLengthMismatch { .. }));
}

#[test]
fn struct_extra_field() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::testing(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let struct_type = types.r#struct([("a", types.integer())]);

    let mut object = serde_json::Map::new();
    object.insert("a".to_owned(), serde_json::Value::Number(1.into()));
    object.insert("b".to_owned(), serde_json::Value::Number(2.into()));

    let result = decoder.decode(struct_type, JsonValueRef::Object(&object));
    assert_matches!(result, Err(DecodeError::StructLengthMismatch { .. }));
}

#[test]
fn tuple_correct_length() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::testing(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let tuple_type = types.tuple([types.integer(), types.string()]);

    let array = [
        serde_json::Value::Number(1.into()),
        serde_json::Value::String("two".to_owned()),
    ];

    let result = decoder
        .decode(tuple_type, JsonValueRef::Array(&array))
        .expect("should succeed");
    let Value::Tuple(elements) = &result else {
        panic!("expected Value::Tuple, got {result:?}");
    };
    assert_eq!(elements.len().get(), 2);
    assert_eq!(
        elements.values()[0],
        Value::Integer(value::Int::from(1_i128))
    );
    assert_eq!(elements.values()[1], str_value("two"));
}

#[test]
fn tuple_length_mismatch() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::testing(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let tuple_type = types.tuple([types.integer(), types.string()]);
    let array = [serde_json::Value::Number(1.into())];

    let result = decoder.decode(tuple_type, JsonValueRef::Array(&array));
    assert_matches!(result, Err(DecodeError::TupleLengthMismatch { .. }));
}

#[test]
fn union_first_variant_matches() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::testing(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let union_type = types.union([types.integer(), types.string()]);
    let number = serde_json::Number::from(42);

    let result = decoder
        .decode(union_type, JsonValueRef::Number(&number))
        .expect("should succeed");
    assert_eq!(result, Value::Integer(value::Int::from(42_i128)));
}

#[test]
fn union_second_variant_matches() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::testing(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let union_type = types.union([types.integer(), types.string()]);

    let result = decoder
        .decode(union_type, JsonValueRef::String("hello"))
        .expect("should succeed");
    assert_eq!(result, str_value("hello"));
}

#[test]
fn union_no_variant_matches() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::testing(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let union_type = types.union([types.integer(), types.string()]);

    let result = decoder.decode(union_type, JsonValueRef::Bool(true));
    assert_matches!(result, Err(DecodeError::NoMatchingVariant { .. }));
}

#[test]
fn opaque_wraps_inner() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::testing(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let opaque_type = types.opaque(sym::path::Entity, types.string());

    let result = decoder
        .decode(opaque_type, JsonValueRef::String("inner"))
        .expect("should succeed");
    let Value::Opaque(opaque) = &result else {
        panic!("expected Value::Opaque, got {result:?}");
    };
    assert_eq!(opaque.name(), sym::path::Entity);
    assert_eq!(*opaque.value(), str_value("inner"));
}

#[test]
fn list_intrinsic() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::testing(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let list_type = types.list(types.integer());
    let array = [
        serde_json::Value::Number(1.into()),
        serde_json::Value::Number(2.into()),
    ];

    let result = decoder
        .decode(list_type, JsonValueRef::Array(&array))
        .expect("should succeed");
    let Value::List(list) = &result else {
        panic!("expected Value::List, got {result:?}");
    };
    assert_eq!(list.len(), 2);
    let items: Vec<_> = list.iter().collect();
    assert_eq!(items[0], &Value::Integer(value::Int::from(1_i128)));
    assert_eq!(items[1], &Value::Integer(value::Int::from(2_i128)));
}

#[test]
fn dict_intrinsic() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::testing(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let dict_type = types.dict(types.string(), types.integer());

    let mut object = serde_json::Map::new();
    object.insert("x".to_owned(), serde_json::Value::Number(1.into()));
    object.insert("y".to_owned(), serde_json::Value::Number(2.into()));

    let result = decoder
        .decode(dict_type, JsonValueRef::Object(&object))
        .expect("should succeed");
    let Value::Dict(dict) = &result else {
        panic!("expected Value::Dict, got {result:?}");
    };
    assert_eq!(dict.len(), 2);
    assert_eq!(
        dict.get(&str_value("x")),
        Some(&Value::Integer(value::Int::from(1_i128)))
    );
    assert_eq!(
        dict.get(&str_value("y")),
        Some(&Value::Integer(value::Int::from(2_i128)))
    );
}

#[test]
fn intersection_type_error() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::testing(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let intersection_type = types.intersection([types.integer(), types.string()]);

    let result = decoder.decode(intersection_type, JsonValueRef::Null);
    assert_matches!(result, Err(DecodeError::IntersectionType { .. }));
}

#[test]
fn closure_type_error() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::testing(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let closure_type = types.closure([] as [TypeId; 0], types.integer());

    let result = decoder.decode(closure_type, JsonValueRef::Null);
    assert_matches!(result, Err(DecodeError::ClosureType { .. }));
}

#[test]
fn never_type_error() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::testing(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let result = decoder.decode(types.never(), JsonValueRef::Null);
    assert_matches!(result, Err(DecodeError::NeverType { .. }));
}

#[test]
fn unknown_type_integer_fallback() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::testing(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let number = serde_json::Number::from(42);
    let result = decoder
        .decode(types.unknown(), JsonValueRef::Number(&number))
        .expect("should succeed");
    assert_eq!(result, Value::Integer(value::Int::from(42_i128)));
}

#[test]
fn unknown_type_float_fallback() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::testing(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let number = serde_json::Number::from_f64(2.72).expect("should succeed");
    let result = decoder
        .decode(types.unknown(), JsonValueRef::Number(&number))
        .expect("should succeed");
    assert_eq!(result, Value::Number(value::Num::from(2.72)));
}

#[test]
fn unknown_type_array_becomes_list() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::testing(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let array = [serde_json::Value::Number(1.into())];
    let result = decoder
        .decode(types.unknown(), JsonValueRef::Array(&array))
        .expect("should succeed");
    let Value::List(list) = &result else {
        panic!("expected Value::List, got {result:?}");
    };
    assert_eq!(list.len(), 1);
    let items: Vec<_> = list.iter().collect();
    assert_eq!(items[0], &Value::Integer(value::Int::from(1_i128)));
}

#[test]
fn unknown_type_non_url_object_becomes_dict() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::testing(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let mut object = serde_json::Map::new();
    object.insert("key".to_owned(), serde_json::Value::Number(1.into()));

    let result = decoder
        .decode(types.unknown(), JsonValueRef::Object(&object))
        .expect("should succeed");
    let Value::Dict(_) = &result else {
        panic!("expected Value::Dict, got {result:?}");
    };
}

#[test]
fn unknown_type_url_object_becomes_struct() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::testing(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let mut object = serde_json::Map::new();
    object.insert(
        "https://example.com/types/property-type/name/".to_owned(),
        serde_json::Value::String("Alice".to_owned()),
    );

    let result = decoder
        .decode(types.unknown(), JsonValueRef::Object(&object))
        .expect("should succeed");
    let Value::Struct(fields) = &result else {
        panic!("expected Value::Struct, got {result:?}");
    };
    assert_eq!(fields.len(), 1);
    assert_eq!(fields.values()[0], str_value("Alice"));
}

mod miri {
    use alloc::alloc::Global;
    use core::{
        alloc::{AllocError, Allocator, Layout},
        assert_matches,
        cell::Cell,
        panic::AssertUnwindSafe,
        ptr::NonNull,
    };
    use std::panic::catch_unwind;

    use hashql_core::{
        heap::Heap,
        r#type::{builder::TypeBuilder, environment::Environment},
    };
    use hashql_mir::interpret::value::Value;
    use serde_json::json;

    use crate::{
        intern::Interner,
        orchestrator::{
            codec::{Decoder, JsonValueKind, JsonValueRef},
            error::DecodeError,
        },
    };

    /// A [`Global`] allocator that panics after the permitted number of clones.
    #[derive(Debug)]
    struct PanicAllocator<'budget>(&'budget Cell<usize>);

    impl Clone for PanicAllocator<'_> {
        fn clone(&self) -> Self {
            let remaining = self.0.get();
            assert!(remaining > 0, "allocator clone");
            self.0.set(remaining - 1);
            Self(self.0)
        }
    }

    // SAFETY: Global owns every allocation. Moving or dropping PanicAllocator leaves its storage
    // valid, and every allocation operation delegates to Global with an unchanged layout. This
    // preserves the Allocator contract.
    unsafe impl Allocator for PanicAllocator<'_> {
        fn allocate(&self, layout: Layout) -> Result<NonNull<[u8]>, AllocError> {
            Global.allocate(layout)
        }

        unsafe fn deallocate(&self, ptr: NonNull<u8>, layout: Layout) {
            // SAFETY: The caller supplies a live allocation and a fitting layout. Every allocation
            // from this allocator comes from Global with its layout unchanged, permitting this
            // release.
            unsafe {
                Global.deallocate(ptr, layout);
            }
        }
    }

    #[test]
    fn tuple_nested_error() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let interner = Interner::testing(&heap);
        let types = TypeBuilder::synthetic(&env);
        let decoder = Decoder::new(&env, &interner, Global);
        let string = types.string();
        let tuple = types.tuple([string, types.tuple([string; 2]), string]);
        // both tuples own an initialized string when the inner decode fails.
        let input = json!(["outer", ["inner", null], "unwritten"]);

        let result = decoder.decode(tuple, JsonValueRef::from(&input));
        assert_matches!(
            result,
            Err(DecodeError::TypeMismatch { expected, received: JsonValueKind::Null })
                if expected == string
        );
    }

    #[test]
    fn struct_nested_error() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let interner = Interner::testing(&heap);
        let types = TypeBuilder::synthetic(&env);
        let decoder = Decoder::new(&env, &interner, Global);
        let string = types.string();
        let structure = types.r#struct([
            ("a", string),
            ("b", types.tuple([string; 2])),
            ("c", string),
        ]);
        // with serde_json/preserve_order, slot 2 is initialized before slot 1 fails; slot 0 still
        // holds Unit.
        let input = json!({"c": "outer", "b": ["inner", null], "a": "unwritten"});

        let result = decoder.decode(structure, JsonValueRef::from(&input));
        assert_matches!(
            result,
            Err(DecodeError::TypeMismatch { expected, received: JsonValueKind::Null })
                if expected == string
        );
    }

    #[test]
    fn unknown_struct_complete() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let interner = Interner::testing(&heap);
        let types = TypeBuilder::synthetic(&env);
        let decoder = Decoder::new(&env, &interner, Global);
        let input = json!({
            "https://example.com/c/": "three",
            "https://example.com/a/": "one",
            "https://example.com/b/": "two",
        });

        let result = decoder
            .decode(types.unknown(), JsonValueRef::from(&input))
            .expect("should decode the unknown struct");
        let Value::Struct(structure) = &result else {
            panic!("should produce a struct");
        };
        assert_eq!(structure.len(), 3);
        assert!(structure.fields().is_sorted(), "should sort field names");
        for (name, expected) in [
            ("https://example.com/a/", "one"),
            ("https://example.com/b/", "two"),
            ("https://example.com/c/", "three"),
        ] {
            assert_matches!(
                structure.get_by_name(heap.intern_symbol(name)),
                Some(Value::String(string)) if string.as_str() == expected
            );
        }
    }

    #[test]
    fn aggregate_clone_panic() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let interner = Interner::testing(&heap);
        let types = TypeBuilder::synthetic(&env);
        let string = types.string();
        let structure = types.r#struct([("a", string), ("b", string), ("c", string)]);

        // permit the aggregate buffer and first string to be allocated before the next clone
        // panics. Structs also allocate a field-name buffer.
        for (type_id, input, permitted_clones) in [
            (types.tuple([string; 3]), json!(["one", "two", "three"]), 2),
            (structure, json!({"c": "three", "a": "one", "b": "two"}), 3),
            (
                types.unknown(),
                json!({
                    "https://example.com/c/": "three",
                    "https://example.com/a/": "one",
                    "https://example.com/b/": "two",
                }),
                3,
            ),
        ] {
            let remaining = Cell::new(permitted_clones);
            let decoder = Decoder::new(&env, &interner, PanicAllocator(&remaining));
            // the decoder is dropped after unwinding rather than used for another decode.
            let result = catch_unwind(AssertUnwindSafe(|| {
                decoder.decode(type_id, JsonValueRef::from(&input))
            }));
            let panic = result.expect_err("should panic while decoding the second string");
            assert_eq!(
                panic.downcast_ref::<&str>(),
                Some(&"allocator clone"),
                "should catch the injected panic"
            );
        }
    }
}
