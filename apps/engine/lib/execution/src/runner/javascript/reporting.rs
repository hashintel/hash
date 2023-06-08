use super::{utils::new_js_string, Array, Object, Value};
use crate::runner::{
    comms::{PackageError, UserError, UserWarning},
    JavaScriptError,
};

pub(in crate::runner::javascript) fn array_to_user_errors<'s>(
    scope: &mut v8::HandleScope<'s>,
    array: Value<'s>,
) -> Vec<UserError> {
    let fallback = format!("Unparsed: {array:?}");

    if array.is_array() {
        let array: Array<'s> = array
            .try_into()
            .expect("UserJavaScriptErrors array conversion failed");
        let errors = (0..array.length())
            .map(|i| {
                let element = array.get_index(scope, i).ok_or_else(|| {
                    JavaScriptError::V8(format!(
                        "Could not get error at index {i} in the UserJavaScriptErrors array"
                    ))
                });
                element.map(|err| UserError(format!("{err:?}")))
            })
            .collect();

        if let Ok(errors) = errors {
            return errors;
        } // else unparsed
    } // else unparsed

    vec![UserError(fallback)]
}

fn array_to_user_warnings<'s>(
    scope: &mut v8::HandleScope<'s>,
    array: Value<'s>,
) -> Vec<UserWarning> {
    // TODO: Extract optional line numbers
    let fallback = format!("Unparsed: {array:?}");

    if array.is_array() {
        let array: Array<'s> = array
            .try_into()
            .expect("UserWarnings array conversion failed");
        let warnings = (0..array.length())
            .map(|i| {
                let element = array.get_index(scope, i).ok_or_else(|| {
                    JavaScriptError::V8(format!(
                        "Could not get warning at index {i} in the UserWarnings array"
                    ))
                });
                element.map(|err| UserWarning {
                    message: format!("{err:?}"),
                    details: None,
                })
            })
            .collect();

        if let Ok(warnings) = warnings {
            return warnings;
        } // else unparsed
    } // else unparsed

    vec![UserWarning {
        message: fallback,
        details: None,
    }]
}

pub(in crate::runner::javascript) fn get_js_error<'s>(
    scope: &mut v8::HandleScope<'s>,
    return_val: Object<'s>,
) -> Option<JavaScriptError> {
    let user_errors = new_js_string(scope, "user_errors");

    if let Some(errors) = return_val.get(scope, user_errors.into()) {
        if !errors.is_null_or_undefined() {
            let errors = array_to_user_errors(scope, errors);
            if !errors.is_empty() {
                return Some(JavaScriptError::User(errors));
            }
        }
    }

    let pkg_error = new_js_string(scope, "pkg_error");

    let runner_error = new_js_string(scope, "runner_error");

    if let Some(err) = return_val.get(scope, pkg_error.into()) {
        // Even though rusty_v8 returns an Option, if the object does not have the property the
        // result will be `Some(undefined)` rather than `None`
        if !err.is_undefined() {
            let err: v8::Local<'s, v8::String> = if let Some(err) = err.to_string(scope) {
                err
            } else {
                return Some(JavaScriptError::V8(
                    "Could not convert package error to String".to_string(),
                ));
            };

            // TODO: Don't silently ignore non-string, non-null-or-undefined errors
            //       (try to convert error value to JSON string and return as error?).
            return Some(JavaScriptError::Package(PackageError(
                err.to_rust_string_lossy(scope),
            )));
        }
    }

    if let Some(err) = return_val.get(scope, runner_error.into()) {
        // Even though rusty_v8 returns an Option, if the object does not have the property the
        // result will be `Some(undefined)` rather than `None`
        if !err.is_undefined() {
            let err: v8::Local<'s, v8::String> = if let Some(err) = err.to_string(scope) {
                err
            } else {
                return Some(JavaScriptError::V8(
                    "Could not convert runner error to String".to_string(),
                ));
            };

            // TODO: Don't ignore non-string, non-null-or-undefined errors
            return Some(JavaScriptError::Embedded(err.to_rust_string_lossy(scope)));
        }
    }

    None
}

pub(in crate::runner::javascript) fn get_user_warnings<'s>(
    scope: &mut v8::HandleScope<'s>,
    return_val: Object<'s>,
) -> Option<Vec<UserWarning>> {
    let user_warnings = new_js_string(scope, "user_warnings");

    if let Some(warnings) = return_val.get(scope, user_warnings.into()) {
        if warnings != v8::undefined(scope) && warnings != v8::null(scope) {
            let warnings = array_to_user_warnings(scope, warnings);
            if !warnings.is_empty() {
                return Some(warnings);
            }
        }
    }

    None
}

pub(in crate::runner::javascript) fn get_print<'s>(
    scope: &mut v8::HandleScope<'s>,
    return_val: Object<'s>,
) -> Option<Vec<String>> {
    let print = new_js_string(scope, "print");

    if let Some(printed_val) = return_val.get(scope, print.into()) {
        if let Ok(printed_val) = printed_val.try_into() {
            let printed_val: v8::Local<'s, v8::String> = printed_val;
            let printed_val = printed_val.to_rust_string_lossy(scope);
            if !printed_val.is_empty() {
                Some(printed_val.split('\n').map(|s| s.to_string()).collect())
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    }
}
