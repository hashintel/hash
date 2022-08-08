//! Provides infrastructure to communicate with the `hash_engine` subprocess.

use std::{collections::HashMap, fmt::Display};

use error_stack::{bail, report, IntoReport, ResultExt};
use execution::package::experiment::ExperimentId;
use experiment_control::comms::OrchestratorMsg;
use simulation_control::EngineStatus;
use tokio::sync::{mpsc, mpsc::error::SendError, oneshot};

use crate::{OrchestratorError, Result};

type ResultSender = oneshot::Sender<Result<()>>;
type CloseReceiver = mpsc::UnboundedReceiver<ExperimentId>;
type CloseSender = mpsc::UnboundedSender<ExperimentId>;
type MsgSender = mpsc::UnboundedSender<EngineStatus>;
type MsgReceiver = mpsc::UnboundedReceiver<EngineStatus>;
type CtrlSender = mpsc::Sender<(Ctrl, ResultSender)>;
type CtrlReceiver = mpsc::Receiver<(Ctrl, ResultSender)>;

/// Control signal to be sent to the `hash_engine`-sub[process](crate::process).
enum Ctrl {
    /// Signal to register a new experiment
    Register {
        /// Identifier for the experiment to be registered
        id: ExperimentId,
        /// Sender for the engine to use to send [`EngineStatus`] messages
        /// back to the orchestrator
        msg_tx: MsgSender,
    },
    /// Signal to stop the experiment
    Stop, // TODO: UNUSED: Needs triage
}

/// A connection to receive [`EngineStatus`]es from an
/// `hash_engine`-sub[process](crate::process).
pub struct Handle {
    id: ExperimentId,
    msg_rx: MsgReceiver,
    close_tx: CloseSender,
}

impl Handle {
    /// Receive a message from the experiment run.
    ///
    /// # Panics
    ///
    /// - if the sender was dropped
    pub async fn recv(&mut self) -> EngineStatus {
        self.msg_rx
            .recv()
            .await
            .expect("Handle send side unexpectedly dropped")
    }
}

impl Drop for Handle {
    fn drop(&mut self) {
        // If send returns an error, it means the server has already been dropped in which case the
        // Handle is already cleaned up.
        let _ = self.close_tx.send(self.id);
    }
}

/// A connection to a [`Server`] to send control signals to.
#[derive(Clone)]
pub struct Handler {
    url: String,
    ctrl_tx: CtrlSender,
    close_tx: CloseSender,
}

impl Handler {
    /// Return the URL that the experiment server is listening on.
    pub fn url(&self) -> &str {
        &self.url
    }

    /// Send a control message to the server and wait for its response.
    ///
    /// # Errors
    ///
    /// - if the signal could not be sent to the server
    /// - if the response could not be received from the server
    async fn send_ctrl(&mut self, ctrl: Ctrl) -> Result<()> {
        let (result_tx, result_rx) = oneshot::channel();
        self.ctrl_tx.send((ctrl, result_tx)).await.map_err(|_| {
            report!(OrchestratorError::from(
                "Could not send control message to server"
            ))
        })?;
        result_rx
            .await
            .into_report()
            .change_context(OrchestratorError::from("Failed to receive response from"))?
    }

    /// Register a new experiment execution with the server, returning a Handle from which messages
    /// from the execution may be received.
    ///
    /// # Errors
    ///
    /// - if communication with the server failed
    pub async fn register_experiment(&mut self, experiment_id: ExperimentId) -> Result<Handle> {
        let (msg_tx, msg_rx) = mpsc::unbounded_channel();
        self.send_ctrl(Ctrl::Register {
            id: experiment_id,
            msg_tx,
        })
        .await?;

        let handle = Handle {
            id: experiment_id,
            msg_rx,
            close_tx: self.close_tx.clone(),
        };
        Ok(handle)
    }

    /// Stop the server associated with this Handler.
    ///
    /// # Errors
    ///
    /// - if communication with the server failed
    // TODO: UNUSED: Needs triage
    pub async fn stop_server(&mut self) -> Result<()> {
        self.send_ctrl(Ctrl::Stop).await
    }
}

/// A server for handling messages from the `hash_engine`-sub[process](crate::process).
pub struct Server {
    url: String,
    ctrl_rx: CtrlReceiver,
    close_rx: CloseReceiver,
    routes: HashMap<ExperimentId, MsgSender>,
}

