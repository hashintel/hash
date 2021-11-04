pub mod experiment;
pub mod kill;
pub mod main;
pub mod top;

pub use super::{Error, Result};

use crate::{
    datastore::table::sync::SyncPayload,
    types::{TaskID, WorkerIndex},
    worker::{
        runner::comms::{outbound::RunnerError, NewSimulationRun},
        task::{WorkerTask, WorkerTaskResultOrCancelled},
    },
};

use crate::proto::SimulationShortID;
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

pub use experiment::ExpMsgRecv;
pub use kill::KillRecv;
pub use main::{new_no_sim, MainMsgRecv, MainMsgSend};

#[derive(Debug)]
pub enum WorkerPoolToWorkerMsgPayload {
    Task(WorkerTask),
    Sync(SyncPayload),
    CancelTask(TaskID),
    NewSimulationRun(NewSimulationRun),
}

#[derive(Debug)]
pub struct WorkerPoolToWorkerMsg {
    pub sim_id: Option<SimulationShortID>,
    pub payload: WorkerPoolToWorkerMsgPayload,
}

impl WorkerPoolToWorkerMsg {
    pub fn try_clone(&self) -> Result<WorkerPoolToWorkerMsg> {
        let payload = match &self.payload {
            WorkerPoolToWorkerMsgPayload::Task(_) => Err(Error::from("Cannot clone worker task message")),
            WorkerPoolToWorkerMsgPayload::Sync(inner) => Ok(WorkerPoolToWorkerMsgPayload::Sync(inner.clone())),
            WorkerPoolToWorkerMsgPayload::CancelTask(inner) => Ok(WorkerPoolToWorkerMsgPayload::CancelTask(inner.clone())),
            WorkerPoolToWorkerMsgPayload::NewSimulationRun(inner) => Ok(WorkerPoolToWorkerMsgPayload::NewSimulationRun(inner.clone())),
        }?

        Ok(WorkerPoolToWorkerMsg {
            sim_id: self.sim_id.clone(),
            payload
        })
    }
}


impl WorkerPoolToWorkerMsg {
    pub fn sync(sim_id: SimulationShortID, sync_payload: SyncPayload) -> WorkerPoolToWorkerMsg {
        WorkerPoolToWorkerMsg {
            sim_id: Some(sim_id),
            payload: WorkerPoolToWorkerMsgPayload::Sync(sync_payload),
        }
    }

    pub fn task(sim_id: SimulationShortID, task_payload: WorkerTask) -> WorkerPoolToWorkerMsg {
        WorkerPoolToWorkerMsg {
            sim_id: Some(sim_id),
            payload: WorkerPoolToWorkerMsgPayload::Task(task_payload),
        }
    }

    pub fn cancel_task(task_id: TaskID) -> WorkerPoolToWorkerMsg {
        WorkerPoolToWorkerMsg {
            sim_id: None,
            payload: WorkerPoolToWorkerMsgPayload::CancelTask(task_id),
        }
    }

    pub fn new_simulation_run(new_simulation_run: NewSimulationRun) -> WorkerPoolToWorkerMsg {
        WorkerPoolToWorkerMsg {
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
}

pub struct WorkerCommsWithWorkerPool {
    index: WorkerIndex,
    send_to_wp: UnboundedSender<(WorkerIndex, WorkerToWorkerPoolMsg)>,
    recv_from_wp: UnboundedReceiver<WorkerPoolToWorkerMsg>,
    kill_recv: KillRecv,
}

impl WorkerCommsWithWorkerPool {
    pub fn send(&self, msg: WorkerToWorkerPoolMsg) -> Result<()> {
        self.send_to_wp.send((self.index, msg))?;
        Ok(())
    }

    pub async fn recv(&mut self) -> Option<WorkerPoolToWorkerMsg> {
        self.recv_from_wp.recv().await
    }
}

pub struct WorkerPoolCommsWithWorkers {
    send_to_w: Vec<(UnboundedSender<WorkerPoolToWorkerMsg>, kill::KillSend)>,
    recv_from_w: UnboundedReceiver<(WorkerIndex, WorkerToWorkerPoolMsg)>,
}

impl WorkerPoolCommsWithWorkers {
    fn get_worker_senders(
        &mut self,
        worker_index: WorkerIndex,
    ) -> Result<&mut (UnboundedSender<WorkerPoolToWorkerMsg>, kill::KillSend)> {
        self.send_to_w
            .get_mut(worker_index)
            .ok_or_else(|| Error::MissingWorkerWithIndex(worker_index))
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

    pub async fn send_kill_and_confirm(&mut self, worker_index: WorkerIndex) -> Result<()> {
        let sender = &mut self.get_worker_senders(worker_index)?.1;
        sender.send()?;
        sender.recv_kill_confirmation_with_ms_timeout(100).await?;
        Ok(())
    }

    pub async fn send_kill_all(&mut self) -> Result<()> {
        // No need to join all as this is called on exit
        for worker_index in 0..self.send_to_w.len() {
            self.send_kill_and_confirm(worker_index).await?;
        }
        Ok(())
    }

    pub async fn recv(&mut self) -> Option<(WorkerIndex, WorkerToWorkerPoolMsg)> {
        self.recv_from_w.recv().await
    }
}

pub fn new_pool_comms(
    num_workers: usize,
) -> (WorkerPoolCommsWithWorkers, Vec<WorkerCommsWithWorkerPool>) {
    let (send_to_wp, recv_from_w) = unbounded_channel();
    let mut send_to_w = Vec::with_capacity(num_workers);
    let worker_comms = (0..num_workers)
        .map(|index| {
            let (sender, recv_from_wp) = unbounded_channel();
            let (kill_send, kill_recv) = kill::new_pair();
            send_to_w.push((sender, kill_send));
            WorkerCommsWithWorkerPool {
                index,
                send_to_wp: send_to_wp.clone(),
                recv_from_wp,
                kill_recv,
            }
        })
        .collect();
    let worker_pool_comms = WorkerPoolCommsWithWorkers {
        send_to_w,
        recv_from_w,
    };

    (worker_pool_comms, worker_comms)
}
