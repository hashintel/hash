use std::{pin::Pin, sync::Arc};

use futures::{Future, FutureExt};
use tokio::{
    sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender},
    task::JoinError,
};
use tracing::Span;

use crate::{
    package::simulation::SimulationId,
    runner::{
        comms::{ExperimentInitRunnerMsg, InboundToRunnerMsgPayload, OutboundFromRunnerMsg},
        javascript::run::run_experiment,
        JavaScriptError,
    },
};

pub struct JavaScriptRunner {
    // `JavaScriptRunner` and `ThreadLocalRunner` are separate because the V8 Isolate inside
    // `ThreadLocalRunner` can't be sent between threads.
    init_msg: Arc<ExperimentInitRunnerMsg>,
    // Args to `ThreadLocalRunner::new`
    inbound_sender: UnboundedSender<(Span, Option<SimulationId>, InboundToRunnerMsgPayload)>,
    inbound_receiver:
        Option<UnboundedReceiver<(Span, Option<SimulationId>, InboundToRunnerMsgPayload)>>,
    outbound_sender: Option<UnboundedSender<OutboundFromRunnerMsg>>,
    outbound_receiver: UnboundedReceiver<OutboundFromRunnerMsg>,
    spawn: bool,
}

impl JavaScriptRunner {
    pub fn new(spawn: bool, init_msg: ExperimentInitRunnerMsg) -> crate::Result<Self> {
        let (inbound_sender, inbound_receiver) = unbounded_channel();
        let (outbound_sender, outbound_receiver) = unbounded_channel();

        Ok(Self {
            init_msg: Arc::new(init_msg),
            inbound_sender,
            inbound_receiver: Some(inbound_receiver),
            outbound_sender: Some(outbound_sender),
            outbound_receiver,
            spawn,
        })
    }

    pub async fn send(
        &self,
        sim_id: Option<SimulationId>,
        msg: InboundToRunnerMsgPayload,
    ) -> crate::Result<()> {
        tracing::trace!("Sending message to JavaScript: {msg:?}");
        self.inbound_sender
            .send((Span::current(), sim_id, msg))
            .map_err(|err| JavaScriptError::InboundSend(err).into())
    }

    pub async fn send_if_spawned(
        &self,
        sim_id: Option<SimulationId>,
        msg: InboundToRunnerMsgPayload,
    ) -> crate::Result<()> {
        if self.spawned() {
            self.send(sim_id, msg).await?;
        }
        Ok(())
    }

    pub async fn recv(&mut self) -> crate::Result<OutboundFromRunnerMsg> {
        self.outbound_receiver
            .recv()
            .await
            .ok_or_else(|| JavaScriptError::OutboundReceive.into())
    }

    // TODO: UNUSED: Needs triage
    #[allow(dead_code)]
    pub async fn recv_now(&mut self) -> crate::Result<Option<OutboundFromRunnerMsg>> {
        self.recv().now_or_never().transpose()
    }

    pub fn spawned(&self) -> bool {
        self.spawn
    }

    pub async fn run(
        &mut self,
    ) -> crate::Result<Pin<Box<dyn Future<Output = Result<crate::Result<()>, JoinError>> + Send>>>
    {
        // TODO: Move tokio spawn into worker?
        tracing::debug!("Running JavaScript runner");
        if !self.spawn {
            return Ok(Box::pin(async move { Ok(Ok(())) }));
        }

        let init_msg = Arc::clone(&self.init_msg);
        let inbound_receiver = self
            .inbound_receiver
            .take()
            .ok_or(JavaScriptError::AlreadyRunning)?;
        let outbound_sender = self
            .outbound_sender
            .take()
            .ok_or(JavaScriptError::AlreadyRunning)?;

        let f = || run_experiment(init_msg, inbound_receiver, outbound_sender);
        Ok(Box::pin(tokio::task::spawn_blocking(f)))
    }
}
