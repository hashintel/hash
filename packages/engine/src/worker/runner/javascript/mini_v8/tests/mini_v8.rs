use std::{cell::RefCell, rc::Rc, string::String as StdString};

use super::super::*;

#[test]
fn eval_origin() {
    let mv8 = MiniV8::new();
    let result: StdString = mv8
        .eval(Script {
            source: "try { MISSING_VAR } catch (e) { e.stack }".to_owned(),
            origin: Some(ScriptOrigin {
                name: "eval_origin".to_owned(),
                line_offset: 123,
                column_offset: 456,
            }),
        })
        .unwrap();
    let result = result.split_whitespace().collect::<Vec<_>>().join(" ");
    assert_eq!(
        "ReferenceError: MISSING_VAR is not defined at eval_origin:124:463",
        result
    );
}

#[test]
fn eval_wasm() {
    let mv8 = MiniV8::new();
    let result = mv8.eval::<_, Value<'_>>(
        r#"
        let bytes = new Uint8Array([
            0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x07, 0x01, 0x60, 0x02, 0x7f,
            0x7f, 0x01, 0x7f, 0x03, 0x02, 0x01, 0x00, 0x07, 0x07, 0x01, 0x03, 0x61, 0x64, 0x64,
            0x00, 0x00, 0x0a, 0x09, 0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b
        ]);

        let module = new WebAssembly.Module(bytes);
        let instance = new WebAssembly.Instance(module);
        instance.exports.add(3, 4)
    "#,
    );

    match result {
        Ok(Value::Number(n)) if n == 7.0 => {}
        _ => panic!("unexpected result: {:?}", result),
    }
}

#[test]
#[should_panic(expected = "`Value` passed from one `MiniV8` instance to another")]
fn value_cross_contamination() {
    let mv8_1 = MiniV8::new();
    let str_1 = mv8_1.create_string("123");
    let mv8_2 = MiniV8::new();
    let _str_2 = mv8_2.create_string("456");
    let _ = mv8_2.coerce_number(Value::String(str_1));
}

#[test]
fn user_data_drop() {
    let mut mv8 = MiniV8::new();
    let (count, data) = make_test_user_data();
    mv8.set_user_data("data", data);
    drop(mv8);
    assert_eq!(*count.borrow(), 1000);
}

#[test]
fn user_data_get() {
    let mut mv8 = MiniV8::new();
    let (_, data) = make_test_user_data();
    mv8.set_user_data("data", data);
    assert!(mv8.get_user_data::<TestUserData>("no-exist").is_none());
    assert!(mv8.get_user_data::<usize>("data").is_none());

    {
        let data = mv8.get_user_data::<TestUserData>("data").unwrap();
        assert_eq!(data.get(), 0);
        data.increase();
        assert_eq!(data.get(), 1);
    }
}

#[test]
fn user_data_remove() {
    let mut mv8 = MiniV8::new();
    let (count, data) = make_test_user_data();
    mv8.set_user_data("data", data);
    assert_eq!(*count.borrow(), 0);
    let data = mv8.remove_user_data("data").unwrap();
    assert_eq!(*count.borrow(), 0);
    data.downcast_ref::<TestUserData>().unwrap().increase();
    assert_eq!(*count.borrow(), 1);
    drop(data);
    assert_eq!(*count.borrow(), 1000);
}

struct TestUserData {
    count: Rc<RefCell<usize>>,
}

impl TestUserData {
    fn increase(&self) {
        *self.count.borrow_mut() += 1;
    }

    fn get(&self) -> usize {
        *self.count.borrow()
    }
}

impl Drop for TestUserData {
    fn drop(&mut self) {
        *self.count.borrow_mut() = 1000;
    }
}

fn make_test_user_data() -> (Rc<RefCell<usize>>, TestUserData) {
    let count = Rc::new(RefCell::new(0));
    (count.clone(), TestUserData { count })
}

#[test]
fn coerce_boolean() {
    let mv8 = MiniV8::new();
    assert!(!mv8.coerce_boolean(Value::Undefined));
    assert!(!mv8.coerce_boolean(Value::Null));
    assert!(!mv8.coerce_boolean(Value::Number(0.0)));
    assert!(mv8.coerce_boolean(Value::Number(1.0)));
    assert!(!mv8.coerce_boolean(Value::String(mv8.create_string(""))));
    assert!(mv8.coerce_boolean(Value::String(mv8.create_string("a"))));
    assert!(mv8.coerce_boolean(Value::Object(mv8.create_object())));
}

#[test]
fn coerce_number() {
    let mv8 = MiniV8::new();
    assert!(mv8.coerce_number(Value::Undefined).unwrap().is_nan());
    assert_eq!(0.0, mv8.coerce_number(Value::Null).unwrap());
    assert_eq!(0.0, mv8.coerce_number(Value::Number(0.0)).unwrap());
    assert_eq!(1.0, mv8.coerce_number(Value::Number(1.0)).unwrap());
    assert_eq!(
        0.0,
        mv8.coerce_number(Value::String(mv8.create_string("")))
            .unwrap()
    );
    assert!(
        mv8.coerce_number(Value::String(mv8.create_string("a")))
            .unwrap()
            .is_nan()
    );
    assert!(
        mv8.coerce_number(Value::Object(mv8.create_object()))
            .unwrap()
            .is_nan()
    );
}

#[test]
fn coerce_string() {
    fn assert_string_eq(mv8: &MiniV8, value: Value<'_>, expected: &str) {
        assert_eq!(expected, mv8.coerce_string(value).unwrap().to_string());
    }

    let mv8 = MiniV8::new();
    assert_string_eq(&mv8, Value::Undefined, "undefined");
    assert_string_eq(&mv8, Value::Null, "null");
    assert_string_eq(&mv8, Value::Number(123.0), "123");
    assert_string_eq(&mv8, Value::String(mv8.create_string("abc")), "abc");
    assert_string_eq(&mv8, Value::Object(mv8.create_object()), "[object Object]");
}
