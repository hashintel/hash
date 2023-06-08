use std::{cell::RefCell, rc::Rc, sync::Arc};

use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender};
use tracing::{Instrument, Span};

use crate::{
    package::simulation::SimulationId,
    runner::{
        comms::{ExperimentInitRunnerMsg, InboundToRunnerMsgPayload, OutboundFromRunnerMsg},
        javascript::{
            modules::ModuleMap, near_heap_limit_callback, thread_local_runner::ThreadLocalRunner,
            MB,
        },
        JavaScriptError,
    },
};

pub(in crate::runner::javascript) fn run_experiment(
    init_msg: Arc<ExperimentInitRunnerMsg>,
    mut inbound_receiver: UnboundedReceiver<(
        Span,
        Option<SimulationId>,
        InboundToRunnerMsgPayload,
    )>,
    outbound_sender: UnboundedSender<OutboundFromRunnerMsg>,
) -> crate::Result<()> {
    // Single threaded runtime only
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|err| JavaScriptError::IO("Local tokio runtime".into(), err))?;

    tokio::pin! {
        let impl_future = async {
            let platform = v8::new_default_platform(0, false).make_shared();
            v8::V8::initialize_platform(platform);
            v8::V8::initialize();

            // 0 makes V8 use its default value
            let js_runner_initial_heap_constraint = init_msg.runner_config.js_runner_initial_heap_constraint.unwrap_or(0);
            // 0 makes V8 use its default value
            let js_runner_max_heap_size = init_msg.runner_config.js_runner_max_heap_size.unwrap_or(0);

            let create_params = v8::Isolate::create_params().heap_limits(
                js_runner_initial_heap_constraint * MB,
                js_runner_max_heap_size * MB,
            );

            let mut isolate = v8::Isolate::new(create_params);

            isolate.add_near_heap_limit_callback(
                near_heap_limit_callback,
                // The callback does not need additional data
                std::ptr::null_mut(),
            );

            let mut handle_scope = v8::HandleScope::new(&mut isolate);
            let context = v8::Context::new(&mut handle_scope);
            let mut context_scope = v8::ContextScope::new(&mut handle_scope, context);

            // We use an `Rc<RefCell>` here because `ContextScope` is borrowed as long as we access
            // this value and most call look like:
            // `scope.get_slot::<ModuleMap>().import_module(&mut scope)`
            // `scope` would be borrowed twice which is not possible. By using `Rc<RefCell>` we can
            // clone the `Rc` ending the first borrow.
            let module_map = Rc::new(RefCell::new(ModuleMap::new()));

            context_scope.set_slot(module_map);

            let mut thread_local_runner = ThreadLocalRunner::new(&mut context_scope, &init_msg)?;

            loop {
                match inbound_receiver.recv().await {
                    Some((span, sim_id, msg)) => {
                        let _span = span.entered();
                        // TODO: Send errors instead of immediately stopping?
                        let msg_str = msg.as_str();
                        tracing::debug!("JS runner got sim `{sim_id:?}` inbound {msg_str}");
                        let keep_running = thread_local_runner.handle_msg(
                            &mut context_scope,
                            sim_id,
                            msg,
                            &outbound_sender,
                        )?;
                        tracing::debug!("JS runner handled sim `{sim_id:?}` inbound {msg_str}");
                        if !keep_running {
                            tracing::debug!("JavaScript Runner has finished execution, stopping");
                            break;
                        }
                    }
                    None => {
                        tracing::error!("Inbound sender to JS exited");
                        return Err(JavaScriptError::InboundReceive.into());
                    }
                }
            }

            Ok(())
        }.in_current_span();
    };

    let local = tokio::task::LocalSet::new();
    local.block_on(&runtime, impl_future)
}