impl Server {
    /// Create a new `Server` with an associated [`Handler`].
    ///
    /// Use [`run()`](Self::run) to start it, and use the [`Handler`] to register a new experiment
    /// executions.
    ///
    /// Note, that the server may return errors when using the same `url` for different servers.
    pub fn create(url: String) -> (Self, Handler) {
        let (ctrl_tx, ctrl_rx) = mpsc::channel(1);
        let (close_tx, close_rx) = mpsc::unbounded_channel();
        let handler = Handler {
            url: url.clone(),
            ctrl_tx,
            close_tx,
        };
        let server = Self {
            url,
            ctrl_rx,
            close_rx,
            routes: HashMap::new(),
        };
        (server, handler)
    }

    /// Add an experiment to the server's routes.
    ///
    /// # Errors
    ///
    /// - if an experiment with the provided `id` is already registered
    fn register_experiment(&mut self, id: ExperimentId, msg_tx: MsgSender) -> Result<()> {
        if let std::collections::hash_map::Entry::Vacant(e) = self.routes.entry(id) {
            e.insert(msg_tx);
            debug!("Registered experiment {id}");
            Ok(())
        } else {
            bail!(OrchestratorError::from(
                "Experiment already registered: {id}"
            ))
        }
    }

    /// Removes the experiment identified by `id` from the server's routes.
    fn deregister_experiment(&mut self, id: ExperimentId) {
        match self.routes.remove(&id) {
            None => error!("Experiment {id} not found"),
            Some(_) => debug!("De-registered experiment {id}"),
        }
    }

    /// Handle a control message received from the Handler associated with this Server and sends the
    /// result to `result_tx`.
    ///
    /// Returns `true` if the server should stop listening.
    ///
    /// # Errors
    ///
    /// - if the result could not be sent
    fn handle_ctrl_msg(&mut self, ctrl: Ctrl, result_tx: ResultSender) -> Result<bool> {
        let mut stop = false;
        let res = match ctrl {
            Ctrl::Stop => {
                debug!("Stopping server");
                stop = true;
                Ok(())
            }
            Ctrl::Register { id, msg_tx } => self.register_experiment(id, msg_tx),
        };
        result_tx.send(res).map_err(|_| {
            report!(OrchestratorError::from(
                "Could not sent control signal result"
            ))
        })?;
        Ok(stop)
    }

    /// Dispatch a message received from an experiment run to its respective handle.
    ///
    /// # Errors
    ///
    /// - if the message could not be sent
    fn dispatch_message(&self, msg: OrchestratorMsg) -> Result<(), SendError<EngineStatus>> {
        match self.routes.get(&msg.experiment_id) {
            None => {
                // Experiment not found. This can happen if the experiment runner
                // completes before sending de-registering the experiment.
                Ok(())
            }
            Some(sender) => sender
                .send(msg.body)
                .into_report()
                .attach_printable_lazy(|| {
                    format!("Routing message for experiment {}", msg.experiment_id)
                }),
        }
    }

    /// Runs the server until a stop signal is received.
    ///
    /// Handles messages from
    /// - the [`Handler`] returned in [`create()`]
    /// - the server specified by `url` in [`create()`]
    ///
    /// # Errors
    ///
    /// - if the server could not connect to the `url` specified in [`create()`]
    ///
    /// [`create()`]: Self::create
    pub async fn run(&mut self) -> Result<()> {
        let mut socket = nano::Server::new(&self.url).change_context_lazy(|| {
            OrchestratorError::from(format!(
                "Could not create a server socket for {:?}",
                self.url
            ))
        })?;
        loop {
            tokio::select! {
                Some((ctrl, result_tx)) = self.ctrl_rx.recv() => {
                    match self.handle_ctrl_msg(ctrl, result_tx) {
                        Ok(true) => { break; }
                        Ok(false) => {}
                        Err(e) => { let _ = log_error(e); }
                    }
                },
                r = socket.recv::<OrchestratorMsg>() => match r {
                    Err(e) => { let _ = log_error(e); },
                    Ok(msg) => {
                        let _ = self.dispatch_message(msg).map_err(log_error);
                    }
                },
                Some(experiment_id) = self.close_rx.recv() => {
                    self.deregister_experiment(experiment_id);
                }
            }
        }

        Ok(())
    }
}

fn log_error<E: Display>(err: E) -> E {
    error!("{err}");
    err
}
