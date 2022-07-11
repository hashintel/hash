//! Communication channels and messages for running the [`WorkerPool`].
//!
//! This module contains channels and messages for different purposes:
//!   * [`main`]: Channels to drive [`WorkerPool`]
//!   * [`message`]: Messages belonging to the [`main`] module
//!   * [`active`]: Communication with an [`ActiveTask`]
//!   * [`experiment`]: Communication with an [`ExperimentPackage`]
//!   * [`terminate`]: API for terminating the [`WorkerPool`]
//!   * [`top`]: Communication to the top-level simulation controller
//!
//! [`WorkerPool`]: crate::worker_pool::WorkerPool
//! [`ActiveTask`]: crate::task::ActiveTask
//! [`ExperimentPackage`]: crate::package::experiment::ExperimentPackage

pub mod active;
pub mod experiment;
pub mod main;
pub mod message;
pub mod terminate;
pub mod top;

use tokio::sync::{
    mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender},
    oneshot::Receiver,
};
use tracing::Span;

use self::terminate::TerminateMessage;
use crate::{
    package::simulation::SimulationId,
    runner::comms::{NewSimulationRun, PackageError, RunnerError, UserError, UserWarning},
    task::TaskId,
    worker::{SyncPayload, WorkerTask, WorkerTaskResultOrCancelled},
    worker_pool::{comms::terminate::TerminateRecv, WorkerIndex},
    Error, Result,
};

#[derive(Debug)]
pub enum WorkerPoolToWorkerMsgPayload {
    Task(WorkerTask),
    Sync(SyncPayload),
    CancelTask(TaskId),
    NewSimulationRun(NewSimulationRun),
}

#[derive(Debug)]
pub struct WorkerPoolToWorkerMsg {
    pub span: Span,
    pub sim_id: Option<SimulationId>,
    pub payload: WorkerPoolToWorkerMsgPayload,
}

impl WorkerPoolToWorkerMsg {
    pub fn try_clone(&self) -> Result<WorkerPoolToWorkerMsg> {
        let payload = match &self.payload {
            WorkerPoolToWorkerMsgPayload::Task(_) => {
                Err(Error::from("Cannot clone worker task message"))
            }
            WorkerPoolToWorkerMsgPayload::Sync(inner) => {
                Ok(WorkerPoolToWorkerMsgPayload::Sync(inner.try_clone()?))
            }
            WorkerPoolToWorkerMsgPayload::CancelTask(inner) => {
                Ok(WorkerPoolToWorkerMsgPayload::CancelTask(*inner))
            }
            WorkerPoolToWorkerMsgPayload::NewSimulationRun(inner) => Ok(
                WorkerPoolToWorkerMsgPayload::NewSimulationRun(inner.clone()),
            ),
        }?;

        Ok(WorkerPoolToWorkerMsg {
            span: self.span.clone(),
            sim_id: self.sim_id,
            payload,
        })
    }
}

impl WorkerPoolToWorkerMsg {
    pub fn sync(sim_id: SimulationId, sync_payload: SyncPayload) -> WorkerPoolToWorkerMsg {
        WorkerPoolToWorkerMsg {
            span: Span::current(),
            sim_id: Some(sim_id),
            payload: WorkerPoolToWorkerMsgPayload::Sync(sync_payload),
        }
    }

    pub fn task(sim_id: SimulationId, task_payload: WorkerTask) -> WorkerPoolToWorkerMsg {
        WorkerPoolToWorkerMsg {
            span: Span::current(),
            sim_id: Some(sim_id),
            payload: WorkerPoolToWorkerMsgPayload::Task(task_payload),
        }
    }

    #[allow(dead_code, unused_variables, unreachable_code)]
    pub fn cancel_task(task_id: TaskId) -> WorkerPoolToWorkerMsg {
        todo!("Cancel messages are not implemented yet");
        // see https://app.asana.com/0/1199548034582004/1202011714603653/f

        WorkerPoolToWorkerMsg {
            span: Span::current(),
            sim_id: None,
            payload: WorkerPoolToWorkerMsgPayload::CancelTask(task_id),
        }
    }

    pub fn new_simulation_run(new_simulation_run: NewSimulationRun) -> WorkerPoolToWorkerMsg {
        WorkerPoolToWorkerMsg {
            span: Span::current(),
            sim_id: Some(new_simulation_run.short_id),
            payload: WorkerPoolToWorkerMsgPayload::NewSimulationRun(new_simulation_run),
        }
    }
}

#[derive(Debug, Clone)]
pub enum WorkerToWorkerPoolMsg {
    TaskResultOrCancelled(WorkerTaskResultOrCancelled),
    RunnerErrors(Vec<RunnerError>),
    RunnerWarnings(Vec<RunnerError>),
    RunnerLogs(Vec<String>),
    UserErrors(Vec<UserError>),
    UserWarnings(Vec<UserWarning>),
    PackageError(PackageError),
}

pub struct WorkerCommsWithWorkerPool {
    index: WorkerIndex,
    send_to_wp: UnboundedSender<(WorkerIndex, SimulationId, WorkerToWorkerPoolMsg)>,
    recv_from_wp: Option<UnboundedReceiver<WorkerPoolToWorkerMsg>>,
    terminate_recv: TerminateRecv,
}

