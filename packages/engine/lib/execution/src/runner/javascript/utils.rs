use super::{error::JavaScriptResult, modules::import_module, Function, Object, Value};
use crate::runner::JavaScriptError;

/// Helper function to create a [v8::String]
pub(in crate::runner::javascript) fn new_js_string<'s>(
    scope: &mut v8::HandleScope<'s>,
    s: impl AsRef<str>,
) -> v8::Local<'s, v8::String> {
    let s = s.as_ref();
    v8::String::new(scope, s).unwrap_or_else(|| panic!("Could not create JS String: {s}"))
}

/// Returns the exception from a [`v8::TryCatch`] scope.
///
/// # Panics
///
/// Panics if the try catch scope didn't catch any exception.
pub(in crate::runner::javascript) fn exception_as_error<'s, 'p: 's, S>(
    try_catch_scope: &mut v8::TryCatch<'s, S>,
) -> JavaScriptError
where
    v8::TryCatch<'s, S>: AsMut<v8::HandleScope<'p, ()>>,
    v8::TryCatch<'s, S>: AsMut<v8::HandleScope<'p, v8::Context>>,
{
    let exception = try_catch_scope
        .exception()
        .expect("Expected try catch scope to have caught an exception");

    let exception_message = try_catch_scope.message().map(|exception_message| {
        exception_message
            .get(try_catch_scope.as_mut())
            .to_rust_string_lossy(try_catch_scope.as_mut())
    });

    let exception_string = exception
        .to_string(try_catch_scope.as_mut())
        .unwrap()
        .to_rust_string_lossy(try_catch_scope.as_mut());

    JavaScriptError::JavascriptException(exception_string, exception_message)
}

pub(in crate::runner::javascript) fn import_and_get_module_namespace<'s>(
    scope: &mut v8::HandleScope<'s>,
    path: &str,
) -> JavaScriptResult<Object<'s>> {
    let pkg = import_module(scope, path)?;

    Ok(pkg
        .get_module_namespace()
        .to_object(scope)
        .expect("Module is not instantiated"))
}

pub(in crate::runner::javascript) fn call_js_function<'s>(
    scope: &mut v8::HandleScope<'s>,
    func: Function<'s>,
    this: Value<'s>,
    args: &[Value<'s>],
) -> JavaScriptResult<Value<'s>> {
    let mut try_catch_scope = v8::TryCatch::new(scope);
    func.call(&mut try_catch_scope, this, args)
        .ok_or_else(|| exception_as_error(&mut try_catch_scope))
}
