use std::time::Duration;

use tokio::{
    sync::oneshot::{channel, Receiver, Sender},
    time::timeout,
};

use crate::{Error, Result};

// TODO: Make the termination logic more cohesive, one implementation can probably be shared across
//   runners, workers, workerpool, and possibly others too. An example of the disconnect right now
//   is the difference between TerminateMessage that's separate from workerpool <-> worker messages,
//   but the runner has a variant of its payload to indicate a termination signal:
//   crate::worker::runner::comms::inbound::InboundToRunnerMsgPayload::TerminateRunner
pub struct TerminateMessage {}

pub struct TerminateRecv {
    inner: Option<Receiver<TerminateMessage>>,
    confirm: Option<Sender<()>>,
}

impl TerminateRecv {
    pub fn take_recv(&mut self) -> Result<Receiver<TerminateMessage>> {
        let receiver = self
            .inner
            .take()
            .ok_or_else(|| Error::from("Couldn't take terminate receiver"))?;
        Ok(receiver)
    }

    pub fn confirm_terminate(&mut self) -> Result<()> {
        let confirm = self
            .confirm
            .take()
            .ok_or(Error::TerminateConfirmAlreadySent)?;
        confirm
            .send(())
            .map_err(|_| Error::from("Couldn't send terminate confirm"))?;
        Ok(())
    }
}

pub struct TerminateSend {
    inner: Option<Sender<TerminateMessage>>,
    confirm: Option<Receiver<()>>,
}

impl TerminateSend {
    pub fn send(&mut self) -> Result<()> {
        let sender = self
            .inner
            .take()
            .ok_or(Error::TerminateMessageAlreadySent)?;
        sender
            .send(TerminateMessage {})
            .map_err(|_| Error::from("Couldn't send terminate message"))?;
        Ok(())
    }

    async fn recv_terminate_confirmation(&mut self) -> Result<()> {
        if self.inner.is_some() {
            return Err(Error::TerminateMessageNotSent);
        }
        let confirm = self
            .confirm
            .take()
            .ok_or_else(|| Error::from("Already tried to recv terminate confirmation"))?;
        confirm
            .await
            .map_err(|_| Error::from("Couldn't send terminate message"))?;
        Ok(())
    }

    pub async fn recv_terminate_confirmation_with_ms_timeout(
        &mut self,
        millis: usize,
    ) -> Result<bool> {
        match timeout(
            Duration::from_millis(millis as u64),
            self.recv_terminate_confirmation(),
        )
        .await
        {
            Ok(res) => res?,
            Err(_) => return Ok(false),
        }
        Ok(true)
    }
}

pub fn new_pair() -> (TerminateSend, TerminateRecv) {
    let (terminate_send, terminate_recv) = channel();
    let (confirm_send, confirm_recv) = channel();

    (
        TerminateSend {
            inner: Some(terminate_send),
            confirm: Some(confirm_recv),
        },
        TerminateRecv {
            inner: Some(terminate_recv),
            confirm: Some(confirm_send),
        },
    )
}
