use std::string::String as StdString;

use super::super::*;

#[test]
fn set_get() {
    let mv8 = MiniV8::new();

    let object = mv8.create_object();
    object.set("a", 123).unwrap();
    object.set(123, "a").unwrap();
    let parent = mv8.create_object();
    parent.set("obj", object).unwrap();
    let object: Object<'_> = parent.get("obj").unwrap();
    assert_eq!(object.get::<_, i8>("a").unwrap(), 123);
    assert_eq!(object.get::<_, StdString>("a").unwrap(), "123");
    assert_eq!(object.get::<_, StdString>("123").unwrap(), "a");
    assert_eq!(object.get::<_, StdString>(123).unwrap(), "a");
}

#[test]
fn remove() {
    let mv8 = MiniV8::new();
    let globals = mv8.global();
    assert!(globals.has("Object").unwrap());
    globals.remove("Object").unwrap();
    assert!(!globals.has("Object").unwrap());
    // Removing keys that don't exist does nothing:
    globals.remove("Object").unwrap();
    assert!(!globals.has("Object").unwrap());
}

#[test]
fn has() {
    let mv8 = MiniV8::new();
    let globals = mv8.global();
    assert!(globals.has("Array").unwrap());
    assert!(!globals.has("~NOT-EXIST~").unwrap());
}

#[test]
fn keys() {
    let mv8 = MiniV8::new();
    let object = mv8.create_object();
    object.set("c", 3).unwrap();
    object.set("b", 2).unwrap();
    object.set("a", 1).unwrap();
    let keys: Result<'_, Vec<StdString>> = object.keys(true).unwrap().elements().collect();
    assert_eq!(keys.unwrap(), vec![
        "c".to_string(),
        "b".to_string(),
        "a".to_string()
    ])
}

#[test]
fn properties() {
    let mv8 = MiniV8::new();

    let object = mv8.create_object();
    object.set("a", 123).unwrap();
    object.set(4, Value::Undefined).unwrap();
    object.set(123, "456").unwrap();

    let list = object
        .properties(false)
        .unwrap()
        .map(|property| {
            let result: (StdString, usize) = property.unwrap();
            result
        })
        .collect::<Vec<_>>();

    assert_eq!(list, vec![
        ("4".to_string(), 0),
        ("123".to_string(), 456),
        ("a".to_string(), 123)
    ]);
}
