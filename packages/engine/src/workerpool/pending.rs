use std::collections::HashMap;

use tokio::sync::oneshot;

use super::error::{Error, Result};

use crate::{
    config::Worker,
    simulation::{
        comms::active::ActiveTaskExecutorComms,
        task::{
            cancel::CancelTask,
            result::{TaskResult, TaskResultOrCancelled},
            Task,
        },
    },
    types::TaskID,
    worker::task::WorkerTaskResultOrCancelled,
};

pub enum DistributionController {
    Distributed {
        active_workers: Vec<Worker>,
        received_results: Vec<(Worker, TaskResult)>,
        reference_task: Task,
    },
    Single {
        active_worker: Worker,
    },
}

#[derive(new)]
pub struct PendingWorkerPoolTask {
    pub task_id: TaskID,
    pub comms: ActiveTaskExecutorComms,
    pub distribution_controller: DistributionController,
    #[new(default)]
    pub cancelling: bool,
}

impl PendingWorkerPoolTask {
    fn handle_result_state(
        &mut self,
        worker_index: Worker,
        task_id: TaskID,
        result: TaskResult,
    ) -> Result<bool> {
        if let DistributionController::Distributed {
            active_workers: active_workers_comms,
            received_results,
            reference_task,
        } = &mut self.distribution_controller
        {
            received_results.insert(worker_index, result);
            active_workers_comms.remove(worker_index);
            if active_workers_comms.is_empty() {
                received_results.sort_by(|a, b| a.cmp(b));
                let received_results = std::mem::replace(received_results, vec![]);
                let results = received_results
                    .into_iter()
                    .map(|(index, res)| res)
                    .collect();
                let combined_result =
                    TaskResultOrCancelled::Result(reference_task.combine_messages(results)?);
                self.comms.result_send.send(combined_result)?;
                return Ok(true);
            }
            return Ok(false);
        } else {
            self.comms
                .result_send
                .send(TaskResultOrCancelled::Result(result))?;
            Ok(true)
        }
    }

    pub fn handle_result_or_cancel_and_maybe_complete(
        &mut self,
        worker_index: Worker,
        result_or_cancelled: WorkerTaskResultOrCancelled,
    ) -> Result<bool> {
        if self.cancelling || matches!(result_or_cancelled, TaskResultOrCancelled::Cancelled) {
            return self.handle_cancel_state(worker_index, result_or_cancelled.task_id);
        } else if let TaskResultOrCancelled::Result(result) = result_or_cancelled.inner {
            return self.handle_result_state(worker_index, result_or_cancelled.task_id, result);
        } else {
            Err(Error::from(
                "Unexpected state when handling worker task result",
            ));
        }
    }

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
        return Ok(None);
    }
}

#[derive(Default)]
pub struct PendingWorkerPoolTasks {
    pub inner: HashMap<TaskID, PendingWorkerPoolTask>,
}

impl PendingWorkerPoolTasks {
    async fn run_cancel_check(&mut self) -> Result<Vec<TaskID>> {
        let cancel_tasks = vec![];
        self.inner.iter_mut().for_each(|(id, task)| {
            // Ignore if closed
            if let Ok(Some(c)) = task.recv_cancel() {
                cancel_tasks.push(*id);
            }
        });

        Ok(cancel_tasks)
    }
}
