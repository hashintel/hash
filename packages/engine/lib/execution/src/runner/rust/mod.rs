// use behavior_execution::BehaviorPackage;
// use behaviors::NativeState;
// use context::{AgentContext, GroupContext, SimContext};
// pub use error::{Error, Result};
// use state::{AgentState, GroupState, SimState, StateSnapshot};

use std::{pin::Pin, result::Result as StdResult};

use futures::{Future, FutureExt};
use tokio::{
    sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender},
    task::JoinError,
};

use crate::{
    package::simulation::SimulationId,
    runner::comms::{ExperimentInitRunnerMsg, InboundToRunnerMsgPayload, OutboundFromRunnerMsg},
    Result,
};

pub struct RustRunner {
    _outbound_sender: UnboundedSender<OutboundFromRunnerMsg>,
    outbound_receiver: UnboundedReceiver<OutboundFromRunnerMsg>,
    spawn: bool,
}

impl RustRunner {
    pub fn new(spawn: bool, _init_msg: ExperimentInitRunnerMsg) -> Result<Self> {
        let (outbound_sender, outbound_receiver) = unbounded_channel();
        Ok(Self {
            _outbound_sender: outbound_sender,
            outbound_receiver,
            spawn,
        })
    }

    pub async fn send(
        &self,
        _sim_id: Option<SimulationId>,
        _msg: InboundToRunnerMsgPayload,
    ) -> Result<()> {
        Ok(())
    }

    pub async fn send_if_spawned(
        &self,
        _sim_id: Option<SimulationId>,
        _msg: InboundToRunnerMsgPayload,
    ) -> Result<()> {
        tracing::trace!("Received message to send to Rust Runner: {:?}", &_msg);
        Ok(())
    }

    pub async fn recv(&mut self) -> Result<OutboundFromRunnerMsg> {
        self.outbound_receiver
            .recv()
            .await
            .ok_or_else(|| crate::Error::from("Rust outbound receive"))
    }

    // TODO: UNUSED: Needs triage
    #[allow(dead_code)]
    pub async fn recv_now(&mut self) -> Result<Option<OutboundFromRunnerMsg>> {
        self.recv().now_or_never().transpose()
    }

    pub fn spawned(&self) -> bool {
        self.spawn
    }

    pub async fn run(
        &mut self,
    ) -> Result<Pin<Box<dyn Future<Output = StdResult<Result<()>, JoinError>> + Send>>> {
        if !self.spawned() {
            return Ok(Box::pin(async move { Ok(Ok(())) }));
        }

        panic!("Rust runner is not implemented yet but was spawned and is trying to run.");
    }
}

