use std::{collections::HashMap, fmt::Display};

use error::{bail, report, Result, ResultExt};
use hash_engine::{nano, proto};
use tokio::sync::{mpsc, oneshot};

type ExperimentId = String;
type ResultSender = oneshot::Sender<Result<()>>;
type CloseReceiver = mpsc::UnboundedReceiver<ExperimentId>;
type CloseSender = mpsc::UnboundedSender<ExperimentId>;
type MsgSender = mpsc::UnboundedSender<proto::EngineStatus>;
type MsgReceiver = mpsc::UnboundedReceiver<proto::EngineStatus>;
type CtrlSender = mpsc::Sender<(Ctrl, ResultSender)>;
type CtrlReceiver = mpsc::Receiver<(Ctrl, ResultSender)>;

/// Create a new Server with an associated Handler. Use `Server::run` to start the server, and use
/// the Handler to register new experiment executions.
pub fn create_server(url: String) -> Result<(Server, Handler)> {
    let (ctrl_tx, ctrl_rx) = mpsc::channel(1);
    let (close_tx, close_rx) = mpsc::unbounded_channel();
    let handler = Handler::new(url.clone(), ctrl_tx, close_tx)?;
    let server = Server::new(url, ctrl_rx, close_rx)?;
    Ok((server, handler))
}

enum Ctrl {
    Register { id: ExperimentId, msg_tx: MsgSender },
    Stop,
}

pub struct Handle {
    id: ExperimentId,
    msg_rx: MsgReceiver,
    close_tx: CloseSender,
}

impl Handle {
    /// Receive a message from the experiment run.
    pub async fn recv(&mut self) -> proto::EngineStatus {
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
        self.close_tx.send(self.id.clone()).unwrap_or(());
    }
}

#[derive(Clone)]
pub struct Handler {
    url: String,
    ctrl_tx: CtrlSender,
    close_tx: CloseSender,
}

impl Handler {
    fn new(url: String, ctrl_tx: CtrlSender, close_tx: CloseSender) -> Result<Self> {
        Ok(Handler {
            url,
            ctrl_tx,
            close_tx,
        })
    }

    /// Return the URL that the experiment server is listening on.
    pub fn url(&self) -> &str {
        &self.url
    }

    /// Send a control message to the server and wait for its response.
    async fn send_ctrl(&mut self, ctrl: Ctrl) -> Result<()> {
        let (result_tx, result_rx) = oneshot::channel();
        self.ctrl_tx
            .send((ctrl, result_tx))
            .await
            .map_err(|_| report!("Could not send control message to server"))?;
        result_rx
            .await
            .wrap_err("Failed to receive response from")?
    }

    /// Register a new experiment execution with the server, returning a Handle from which messages
    /// from the execution may be received.
    pub async fn register_experiment(&mut self, experiment_id: &str) -> Result<Handle> {
        let (msg_tx, msg_rx) = mpsc::unbounded_channel();
        self.send_ctrl(Ctrl::Register {
            id: experiment_id.into(),
            msg_tx,
        })
        .await?;

        let handle = Handle {
            id: experiment_id.into(),
            msg_rx,
            close_tx: self.close_tx.clone(),
        };
        Ok(handle)
    }

    /// Stop the server associated with this Handler.
    pub async fn stop_server(&mut self) -> Result<()> {
        self.send_ctrl(Ctrl::Stop).await
    }
}

pub struct Server {
    url: String,
    ctrl_rx: CtrlReceiver,
    close_rx: CloseReceiver,
    routes: HashMap<ExperimentId, MsgSender>,
}

impl Server {
    fn new(url: String, ctrl_rx: CtrlReceiver, close_rx: CloseReceiver) -> Result<Self> {
        Ok(Server {
            url,
            ctrl_rx,
            close_rx,
            routes: HashMap::new(),
        })
    }

    /// Add an experiment to the server's routes.
    fn register_experiment(&mut self, id: ExperimentId, msg_tx: MsgSender) -> Result<()> {
        if self.routes.contains_key(&id) {
            bail!("Experiment already registered: {id}")
        } else {
            self.routes.insert(id.clone(), msg_tx);
            debug!("Registered experiment {id}");
            Ok(())
        }
    }

    fn deregister_experiment(&mut self, id: ExperimentId) {
        match self.routes.remove(&id) {
            None => error!("Experiment {id} not found"),
            Some(_) => debug!("De-registered experiment {id}"),
        }
    }

    /// Handle a control message received from the Handler associated with this Server. Returns true
    /// if the server should stop listening.
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
        result_tx
            .send(res)
            .map_err(|_| report!("Sending server control result"))?;
        Ok(stop)
    }

    /// Dispatch a message received from an experiment run to its respective handle. Returns an
    /// error if the experiment ID set in the message has not been registered.
    fn dispatch_message(&self, msg: proto::OrchestratorMsg) -> Result<()> {
        match self.routes.get(&msg.experiment_id) {
            None => {
                // Experiment not found. This can happen if the experiment runner
                // completes before sending de-registering the experiment.
                Ok(())
            }
            Some(sender) => sender
                .send(msg.body)
                .wrap_err_lazy(|| format!("Routing message for experiment {}", msg.experiment_id)),
        }
    }

    pub async fn run(&mut self) -> Result<()> {
        let mut socket = nano::Server::new(&self.url)?;
        loop {
            tokio::select! {
                Some((ctrl, result_tx)) = self.ctrl_rx.recv() => {
                    match self.handle_ctrl_msg(ctrl, result_tx) {
                        Ok(true) => { break; }
                        Ok(false) => {}
                        Err(e) => { let _ = log_error(e); }
                    }
                },
                r = socket.recv::<proto::OrchestratorMsg>() => match r {
                    Err(e) => { log_error(e); },
                    Ok(msg) => {
                        self.dispatch_message(msg)
                            .map_err(log_error)
                            .unwrap_or(());
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