impl WorkerCommsWithWorkerPool {
    pub fn index(&self) -> &WorkerIndex {
        &self.index
    }

    pub fn send(&self, sim_id: SimulationId, msg: WorkerToWorkerPoolMsg) -> Result<()> {
        self.send_to_wp.send((self.index, sim_id, msg))?;
        Ok(())
    }

    /// Returns the receiver for messages from the WorkerPool.
    /// Note: This should only be called once
    /// It's necessary as receives require mutable borrows and the WorkerCommsWithWorkerPool struct
    /// will cause issues with immutable borrows at the same time, when used in a Tokio select! loop
    pub fn take_recv(&mut self) -> Result<UnboundedReceiver<WorkerPoolToWorkerMsg>> {
        self.recv_from_wp
            .take()
            .ok_or_else(|| Error::from("Couldn't take `recv_from_wp`"))
    }

    /// Returns the receiver for termination signals from the WorkerPool.
    /// Note: This should only be called once
    /// It's necessary as receives require mutable borrows and the WorkerCommsWithWorkerPool struct
    /// will cause issues with immutable borrows at the same time, when used in a Tokio select! loop
    pub fn take_terminate_recv(&mut self) -> Result<Receiver<TerminateMessage>> {
        self.terminate_recv.take_recv()
    }

    pub fn confirm_terminate(&mut self) -> Result<()> {
        self.terminate_recv.confirm_terminate()
    }
}

pub struct WorkerPoolCommsWithWorkers {
    send_to_w: Vec<(
        UnboundedSender<WorkerPoolToWorkerMsg>,
        terminate::TerminateSend,
    )>,
    recv_from_w: UnboundedReceiver<(WorkerIndex, SimulationId, WorkerToWorkerPoolMsg)>,
}

impl WorkerPoolCommsWithWorkers {
    pub fn num_workers(&self) -> usize {
        self.send_to_w.len()
    }

    fn get_worker_senders(
        &self,
        worker_index: WorkerIndex,
    ) -> Result<&(
        UnboundedSender<WorkerPoolToWorkerMsg>,
        terminate::TerminateSend,
    )> {
        self.send_to_w
            .get(worker_index.index())
            .ok_or(Error::MissingWorkerWithIndex(worker_index))
    }

    fn get_mut_worker_senders(
        &mut self,
        worker_index: WorkerIndex,
    ) -> Result<&mut (
        UnboundedSender<WorkerPoolToWorkerMsg>,
        terminate::TerminateSend,
    )> {
        self.send_to_w
            .get_mut(worker_index.index())
            .ok_or(Error::MissingWorkerWithIndex(worker_index))
    }

    pub fn send(&self, worker_index: WorkerIndex, msg: WorkerPoolToWorkerMsg) -> Result<()> {
        let sender = &self.get_worker_senders(worker_index)?.0;
        sender.send(msg)?;
        Ok(())
    }

    pub fn send_all(&self, msg: WorkerPoolToWorkerMsg) -> Result<()> {
        self.send_to_w
            .iter()
            .try_for_each(|(sender, _)| {
                let cloned = msg.try_clone()?;
                sender.send(cloned).map_err(Error::from)
            })
            .map_err(Error::from)
    }

    pub async fn send_terminate_and_confirm(&mut self, worker_index: WorkerIndex) -> Result<()> {
        let sender = &mut self.get_mut_worker_senders(worker_index)?.1;
        sender.send()?;
        sender
            .recv_terminate_confirmation_with_ms_timeout(100)
            .await?;
        Ok(())
    }

    pub async fn send_terminate_all(&mut self) -> Result<()> {
        // No need to join all as this is called on exit
        for worker_index in 0..self.send_to_w.len() {
            self.send_terminate_and_confirm(WorkerIndex::new(worker_index))
                .await?;
        }
        Ok(())
    }

    pub async fn recv(&mut self) -> Option<(WorkerIndex, SimulationId, WorkerToWorkerPoolMsg)> {
        self.recv_from_w.recv().await
    }
}

pub fn new_pool_comms(
    num_workers: usize,
) -> (WorkerPoolCommsWithWorkers, Vec<WorkerCommsWithWorkerPool>) {
    let (send_to_wp, recv_from_w) = unbounded_channel();
    let mut send_to_w = Vec::with_capacity(num_workers);
    let worker_comms = (0..num_workers)
        .map(|worker_index| {
            let (sender, recv_from_wp) = unbounded_channel();
            let (terminate_send, terminate_recv) = terminate::new_pair();
            send_to_w.push((sender, terminate_send));
            WorkerCommsWithWorkerPool {
                index: WorkerIndex::new(worker_index),
                send_to_wp: send_to_wp.clone(),
                recv_from_wp: Some(recv_from_wp),
                terminate_recv,
            }
        })
        .collect();
    let worker_pool_comms = WorkerPoolCommsWithWorkers {
        send_to_w,
        recv_from_w,
    };

    (worker_pool_comms, worker_comms)
}
