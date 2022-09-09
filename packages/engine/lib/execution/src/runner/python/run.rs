use std::sync::Arc;

use pyo3::{PyResult, Python};
use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender};
use tracing::{Instrument, Span};

use super::error::PythonError;
use crate::{
    package::simulation::SimulationId,
    runner::{
        comms::{ExperimentInitRunnerMsg, InboundToRunnerMsgPayload, OutboundFromRunnerMsg},
        python::pyhandle::{PyHandle, SavedPyHandle},
    },
};

pub(crate) fn run_experiment(
    init_msg: Arc<ExperimentInitRunnerMsg>,
    mut inbound_receiver: UnboundedReceiver<(
        Span,
        Option<SimulationId>,
        InboundToRunnerMsgPayload,
    )>,
    outbound_sender: UnboundedSender<OutboundFromRunnerMsg>,
) -> crate::Result<()> {
    // TODO: propagate error
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|err| PythonError::IO("Local tokio runtime".into(), err))
        .unwrap();

    tokio::pin! {
        let impl_future = async {
            // this is an `Option` to ensure that we don't violate Rust's
            // borrowing rules: in every iteration of the loop we need to
            // move the value into the loop (so that we can call
            // `SavedPyHandle::acquire_gil`), but this of course means that
            // subsequent iterations of the loop will be unable to use this
            // value. What we do is call `Option::take` on the enumeration when
            // we need owned access to the `SavedPyHandle`, perform the
            // necessary operations which can only be executed while we have the
            // global interpreter lock, and then "return" the handle to its
            // place by setting `handle = locally_taken_handle;`
            let (mut handle, status): (Option<SavedPyHandle>, _) = Python::with_gil(|py| {
                let (handle, status) = PyHandle::new(py, init_msg.as_ref())?;
                PyResult::Ok((Some(handle.release_gil()), status))
            }).map_err(|py| {
                PythonError::from(py)
            })?;

            if !status.user_warnings.is_empty() {
                tracing::warn!("received the following warnings during experiment initialization: {:?}", status.user_warnings);
            }
            if !status.user_errors.is_empty() {
                tracing::error!("received the following errors during experiment initialization: {:?}", status.user_errors);
            }

            loop {
                match inbound_receiver.recv().await {
                    Some((span, sim_id, msg)) => {
                        let _span = span.entered();

                        let local_handle = handle.take().unwrap();
                        let (local_handle, keep_running) = Python::with_gil(|py| {
                            let mut handle = local_handle.acquire_gil(py);
                            let keep_running = handle.handle_msg(
                                sim_id,
                                msg,
                                &outbound_sender,
                            ).map_err(|e| {
                                // this is a bit messy, but is just to print an
                                // error in case we came across one when running
                                // the engine code (user errors are handled
                                // seperately)
                                if let crate::Error::Python(PythonError::PyErr(ref e)) = e {
                                    e.print(py);
                                };
                                e
                            })?;
                            Ok::<_, crate::Error>((handle.release_gil(), keep_running))
                        })?;
                        handle = Some(local_handle);

                        if !keep_running {
                            tracing::debug!("Python Runner has finished execution, stopping");
                            break;
                        }

                    },
                    None => {
                        tracing::trace!("Inbound sender to Python exited");
                        return Err(PythonError::InboundReceive.into());
                    },
                }
            }

            Ok::<_, crate::Error>(())
        }.in_current_span();
    }

    let local = tokio::task::LocalSet::new();
    local.block_on(&runtime, impl_future)?;

    Ok(())
}
