use super::{
    error::JavaScriptResult, eval_file, modules::import_module, utils::new_js_string, Function,
};
use crate::runner::JavaScriptError;

/// Embedded JS of runner itself (from hardcoded paths)
pub(in crate::runner::javascript) struct Embedded<'s> {
    pub(in crate::runner::javascript) start_experiment: Function<'s>,
    pub(in crate::runner::javascript) start_sim: Function<'s>,
    pub(in crate::runner::javascript) run_task: Function<'s>,
    pub(in crate::runner::javascript) ctx_batch_sync: Function<'s>,
    pub(in crate::runner::javascript) state_sync: Function<'s>,
    pub(in crate::runner::javascript) state_interim_sync: Function<'s>,
    pub(in crate::runner::javascript) state_snapshot_sync: Function<'s>,
}

impl<'s> Embedded<'s> {
    pub(in crate::runner::javascript) fn import_common_js_files(
        scope: &mut v8::HandleScope<'s>,
    ) -> JavaScriptResult<Self> {
        // `hash_stdlib` can't be imported as a module because it needs to be available globally for
        // behaviors.
        // TODO: stop evaluating the file and use proper import for behaviors. https://app.asana.com/0/1199548034582004/1202225025969133/f
        let hash_stdlib = eval_file(
            scope,
            "./lib/execution/src/runner/javascript/hash_stdlib.js",
        )?;
        let hash_stdlib_str = new_js_string(scope, "hash_stdlib");
        scope
            .get_current_context()
            .global(scope)
            .set(scope, hash_stdlib_str.into(), hash_stdlib);

        let runner = import_module(scope, "./lib/execution/src/runner/javascript/runner.js")?;

        // Importing a module doesn't return the items it exports. To access the items it exports we
        // can use `get_module_namespace`. An example of that can be found at https://github.com/v8/v8/blob/25e3225286d08a49812b9728810b4777041a7dd5/test/unittests/objects/modules-unittest.cc#L659
        let namespace = runner
            .get_module_namespace()
            .to_object(scope)
            .expect("Module is not instantiated");

        let [
            start_experiment,
            start_sim,
            run_task,
            ctx_batch_sync,
            state_sync,
            state_interim_sync,
            state_snapshot_sync,
        ]: [Function<'_>; 7] = [
            "start_experiment",
            "start_sim",
            "run_task",
            "ctx_batch_sync",
            "state_sync",
            "state_interim_sync",
            "state_snapshot_sync",
        ]
        .into_iter()
        .map(|fn_name| {
            let js_fn_name = new_js_string(scope, fn_name);
            namespace
                .get(scope, js_fn_name.into())
                .ok_or_else(|| {
                    JavaScriptError::V8(format!("Could not get package function {fn_name}"))
                })?
                .try_into()
                .map_err(|err| {
                    JavaScriptError::V8(format!(
                        "Could not convert value {fn_name} in runner.js to a function: {err}"
                    ))
                })
        })
        .collect::<JavaScriptResult<Vec<_>>>()?
        .try_into()
        .unwrap();

        Ok(Embedded {
            start_experiment,
            start_sim,
            run_task,
            ctx_batch_sync,
            state_sync,
            state_interim_sync,
            state_snapshot_sync,
        })
    }
}
