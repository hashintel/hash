use std::time::Duration;

use tokio::time::timeout;

use super::cancel::CancelTask;
use crate::simulation::{
    comms::active::ActiveTaskOwnerComms,
    task::msg::{TaskMessage, TaskResultOrCancelled},
    Error, Result,
};

#[derive(derive_new::new)]
pub struct ActiveTask {
    comms: ActiveTaskOwnerComms,
    #[new(value = "true")]
    running: bool,
    #[new(default)]
    cancel_sent: bool,
}

impl ActiveTask {
    pub async fn drive_to_completion(mut self) -> Result<TaskMessage> {
        if self.running {
            let recv = self
                .comms
                .result_recv
                .take()
                .ok_or_else(|| Error::from("Couldn't take result recv"))?;
            let result = recv.await?;
            log::trace!("Got result from task: {:?}", result);
            self.running = false;
            match result {
                TaskResultOrCancelled::Result(result) => Ok(result),
                TaskResultOrCancelled::Cancelled => {
                    log::warn!("Driving to completion yielded a cancel result");
                    // TODO: create a variant for this error
                    Err(Error::from("Couldn't drive to completion, task cancelled"))
                }
            }
        } else {
            Err(Error::from("Task is not running"))
        }
    }

    pub async fn cancel(mut self) -> Result<()> {
        if self.running && !self.cancel_sent {
            let cancel_send = self
                .comms
                .cancel_send
                .take()
                .ok_or_else(|| Error::from("Couldn't take cancel send"))?;
            cancel_send
                .send(CancelTask::new())
                .map_err(|_| Error::from("Failed to send Cancel Task"))?;
            self.cancel_sent = true;
            let recv = self
                .comms
                .result_recv
                .take()
                .ok_or_else(|| Error::from("Couldn't take result recv"))?;
            let res = recv.await?;
            if matches!(res, TaskResultOrCancelled::Cancelled) {
                log::warn!("Task was cancelled, but completed in the meanwhile");
            }
            self.running = false;
        } else if !self.running {
            log::warn!("Tried to cancel task which was not running");
        }
        Ok(())
    }
}

// An active task should always be run to completion
// by either cancelling or receiving a result.
// This is because an active task can take shared ownership
// of the datastore which must be released once a package has completed.
impl Drop for ActiveTask {
    // Following this call, shared table will be dropped
    // whereby any access to datastore will be released.
    fn drop(&mut self) {
        if self.running {
            log::warn!("Active task was not terminated. Cancelling.");
            if !self.cancel_sent {
                log::warn!("Sent cancel message");
                if let Some(cancel_send) = self.comms.cancel_send.take() {
                    // TODO: .expect()?
                    if cancel_send.send(CancelTask::new()).is_err() {
                        log::error!("Can't cancel task")
                    }
                    self.cancel_sent = true;
                } else {
                    log::warn!("Cancel not sent, but no `cancel_send`")
                }
            }
            if let Some(result_recv) = self.comms.result_recv.take() {
                if let Err(_) = futures::executor::block_on(timeout(
                    Duration::from_secs(10),
                    //
                    result_recv,
                )) {
                    log::warn!("Did not receive confirmation of task cancellation");
                }
            } else {
                log::warn!("Still running, but no `result_recv`");
            }
        }
    }
}
