use std::{cmp, fmt, mem};

use super::{
    desc_to_result, mv8_function_call, mv8_function_call_new, mv8_function_create, value_to_desc,
    FromValue, MiniV8, Object, Ref, Result, ToValue, ToValues, Value, ValueDesc, Values,
};

/// Reference to a JavaScript function.
#[derive(Clone)]
pub struct Function<'mv8>(pub(super) Ref<'mv8>);

impl<'mv8> Function<'mv8> {
    /// Consumes the function and downgrades it to a JavaScript object. This is inexpensive, since
    /// an array *is* an object.
    pub fn into_object(self) -> Object<'mv8> {
        Object(self.0)
    }

    /// Calls the function with the given arguments, with `this` set to `undefined`.
    pub fn call<A, R>(&self, args: A) -> Result<'mv8, R>
    where
        A: ToValues<'mv8>,
        R: FromValue<'mv8>,
    {
        self.call_method(Value::Undefined, args)
    }

    /// Calls the function with the given `this` and arguments.
    pub fn call_method<T, A, R>(&self, this: T, args: A) -> Result<'mv8, R>
    where
        T: ToValue<'mv8>,
        A: ToValues<'mv8>,
        R: FromValue<'mv8>,
    {
        let mv8 = self.0.mv8;
        let this_desc = value_to_desc(mv8, &this.to_value(mv8)?);
        let (arg_descs, len) = args_to_descs(args, mv8)?;

        let result = unsafe {
            mv8_function_call(
                mv8.interface,
                self.0.value_ptr,
                this_desc,
                arg_descs.as_ptr(),
                len,
            )
        };

        // Important! `mv8_function_call` takes ownership of the arguments' value pointers. Prevents
        // a double-free:
        manually_drop_arg_descs(arg_descs);

        desc_to_result(mv8, result)?.into(mv8)
    }

    /// Calls the function as a constructor function with the given arguments.
    pub fn call_new<A, R>(&self, args: A) -> Result<'mv8, R>
    where
        A: ToValues<'mv8>,
        R: FromValue<'mv8>,
    {
        let mv8 = self.0.mv8;
        let (arg_descs, len) = args_to_descs(args, mv8)?;

        let result = unsafe {
            mv8_function_call_new(mv8.interface, self.0.value_ptr, arg_descs.as_ptr(), len)
        };

        // Important! `mv8_function_call_new` takes ownership of the arguments' value pointers.
        // Prevents a double-free:
        manually_drop_arg_descs(arg_descs);

        desc_to_result(mv8, result)?.into(mv8)
    }

    pub(super) fn new(
        mv8: &'mv8 MiniV8,
        func: Callback<'_, 'static>,
        func_size: usize,
    ) -> Function<'mv8> {
        Function(Ref::new(mv8, unsafe {
            mv8_function_create(
                mv8.interface,
                Box::into_raw(Box::new(func)) as _,
                func_size as u32,
            )
        }))
    }
}

#[inline]
fn args_to_descs<'mv8>(
    args: impl ToValues<'mv8>,
    mv8: &'mv8 MiniV8,
) -> Result<'mv8, (Vec<ValueDesc>, i32)> {
    let arg_descs: Vec<_> = args
        .to_values(mv8)?
        .iter()
        .map(|a| value_to_desc(mv8, a))
        .collect();
    let len = cmp::min(arg_descs.len(), i32::MAX as usize) as i32;
    Ok((arg_descs, len))
}

#[inline]
fn manually_drop_arg_descs(arg_descs: Vec<ValueDesc>) {
    // Ownership of the arguments' value pointers was taken by C++. They've already been properly
    // dropped:
    for desc in arg_descs.into_iter() {
        // TODO: Make sure we must not forget this value
        mem::forget(desc);
    }
}

impl fmt::Debug for Function<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "<function>")
    }
}

/// A bundle of information about an invocation of a function that has been embedded from Rust into
/// JavaScript.
pub struct Invocation<'mv8> {
    /// The `MiniV8` within which the function was called.
    pub mv8: &'mv8 MiniV8,
    /// The value of the function invocation's `this` binding.
    pub this: Value<'mv8>,
    /// The list of arguments with which the function was called.
    pub args: Values<'mv8>,
}

pub(super) type Callback<'mv8, 'a> =
    Box<dyn Fn(&'mv8 MiniV8, Value<'mv8>, Values<'mv8>) -> Result<'mv8, Value<'mv8>> + 'a>;
