// Some notes on rusty_v8:
//
// - When calling JS functions the second argument is the "this" object, for free functions it's the
//   `Context` created at the very beginning. Since the argument needs to be a `Local<Value>` we
//   need to call `Context::global` and convert it `into` a `Local<Value>`.
//
// - `Local` is cheap to `Copy`.
//
// - Even though `rusty_v8` returns an `Option` on `Object::get`, if the object does not have the
//   property the result will be `Some(undefined)` rather than `None`.
//
// - Modules always evaluate to a `promise` which resolves to `undefined` without the "--harmony_top_level_await" flag, https://github.com/denoland/deno/issues/3696#issuecomment-578488613.
//   To access values inside a module use v8::Module::get_module_namespace.

mod conversion;
mod data_ffi;
pub(crate) mod error;

mod embedded;
mod modules;
mod reporting;
mod run;
mod runner;
mod task;
mod thread_local_runner;
mod utils;

use std::fs;

use arrow2::{
    datatypes::Schema,
    io::ipc::write::{default_ipc_fields, schema_to_bytes},
};
use memory::shared_memory::arrow_continuation;

pub(crate) use self::{
    error::{JavaScriptError, JavaScriptResult},
    runner::JavaScriptRunner,
};
use crate::{
    package::simulation::PackageType,
    runner::javascript::utils::{
        exception_as_error, import_and_get_module_namespace, new_js_string,
    },
};

type Object<'scope> = v8::Local<'scope, v8::Object>;
type Value<'scope> = v8::Local<'scope, v8::Value>;
type Function<'scope> = v8::Local<'scope, v8::Function>;
type Array<'scope> = v8::Local<'scope, v8::Array>;

/// The number of bytes there are in a megabyte (1024^2).
const MB: usize = 1_048_576;

struct JsPackage<'s> {
    fns: Array<'s>,
}

fn get_pkg_path(name: &str, pkg_type: PackageType) -> String {
    format!("./lib/execution/src/package/simulation/{pkg_type}/{name}/package.js")
}

/// TODO: DOC add docstrings on impl'd methods
impl<'s> JsPackage<'s> {
    fn import_package(
        scope: &mut v8::HandleScope<'s>,
        name: &str,
        pkg_type: PackageType,
    ) -> JavaScriptResult<Self> {
        let path = get_pkg_path(name, pkg_type);
        tracing::debug!("Importing package from path `{path}`");

        let namespace: Object<'_> = match import_and_get_module_namespace(scope, &path) {
            Ok(s) => s,
            Err(JavaScriptError::AccessJavascriptImport(_file_path, err)) => {
                tracing::debug!(
                    "Couldn't read package file. It might intentionally not exist: {err}"
                );
                // Packages don't have to use JS.
                let undefined = v8::undefined(scope).into();
                let fns = v8::Array::new_with_elements(scope, &[undefined; 3]);

                return Ok(JsPackage { fns });
            }
            Err(err) => return Err(err),
        };

        let fn_names = ["start_experiment", "start_sim", "run_task"];
        let fns = fn_names
            .into_iter()
            .map(|fn_name| {
                let mut try_catch_scope = v8::TryCatch::new(scope);

                let js_fn_name = new_js_string(&mut try_catch_scope, fn_name);
                // Get the function `Value` from the namespace
                let func_or_undefined: Value<'_> = namespace
                    .get(&mut try_catch_scope, js_fn_name.into())
                    .ok_or_else(|| exception_as_error(&mut try_catch_scope))
                    .map_err(|err| {
                        JavaScriptError::PackageImport(
                            path.clone(),
                            format!("Could not get function from package: {err}"),
                        )
                    })?;

                if !(func_or_undefined.is_function() || func_or_undefined.is_undefined()) {
                    return Err(JavaScriptError::PackageImport(
                        path.clone(),
                        format!("{fn_name} should be a function or undefined"),
                    ));
                }

                Ok(func_or_undefined)
            })
            .collect::<JavaScriptResult<Vec<_>>>()?;

        Ok(JsPackage {
            fns: v8::Array::new_with_elements(scope, &fns),
        })
    }
}

fn read_file(path: &str) -> JavaScriptResult<String> {
    fs::read_to_string(path).map_err(|err| JavaScriptError::IO(path.into(), err))
}

fn eval_file<'s>(scope: &mut v8::HandleScope<'s>, path: &str) -> JavaScriptResult<Value<'s>> {
    let source_code = read_file(path)?;
    let js_source_code = new_js_string(scope, &source_code);
    let mut try_catch_scope = v8::TryCatch::new(scope);
    let script = v8::Script::compile(&mut try_catch_scope, js_source_code, None)
        .ok_or_else(|| exception_as_error(&mut try_catch_scope))
        .map_err(|err| JavaScriptError::Eval(path.into(), format!("Compile error: {err}")))?;

    script
        .run(&mut try_catch_scope)
        .ok_or_else(|| exception_as_error(&mut try_catch_scope))
        .map_err(|err| JavaScriptError::Eval(path.into(), format!("Execution error: {err}")))
}

fn schema_to_stream_bytes(schema: &Schema) -> Vec<u8> {
    let content = schema_to_bytes(schema, &default_ipc_fields(&schema.fields));
    let mut stream_bytes = arrow_continuation(content.len());
    stream_bytes.extend_from_slice(&content);
    stream_bytes
}

// Returns the new max heap size.
extern "C" fn near_heap_limit_callback(
    // This pointer is null, don't do anything with it.
    _data: *mut std::ffi::c_void,
    current_heap_limit: usize,
    _initial_heap_limit: usize,
) -> usize {
    tracing::warn!(
        "A JavaScript runner almost reached its heap limit! Use the '--js-runner-max-heap-size' \
         CLI argument when starting the engine to raise the limit."
    );

    // We don't increase the max heap limit.
    // TODO: Maybe increase heap size
    //   see https://app.asana.com/0/1199548034582004/1202061695892185/f
    current_heap_limit
}
