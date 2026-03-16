use alloc::{alloc::Global, rc::Rc};

use hashql_core::{
    heap::Heap,
    symbol::sym,
    r#type::{TypeId, builder::TypeBuilder, environment::Environment},
};
use hashql_mir::{
    intern::Interner,
    interpret::value::{self, Value},
};

use super::{DecodeError, Decoder, JsonValueRef};

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
    let interner = Interner::new(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let result = decoder
        .decode(types.string(), JsonValueRef::String("hello"))
        .unwrap();
    assert_eq!(result, str_value("hello"));
}

#[test]
fn primitive_integer() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::new(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let number = serde_json::Number::from(42);
    let result = decoder
        .decode(types.integer(), JsonValueRef::Number(&number))
        .unwrap();
    assert_eq!(result, Value::Integer(value::Int::from(42_i128)));
}

#[test]
fn primitive_number() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::new(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let number = serde_json::Number::from_f64(3.14).unwrap();
    let result = decoder
        .decode(types.number(), JsonValueRef::Number(&number))
        .unwrap();
    assert_eq!(result, Value::Number(value::Num::from(3.14)));
}

#[test]
fn primitive_boolean_true() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::new(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let result = decoder
        .decode(types.boolean(), JsonValueRef::Bool(true))
        .unwrap();
    let Value::Integer(int) = result else {
        panic!("expected Value::Integer, got {result:?}");
    };
    assert_eq!(int.as_bool(), Some(true));
}

#[test]
fn primitive_boolean_false() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::new(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let result = decoder
        .decode(types.boolean(), JsonValueRef::Bool(false))
        .unwrap();
    let Value::Integer(int) = result else {
        panic!("expected Value::Integer, got {result:?}");
    };
    assert_eq!(int.as_bool(), Some(false));
}

#[test]
fn primitive_null() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::new(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let result = decoder.decode(types.null(), JsonValueRef::Null).unwrap();
    assert_eq!(result, Value::Unit);
}

#[test]
fn primitive_type_mismatch() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::new(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let result = decoder.decode(types.integer(), JsonValueRef::String("hello"));
    assert!(matches!(result, Err(DecodeError::TypeMismatch { .. })));
}

#[test]
fn struct_matching_fields() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::new(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let struct_type = types.r#struct([("a", types.integer()), ("b", types.string())]);

    let mut object = serde_json::Map::new();
    object.insert("a".to_owned(), serde_json::Value::Number(1.into()));
    object.insert("b".to_owned(), serde_json::Value::String("two".to_owned()));

    let result = decoder
        .decode(struct_type, JsonValueRef::Object(&object))
        .unwrap();
    let Value::Struct(fields) = &result else {
        panic!("expected Value::Struct, got {result:?}");
    };
    assert_eq!(fields.len(), 2);
}

#[test]
fn struct_missing_field() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::new(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let struct_type = types.r#struct([("a", types.integer()), ("b", types.string())]);

    let mut object = serde_json::Map::new();
    object.insert("a".to_owned(), serde_json::Value::Number(1.into()));

    let result = decoder.decode(struct_type, JsonValueRef::Object(&object));
    assert!(matches!(
        result,
        Err(DecodeError::StructLengthMismatch { .. })
    ));
}

#[test]
fn struct_extra_field() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::new(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let struct_type = types.r#struct([("a", types.integer())]);

    let mut object = serde_json::Map::new();
    object.insert("a".to_owned(), serde_json::Value::Number(1.into()));
    object.insert("b".to_owned(), serde_json::Value::Number(2.into()));

    let result = decoder.decode(struct_type, JsonValueRef::Object(&object));
    assert!(matches!(
        result,
        Err(DecodeError::StructLengthMismatch { .. })
    ));
}

#[test]
fn tuple_correct_length() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::new(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let tuple_type = types.tuple([types.integer(), types.string()]);

    let array = [
        serde_json::Value::Number(1.into()),
        serde_json::Value::String("two".to_owned()),
    ];

    let result = decoder
        .decode(tuple_type, JsonValueRef::Array(&array))
        .unwrap();
    let Value::Tuple(elements) = &result else {
        panic!("expected Value::Tuple, got {result:?}");
    };
    assert_eq!(elements.len().get(), 2);
}

#[test]
fn tuple_length_mismatch() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::new(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let tuple_type = types.tuple([types.integer(), types.string()]);
    let array = [serde_json::Value::Number(1.into())];

    let result = decoder.decode(tuple_type, JsonValueRef::Array(&array));
    assert!(matches!(
        result,
        Err(DecodeError::TupleLengthMismatch { .. })
    ));
}

#[test]
fn union_first_variant_matches() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::new(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let union_type = types.union([types.integer(), types.string()]);
    let number = serde_json::Number::from(42);

    let result = decoder
        .decode(union_type, JsonValueRef::Number(&number))
        .unwrap();
    assert_eq!(result, Value::Integer(value::Int::from(42_i128)));
}

