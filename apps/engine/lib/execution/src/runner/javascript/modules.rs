use std::{cell::RefCell, collections::HashMap, rc::Rc};

use super::{
    error::JavaScriptResult,
    read_file,
    utils::{exception_as_error, new_js_string},
};
use crate::runner::JavaScriptError;

/// Caches modules to avoid evaluating them twice which is against the [JavaScript
/// Specifications].
///
/// > Each time this operation is called with a specific `referencingScriptOrModule`, `specifier`
/// > pair as arguments it must return the same Module Record instance if it completes normally.
///
/// [JavaScript Specifications](https://tc39.es/ecma262/#sec-hostresolveimportedmodule)
pub(in crate::runner::javascript) struct ModuleMap {
    modules_by_path: HashMap<String, v8::Global<v8::Module>>,
}

impl ModuleMap {
    pub(in crate::runner::javascript) fn new() -> Self {
        Self {
            modules_by_path: HashMap::new(),
        }
    }
}

pub(in crate::runner::javascript) fn import_module<'s>(
    scope: &mut v8::HandleScope<'s>,
    path: &str,
) -> JavaScriptResult<v8::Local<'s, v8::Module>> {
    let module_map = scope
        .get_slot::<Rc<RefCell<ModuleMap>>>()
        .expect("ModuleMap is not present in isolate slots")
        .clone();

    if let Some(module) = module_map.borrow().modules_by_path.get(path) {
        return Ok(v8::Local::new(scope, module));
    }

    let source_code = read_file(path).map_err(|err| {
        JavaScriptError::AccessJavascriptImport(path.to_string(), err.to_string())
    })?;

    let js_source_code = new_js_string(scope, &source_code);
    let js_path = new_js_string(scope, path);
    let source_map_url = v8::undefined(scope);
    let source = v8::script_compiler::Source::new(
        js_source_code,
        Some(&v8::ScriptOrigin::new(
            scope,
            js_path.into(),
            0,
            0,
            false,
            // Unique identifier for scripts, source: https://chromedevtools.github.io/devtools-protocol/v8/Runtime/#type-ScriptId
            0,
            source_map_url.into(),
            false,
            false,
            true,
        )),
    );
    let mut try_catch_scope = v8::TryCatch::new(scope);
    let module = v8::script_compiler::compile_module(&mut try_catch_scope, source)
        .ok_or_else(|| exception_as_error(&mut try_catch_scope))
        .map_err(|err| JavaScriptError::Eval(path.to_string(), format!("Compile error: {err}")))?;

    module
        .instantiate_module(&mut try_catch_scope, module_resolve_callback)
        .ok_or_else(|| exception_as_error(&mut try_catch_scope))
        .map_err(|err| {
            JavaScriptError::PackageImport(
                path.to_string(),
                format!("Could not instantiate code for package: {err}"),
            )
        })?;

    if module.get_status() != v8::ModuleStatus::Instantiated {
        return Err(JavaScriptError::PackageImport(
            path.to_string(),
            "Could not instantiate code for package".to_string(),
        ));
    }

    module
        .evaluate(&mut try_catch_scope)
        .ok_or_else(|| exception_as_error(&mut try_catch_scope))
        .map_err(|err| {
            JavaScriptError::PackageImport(
                path.to_string(),
                format!("Could not evaluate code for package: {err}"),
            )
        })?;

    // `v8::Module::evaluate` can return `Some` even though the evaluation didn't
    // succeed
    if module.get_status() != v8::ModuleStatus::Evaluated {
        let exception = module.get_exception();
        let exception_string = exception
            .to_string(&mut try_catch_scope)
            .unwrap()
            .to_rust_string_lossy(&mut try_catch_scope);

        return Err(JavaScriptError::PackageImport(
            path.to_string(),
            format!("Could not evaluate code for package: {exception_string}"),
        ));
    }

    module_map.borrow_mut().modules_by_path.insert(
        path.to_string(),
        v8::Global::new(&mut try_catch_scope, module),
    );

    Ok(module)
}

/// Callback called for each `import ...` in JS files. It reads the file, compiles the source
/// code, and evaluates it. Modules are only compiled and evaluated once.
// Simple example without any caching: https://gist.github.com/surusek/4c05e4dcac6b82d18a1a28e6742fc23e
// More elaborate example with caching and multiple types of imports: https://github.com/denoland/deno/blob/f7e7f548499eff8d2df0872d1340ddcdfa028c45/core/bindings.rs#L1344
fn module_resolve_callback<'s>(
    context: v8::Local<'s, v8::Context>,
    // path of the module trying to get imported
    specifier: v8::Local<'s, v8::String>,
    // Should be safe to ignore for now as an unsupported Javascript feature. https://v8.dev/features/import-assertions
    _import_assertions: v8::Local<'s, v8::FixedArray>,
    // Not used for now, a description can be found at https://github.com/denoland/rusty_v8/blob/25dd770570b77dfaa5a27a7dcee6fa660781640f/src/isolate.rs#L109
    _referrer: v8::Local<'s, v8::Module>,
) -> Option<v8::Local<'s, v8::Module>> {
    // SAFETY: we are in a callback
    let mut scope = unsafe { v8::CallbackScope::new(context) };
    let specifier = specifier.to_rust_string_lossy(&mut scope);

    match import_module(&mut scope, &specifier) {
        Ok(module) => Some(module),
        Err(err) => {
            tracing::error!("Couldn't import {specifier}, {err}.");

            None
        }
    }
}
