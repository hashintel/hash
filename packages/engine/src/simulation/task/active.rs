use std::time::Duration;

use tokio::time::timeout;

use crate::simulation::task::result::TaskResult;
use crate::simulation::{comms::active::ActiveTaskOwnerComms, Error, Result};

use super::cancel::CancelTask;

#[derive(new)]
pub struct ActiveTask {
    comms: ActiveTaskOwnerComms,
    #[new(value = "true")]
    running: bool,
    #[new(default)]
    cancel_sent: bool,
}

impl ActiveTask {
    // TODO OS - COMPILE BLOCK - should it return TaskResultOrCancelled?
    pub async fn drive_to_completion(mut self) -> Result<TaskResult> {
        if self.running {
            let result = self.comms.result_recv.await?;
            self.running = false;
            Ok(result)
        } else {
            Err(Error::from("Task is not running"));
        }
    }

    pub async fn cancel(mut self) -> Result<()> {
        if self.running && !self.cancel_sent {
            self.comms.cancel_send.send(CancelTask::new());
            self.cancel_sent = true;
            self.comms.cancel_result_recv.await?;
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
                self.comms.cancel_send(CancelTask::new());
            }

            if let Err(_) = futures::executor::block_on(timeout(
                Duration::from_secs(10),
                self.comms.cancel_result_recv,
            )) {
                log::warn!("Did not receive confirmation of task cancellation");
            }
        }
    }
}