#[test]
fn union_second_variant_matches() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::new(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let union_type = types.union([types.integer(), types.string()]);

    let result = decoder
        .decode(union_type, JsonValueRef::String("hello"))
        .unwrap();
    assert_eq!(result, str_value("hello"));
}

#[test]
fn union_no_variant_matches() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::new(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let union_type = types.union([types.integer(), types.string()]);

    let result = decoder.decode(union_type, JsonValueRef::Bool(true));
    assert!(matches!(result, Err(DecodeError::NoMatchingVariant { .. })));
}

#[test]
fn opaque_wraps_inner() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::new(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let opaque_type = types.opaque(sym::path::Entity, types.string());

    let result = decoder
        .decode(opaque_type, JsonValueRef::String("inner"))
        .unwrap();
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
    let interner = Interner::new(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let list_type = types.list(types.integer());
    let array = [
        serde_json::Value::Number(1.into()),
        serde_json::Value::Number(2.into()),
    ];

    let result = decoder
        .decode(list_type, JsonValueRef::Array(&array))
        .unwrap();
    let Value::List(list) = &result else {
        panic!("expected Value::List, got {result:?}");
    };
    assert_eq!(list.len(), 2);
}

#[test]
fn dict_intrinsic() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::new(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let dict_type = types.dict(types.string(), types.integer());

    let mut object = serde_json::Map::new();
    object.insert("x".to_owned(), serde_json::Value::Number(1.into()));
    object.insert("y".to_owned(), serde_json::Value::Number(2.into()));

    let result = decoder
        .decode(dict_type, JsonValueRef::Object(&object))
        .unwrap();
    let Value::Dict(dict) = &result else {
        panic!("expected Value::Dict, got {result:?}");
    };
    assert_eq!(dict.len(), 2);
}

#[test]
fn intersection_type_error() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::new(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let intersection_type = types.intersection([types.integer(), types.string()]);

    let result = decoder.decode(intersection_type, JsonValueRef::Null);
    assert!(matches!(result, Err(DecodeError::IntersectionType { .. })));
}

#[test]
fn closure_type_error() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::new(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let closure_type = types.closure([] as [TypeId; 0], types.integer());

    let result = decoder.decode(closure_type, JsonValueRef::Null);
    assert!(matches!(result, Err(DecodeError::ClosureType { .. })));
}

#[test]
fn never_type_error() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::new(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let result = decoder.decode(types.never(), JsonValueRef::Null);
    assert!(matches!(result, Err(DecodeError::NeverType { .. })));
}

#[test]
fn unknown_type_integer_fallback() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::new(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let number = serde_json::Number::from(42);
    let result = decoder
        .decode(types.unknown(), JsonValueRef::Number(&number))
        .unwrap();
    assert_eq!(result, Value::Integer(value::Int::from(42_i128)));
}

#[test]
fn unknown_type_float_fallback() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::new(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let number = serde_json::Number::from_f64(3.14).unwrap();
    let result = decoder
        .decode(types.unknown(), JsonValueRef::Number(&number))
        .unwrap();
    assert_eq!(result, Value::Number(value::Num::from(3.14)));
}

#[test]
fn unknown_type_array_becomes_list() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::new(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let array = [serde_json::Value::Number(1.into())];
    let result = decoder
        .decode(types.unknown(), JsonValueRef::Array(&array))
        .unwrap();
    let Value::List(list) = &result else {
        panic!("expected Value::List, got {result:?}");
    };
    assert_eq!(list.len(), 1);
}

#[test]
fn unknown_type_non_url_object_becomes_dict() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::new(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let mut object = serde_json::Map::new();
    object.insert("key".to_owned(), serde_json::Value::Number(1.into()));

    let result = decoder
        .decode(types.unknown(), JsonValueRef::Object(&object))
        .unwrap();
    let Value::Dict(_) = &result else {
        panic!("expected Value::Dict, got {result:?}");
    };
}

#[test]
fn unknown_type_url_object_becomes_struct() {
    let heap = Heap::new();
    let env = Environment::new(&heap);
    let interner = Interner::new(&heap);
    let types = TypeBuilder::synthetic(&env);
    let decoder = decoder(&env, &interner);

    let mut object = serde_json::Map::new();
    object.insert(
        "https://example.com/types/property-type/name/".to_owned(),
        serde_json::Value::String("Alice".to_owned()),
    );

    let result = decoder
        .decode(types.unknown(), JsonValueRef::Object(&object))
        .unwrap();
    let Value::Struct(fields) = &result else {
        panic!("expected Value::Struct, got {result:?}");
    };
    assert_eq!(fields.len(), 1);
}
