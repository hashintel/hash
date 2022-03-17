use std::string::String as StdString;

use super::super::*;

#[test]
fn js_function() {
    let mv8 = MiniV8::new();
    let func: Value<'_> = mv8.eval("(function(y) { return this + y; })").unwrap();
    assert!(func.is_function());
    let func = if let Value::Function(f) = func {
        f
    } else {
        unreachable!();
    };
    let value: f64 = func.call_method(1, (2,)).unwrap();
    assert_eq!(3.0f64, value);
    let value: f64 = func.call((2,)).unwrap();
    assert!(value.is_nan());
}

#[test]
fn js_constructor() {
    let mv8 = MiniV8::new();
    let func: Function<'_> = mv8.eval("(function(x) { this.x = x; })").unwrap();
    let value: Object<'_> = func.call_new((10,)).unwrap();
    let n: i64 = value.get("x").unwrap();
    assert_eq!(10, n);
}

#[test]
fn rust_function() {
    fn add(inv: Invocation<'_>) -> Result<'_, usize> {
        let (a, b): (usize, usize) = inv.args.into(inv.mv8)?;
        return Ok(a + b);
    }

    let mv8 = MiniV8::new();
    let func = mv8.create_function(add);
    let value: f64 = func.call((1, 2)).unwrap();
    assert_eq!(3.0f64, value);

    mv8.global().set("add", func).unwrap();
    let value: f64 = mv8.eval("add(4, 5)").unwrap();
    assert_eq!(9.0f64, value);
}

#[test]
fn rust_function_error() {
    fn err(inv: Invocation<'_>) -> Result<'_, ()> {
        let _: (Function<'_>,) = inv.args.into(inv.mv8)?;
        Ok(())
    }

    let mv8 = MiniV8::new();
    let func = mv8.create_function(err);
    mv8.global().set("err", func).unwrap();
    let _: () = mv8
        .eval(
            r#"
        try {
            err(123);
        } catch (e) {
            if (e.name !== 'TypeError') {
                throw new Error('unexpected error');
            }
        }
    "#,
        )
        .unwrap();
}

#[test]
fn rust_closure() {
    let mv8 = MiniV8::new();
    let func = mv8.create_function(|inv| {
        let (a, b): (usize, usize) = inv.args.into(inv.mv8)?;
        Ok(a + b)
    });
    let value: f64 = func.call((1, 2)).unwrap();
    assert_eq!(3.0f64, value);
}

#[test]
fn double_drop_rust_function() {
    let mv8 = MiniV8::new();
    let func = mv8.create_function(|_| Ok(()));
    let _func_dup = func.clone();
    // The underlying boxed closure is only dropped once. (Otherwise a segfault or something might
    // occur. This admittedly isn't a very great test.)
}

#[test]
fn return_unit() {
    let mv8 = MiniV8::new();
    let func = mv8.create_function(|_| Ok(()));
    let _: () = func.call(()).unwrap();
    let _: () = func.call((123,)).unwrap();
    let number_cast: usize = func.call(()).unwrap();
    assert_eq!(number_cast, 0);
}

#[test]
fn rust_closure_mut_callback_error() {
    let mv8 = MiniV8::new();

    let mut v = Some(Box::new(123));
    let f = mv8.create_function_mut(move |inv| {
        let mv8 = inv.mv8;
        let (mutate,) = inv.args.into(mv8)?;
        if mutate {
            v = None;
        } else {
            // Produce a mutable reference:
            let r = v.as_mut().unwrap();
            // Whoops, this will recurse into the function and produce another mutable reference!
            mv8.global().get::<_, Function<'_>>("f")?.call((true,))?;
            println!("Should not get here, mutable aliasing has occurred!");
            println!("value at {:p}", r as *mut _);
            println!("value is {}", r);
        }

        Ok(())
    });

    mv8.global().set("f", f).unwrap();
    match mv8
        .global()
        .get::<_, Function<'_>>("f")
        .unwrap()
        .call::<_, ()>((false,))
    {
        Err(Error::Value(v)) => {
            let message: StdString = v.as_object().unwrap().get("message").unwrap();
            assert_eq!(message, "mutable callback called recursively".to_string());
        }
        other => panic!("incorrect result: {:?}", other),
    };
}

#[test]
fn number_this() {
    fn add(inv: Invocation<'_>) -> Result<'_, f64> {
        let this: f64 = inv.this.into(inv.mv8)?;
        let (acc,): (f64,) = inv.args.into(inv.mv8)?;
        return Ok(this + acc);
    }

    let mv8 = MiniV8::new();
    let func = mv8.create_function(add);

    let value: f64 = func.call_method(10, (20,)).unwrap();
    assert_eq!(30.0f64, value);
    let value: f64 = func.call((1,)).unwrap();
    assert!(value.is_nan());

    mv8.global().set("add", func).unwrap();
    let value: f64 = mv8.eval("add.call(12, 13)").unwrap();
    assert_eq!(25.0f64, value);
    let value: f64 = mv8.eval("add(5)").unwrap();
    assert!(value.is_nan());
}