/*
mod behavior_execution;
pub mod behaviors;
mod context;
mod error;
mod neighbor;
mod state;

type KeepRunning = bool;

trait Column: Send + Sync {
    fn get<'s>(&self, state: &AgentState<'s>) -> Result<serde_json::Value>;
    fn set<'s>(&self, state: &mut AgentState<'s>, value: serde_json::Value) -> Result<()>;
    fn load<'s>(&self, state: &mut GroupState<'s>) -> Result<()>;
    fn commit<'s>(&self, state: &mut GroupState<'s>) -> Result<()>;
}

struct SimSchema {
    agent: Arc<AgentSchema>,
    msg: Arc<Schema>,
    ctx: Arc<Schema>,
}

pub struct RustRunner {
    sims_state: HashMap<SimulationShortId, SimState>,
    sims_ctx: HashMap<SimulationShortId, SimContext>,
    behavior_execution: Option<BehaviorPackage>,
    inbound_sender: UnboundedSender<(Option<SimulationShortId>, InboundToRunnerMsgPayload)>,
    inbound_receiver: UnboundedReceiver<(Option<SimulationShortId>, InboundToRunnerMsgPayload)>,
    outbound_sender: UnboundedSender<OutboundFromRunnerMsg>,
    outbound_receiver: UnboundedReceiver<OutboundFromRunnerMsg>,
    spawned: bool,
}

impl RustRunner {
    pub fn new(spawn: bool, init_msg: ExperimentInitRunnerMsg) -> crate::Result<Self> {
        let mut behavior_execution = None;
        for (pkg_id, pkg_init) in init_msg.package_config.0 {
            if pkg_init.name == "behavior_execution" {
                behavior_execution = Some(BehaviorPackage::start_experiment(pkg_id, pkg_init)?);
                break;
            }
        }

        let (inbound_sender, inbound_receiver) = unbounded_channel();
        let (outbound_sender, outbound_receiver) = unbounded_channel();
        Ok(Self {
            sims_state: HashMap::new(),
            sims_ctx: HashMap::new(),
            behavior_execution,
            inbound_sender,
            inbound_receiver,
            outbound_sender,
            outbound_receiver,
            spawned: spawn,
        })
    }

    pub async fn send(
        &self,
        sim_id: Option<SimulationShortId>,
        msg: InboundToRunnerMsgPayload,
    ) -> crate::Result<()> {
        self.inbound_sender
            .send((sim_id, msg))
            .map_err(|e| crate::Error::Rust(Error::InboundSend(e)))
    }

    pub async fn send_if_spawned(
        &self,
        sim_id: Option<SimulationShortId>,
        msg: InboundToRunnerMsgPayload,
    ) -> crate::Result<()> {
        if self.spawned {
            self.send(sim_id, msg).await?;
        }
        Ok(())
    }

    pub async fn recv(&mut self) -> crate::Result<OutboundFromRunnerMsg> {
        self.outbound_receiver
            .recv()
            .await
            .ok_or(crate::Error::Rust(Error::OutboundReceive))
    }

    pub async fn recv_now(&mut self) -> crate::Result<Option<OutboundFromRunnerMsg>> {
        self.recv().now_or_never().transpose()
    }

    pub fn spawned(&self) -> bool {
        self.spawned
    }

    pub async fn run(&mut self) -> crate::Result<()> {
        if !self.spawned {
            return Ok(());
        }

        loop {
            tokio::select! {
                Some(sim_id, msg) = self.inbound_receiver.recv() => {
                    // TODO: Send errors instead of immediately stopping?
                    if !self.handle_msg(sim_id, msg, &self.outbound_sender)? {
                        break;
                    }
                }
            }
        }
        Ok(())
    }

    fn handle_msg(
        &mut self,
        sim_id: Option<SimulationShortId>,
        msg: InboundToRunnerMsgPayload,
        outbound_sender: &UnboundedSender<OutboundFromRunnerMsg>,
    ) -> Result<KeepRunning> {
        match msg {
            InboundToRunnerMsgPayload::TerminateRunner => {
                return Ok(false); // Don't continue running.
            }
            InboundToRunnerMsgPayload::NewSimulationRun(new_run) => {
                // TODO: `short_id` doesn't need to be inside `new_run`, since
                //       it's already passed separately to the runner.
                self.start_sim(new_run)?;
            }
            InboundToRunnerMsgPayload::TerminateSimulationRun => {
                let sim_id = sim_id.ok_or(Error::SimulationIdRequired("terminate sim"))?;
                self.sims_state
                    .remove(&sim_id)
                    .ok_or(Error::TerminateMissingSimulationRun(sim_id))?;
            }
            InboundToRunnerMsgPayload::StateSync(state_msg) => {
                let sim_id = sim_id.ok_or(Error::SimulationIdRequired("state sync"))?;
                self.state_sync(sim_id, state_msg)?;
            }
            InboundToRunnerMsgPayload::StateInterimSync(interim_msg) => {
                let sim_id = sim_id.ok_or(Error::SimulationIdRequired("interim sync"))?;
                self.state_interim_sync(sim_id, interim_msg)?;
            }
            InboundToRunnerMsgPayload::StateSnapshotSync(state_msg) => {
                let sim_id = sim_id.ok_or(Error::SimulationIdRequired("snapshot sync"))?;
                self.state_snapshot_sync(sim_id, state_msg)?;
            }
            InboundToRunnerMsgPayload::ContextBatchSync(ctx_batch) => {
                let sim_id = sim_id.ok_or(Error::SimulationIdRequired("context batch sync"))?;
                self.ctx_batch_sync(sim_id, ctx_batch)?;
            }
            InboundToRunnerMsgPayload::TaskMsg(msg) => {
                let sim_id = sim_id.ok_or(Error::SimulationIdRequired("run task"))?;
                let (next_task_msg, warnings) = self.run_task(sim_id, msg)?;
                // TODO: `send` fn to reduce code duplication.
                outbound_sender.send(OutboundFromRunnerMsg {
                    source: Language::Rust,
                    sim_id,
                    payload: OutboundFromRunnerMsgPayload::TaskMsg(next_task_msg),
                })?;
                outbound_sender.send(OutboundFromRunnerMsg {
                    source: Language::Rust,
                    sim_id,
                    payload: OutboundFromRunnerMsgPayload::RunnerWarnings(warnings),
                })?;
            }
            InboundToRunnerMsgPayload::CancelTask(_) => {}
        }
        Ok(true) // Continue running.
    }

    fn start_sim(&mut self, run: NewSimulationRun) -> Result<()> {
        // TODO: Shouldn't rely on behavior package to start sim runs.
        let (col_map, all_behavior_col_names) = match self.behavior_execution.as_ref() {
            Some(b) => (b.col_map.clone(), b.all_behavior_col_names.clone()),
            None => (Arc::new(HashMap::new()), Arc::new(HashSet::new())),
        };
        let schema = SimSchema {
            agent: run.datastore.agent_batch_schema,
            msg: run.datastore.message_batch_schema,
            ctx: run.datastore.context_batch_schema,
        };

        let state = SimState::new(
            schema.clone(),
            Vec::new(),
            Vec::new(),
            col_map,
            all_behavior_col_names,
        );
        self.sims_state
            .try_insert(run.short_id, state)
            .map_err(|_| Error::DuplicateSimulationRun(run.id))?;

        let ctx = SimContext::new(schema, run.globals);
        self.sims_ctx
            .try_insert(run.short_id, ctx)
            .map_err(|_| Error::DuplicateSimulationRun(run.id))?;
        Ok(())
    }

    fn flush(&mut self, state: &mut GroupState<'_>) -> Result<()> {
        state.flush()?;
        Ok(())
    }

    fn run_behavior_execution_task(
        &mut self,
        sim_run_id: SimulationShortId,
        msg: RunnerTaskMsg,
    ) -> Result<(TargetedRunnerTaskMsg, Vec<RunnerError>)> {
        let state = self
            .sims_state
            .get_mut(&sim_run_id)
            .ok_or(Error::MissingSimulationRun(sim_run_id))?;
        let ctx = self
            .sims_ctx
            .get(&sim_run_id)
            .ok_or(Error::MissingSimulationRun(sim_run_id))?;

        // Behavior execution is always executed on single groups.
        let group_index = msg.group_index.unwrap() as usize;
        let pkg = self.behavior_execution.as_mut().unwrap();
        let mut group_state = state.get_group(group_index)?;
        let group_context = ctx.get_group(group_index);
        let next_target = pkg.run_task(&mut group_state, &group_context)?;

        // TODO: When we have packages other than behavior execution, only flush if state writable
        self.flush(&mut group_state)?;
        let next_sync = StateInterimSync {
            group_indices: vec![group_index],
            agent_batches: vec![state.agent_pool[group_index].clone()],
            message_batches: vec![state.msg_pool[group_index].clone()],
        };

        let next_task_msg = TargetedRunnerTaskMsg {
            target: next_target,
            msg: RunnerTaskMsg {
                package_id: msg.package_id,
                task_id: msg.task_id,
                sync: next_sync,
                payload: TaskMessage::default(),
                group_index: msg.group_index,
            },
        };
        Ok((next_task_msg, Vec::new()))
    }

    fn run_task(
        &mut self,
        sim_run_id: SimulationShortId,
        msg: RunnerTaskMsg,
    ) -> Result<(TargetedRunnerTaskMsg, Vec<RunnerError>)> {
        if let Some(ref behavior_execution) = self.behavior_execution {
            if msg.package_id != behavior_execution.id() {
                return Err(Error::NotBehaviorExecution);
            }
        } else {
            return Err(Error::NotBehaviorExecution);
        }
        self.run_behavior_execution_task(sim_run_id, msg)
    }

    fn ctx_batch_sync(
        &mut self,
        sim_run_id: SimulationShortId,
        ctx_batch: ContextBatchSync,
    ) -> Result<()> {
        let ctx = self
            .sims_ctx
            .get_mut(&sim_run_id)
            .ok_or(Error::MissingSimulationRun(sim_run_id))?;
        ctx.sync_batch(ctx_batch.context_batch);
        Ok(())
    }

    fn state_sync(&mut self, sim_run_id: SimulationShortId, msg: StateSync) -> Result<()> {
        let state = self
            .sims_state
            .get_mut(&sim_run_id)
            .ok_or(Error::MissingSimulationRun(sim_run_id))?;
        state.agent_pool = msg.agent_pool.cloned_batch_pool();
        state.msg_pool = msg.message_pool.cloned_batch_pool();
        Ok(())
    }

    fn state_interim_sync(
        &mut self,
        sim_run_id: SimulationShortId,
        msg: StateInterimSync,
    ) -> Result<()> {
        let state = self
            .sims_state
            .get_mut(&sim_run_id)
            .ok_or(Error::MissingSimulationRun(sim_run_id))?;
        let iter = msg
            .group_indices
            .iter()
            .zip(msg.agent_batches.iter().zip(msg.message_batches.iter()));
        for (i_group, (agent_batch, msg_batch)) in iter {
            state.agent_pool[*i_group] = agent_batch.clone();
            state.msg_pool[*i_group] = msg_batch.clone();
        }
        Ok(())
    }

    fn state_snapshot_sync(&mut self, sim_run_id: SimulationShortId, msg: StateSync) -> Result<()> {
        let ctx = self
            .sims_ctx
            .get_mut(&sim_run_id)
            .ok_or(Error::MissingSimulationRun(sim_run_id))?;
        ctx.sync_snapshot(StateSnapshot {
            agent_pool: msg.agent_pool.cloned_batch_pool(),
            msg_pool: msg.message_pool.cloned_batch_pool(),
        });
        Ok(())
    }
}
*/
