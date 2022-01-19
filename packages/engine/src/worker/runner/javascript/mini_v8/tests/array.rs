use std::string::String as StdString;

use super::super::*;

#[test]
#[tracing::instrument(skip_all)]
fn set_get() {
    let mv8 = MiniV8::new();

    let array = mv8.create_array();
    array.set(0, 123).unwrap();
    array.set(2, 456).unwrap();
    assert_eq!(array.get::<StdString>(0).unwrap(), "123");
    assert!(array.get::<Value<'_>>(1).unwrap().is_undefined());
    assert_eq!(array.get::<StdString>(2).unwrap(), "456");
    assert!(array.get::<Value<'_>>(3).unwrap().is_undefined());
}

#[test]
#[tracing::instrument(skip_all)]
fn len() {
    let mv8 = MiniV8::new();

    let array = mv8.create_array();
    assert_eq!(array.len(), 0);
    array.set(0, 123).unwrap();
    assert_eq!(array.len(), 1);
    array.set(2, 456).unwrap();
    assert_eq!(array.len(), 3);
}

#[test]
#[tracing::instrument(skip_all)]
fn push() {
    let mv8 = MiniV8::new();

    let array = mv8.create_array();
    array.push(0).unwrap();
    array.push(1).unwrap();
    array.set(3, 3).unwrap();
    array.push(4).unwrap();
    assert_eq!(array.get::<usize>(0).unwrap(), 0);
    assert_eq!(array.get::<usize>(1).unwrap(), 1);
    assert!(array.get::<Value<'_>>(2).unwrap().is_undefined());
    assert_eq!(array.get::<usize>(3).unwrap(), 3);
    assert_eq!(array.get::<usize>(4).unwrap(), 4);
    assert_eq!(array.len(), 5);
}

#[test]
#[tracing::instrument(skip_all)]
fn elements() {
    let mv8 = MiniV8::new();

    let array = mv8.create_array();
    array.push(0).unwrap();
    array.push(1).unwrap();
    array.set(3, 3).unwrap();
    array.push(4).unwrap();

    let list: Result<'_, Vec<usize>> = array.elements().collect();
    assert_eq!(list.unwrap(), vec![0, 1, 0, 3, 4]);
}
