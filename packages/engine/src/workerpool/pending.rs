use std::collections::HashMap;

use tokio::sync::oneshot;

use super::error::{Error, Result};
use crate::{
    config::Worker,
    simulation::{
        comms::active::ActiveTaskExecutorComms,
        task::{
            cancel::CancelTask,
            handler::worker_pool::WorkerPoolHandler,
            msg::{TaskMessage, TaskResultOrCancelled},
            Task,
        },
    },
    types::TaskId,
    worker::task::WorkerTaskResultOrCancelled,
};

type HasTerminated = bool;

pub enum DistributionController {
    Distributed {
        active_workers: Vec<Worker>,
        received_results: Vec<(Worker, TaskMessage)>,
        reference_task: Task,
    },
    Single {
        active_worker: Worker,
    },
}

/// TODO: DOC
#[derive(derive_new::new)]
pub struct PendingWorkerPoolTask {
    pub task_id: TaskId,
    pub comms: ActiveTaskExecutorComms,
    pub distribution_controller: DistributionController,
    #[new(default)]
    pub cancelling: bool,
}

impl PendingWorkerPoolTask {
    /// TODO: DOC
    fn handle_result_state(
        &mut self,
        worker: Worker,
        _task_id: TaskId,
        result: TaskMessage,
    ) -> Result<HasTerminated> {
        if let DistributionController::Distributed {
            active_workers: active_workers_comms,
            received_results,
            reference_task,
        } = &mut self.distribution_controller
        {
            received_results.insert(worker.index(), (worker, result));
            active_workers_comms.remove(worker.index());
            if active_workers_comms.is_empty() {
                received_results.sort_by(|a, b| a.0.cmp(&b.0));
                let received_results = std::mem::take(received_results);
                let results = received_results.into_iter().map(|(_, res)| res).collect();
                let combined_result =
                    TaskResultOrCancelled::Result(reference_task.combine_messages(results)?);
                self.comms
                    .result_send
                    .take()
                    .ok_or(Error::NoResultSender)?
                    .send(combined_result)
                    .map_err(|_| Error::from("Couldn't send combined result"))?;
                Ok(true)
            } else {
                Ok(false)
            }
        } else {
            self.comms
                .result_send
                .take()
                .ok_or(Error::NoResultSender)?
                .send(TaskResultOrCancelled::Result(result))
                .map_err(|_| Error::from("Couldn't send combined result"))?;
            Ok(true)
        }
    }

    /// TODO: DOC
    fn handle_cancel_state(&mut self, worker: Worker, _task_id: TaskId) -> Result<HasTerminated> {
        if let DistributionController::Distributed {
            active_workers: active_workers_comms,
            received_results: _,
            reference_task: _,
        } = &mut self.distribution_controller
        {
            active_workers_comms.remove(worker.index());
            if active_workers_comms.is_empty() {
                let combined_result = TaskResultOrCancelled::Cancelled;
                self.comms
                    .result_send
                    .take()
                    .ok_or(Error::NoResultSender)?
                    .send(combined_result)
                    .map_err(|_| Error::from("Couldn't send cancelled task result"))?;
                Ok(true)
            } else {
                Ok(false)
            }
        } else {
            self.comms
                .result_send
                .take()
                .ok_or(Error::NoResultSender)?
                .send(TaskResultOrCancelled::Cancelled)
                .map_err(|_| Error::from("Couldn't send cancelled task result"))?;
            Ok(true)
        }
    }

    /// TODO: DOC
    pub fn handle_result_or_cancel(
        &mut self,
        worker: Worker,
        result_or_cancelled: WorkerTaskResultOrCancelled,
    ) -> Result<HasTerminated> {
        if self.cancelling
            || matches!(
                &result_or_cancelled.payload,
                &TaskResultOrCancelled::Cancelled
            )
        {
            self.handle_cancel_state(worker, result_or_cancelled.task_id)
        } else if let TaskResultOrCancelled::Result(result) = result_or_cancelled.payload {
            self.handle_result_state(worker, result_or_cancelled.task_id, result)
        } else {
            Err(Error::from(
                "Unexpected state when handling worker task result",
            ))
        }
    }

    // TODO: delete or use when cancel is revisited
    #[allow(dead_code)]
    pub fn recv_cancel(&mut self) -> Result<Option<CancelTask>> {
        use oneshot::error::TryRecvError;
        if !self.cancelling {
            return match self.comms.cancel_recv.try_recv() {
                Ok(res) => Ok(Some(res)),
                Err(err) => match err {
                    TryRecvError::Empty => Ok(None),
                    TryRecvError::Closed => Err(Error::CancelClosed),
                },
            };
        }
        // Don't send anything because we've already received a cancel
        // message.
        Ok(None)
    }
}

/// Maintains a map of [`TaskId`]s to their respective [`PendingWorkerPoolTask`].
#[derive(Default)]
pub struct PendingWorkerPoolTasks {
    pub inner: HashMap<TaskId, PendingWorkerPoolTask>,
}

impl PendingWorkerPoolTasks {
    // TODO: delete or use when cancel is revisited
    #[allow(dead_code)]
    pub async fn run_cancel_check(&mut self) -> Vec<TaskId> {
        self.inner
            .iter_mut()
            .filter_map(|(id, task)| {
                // Ignore if closed
                if let Ok(Some(_)) = task.recv_cancel() {
                    Some(*id)
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
    }
}
