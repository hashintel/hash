use std::time::Duration;

pub use super::{Error, Result};

use tokio::{
    sync::oneshot::{channel, Receiver, Sender},
    time::timeout,
};

pub struct KillMessage {}

pub struct KillRecv {
    inner: Option<Receiver<KillMessage>>,
    confirm: Option<Sender<()>>,
}

impl KillRecv {
    pub fn take_recv(&mut self) -> Result<Receiver<KillMessage>> {
        let receiver = self.inner.take().ok_or_else(|| Error::from("Couldn't take kill receiver"))?;
        Ok(receiver)
    }

    pub fn confirm_kill(&mut self) -> Result<()> {
        let confirm = self
            .confirm
            .take()
            .ok_or_else(|| Error::KillConfirmAlreadySent)?;
        confirm.send(()).map_err(|_| Error::from("Couldn't send kill confirm"))?;
        Ok(())
    }
}

pub struct KillSend {
    inner: Option<Sender<KillMessage>>,
    confirm: Option<Receiver<()>>,
}

impl KillSend {
    pub fn send(&mut self) -> Result<()> {
        let sender = self
            .inner
            .take()
            .ok_or_else(|| Error::KillMessageAlreadySent)?;
        sender.send(KillMessage {}).map_err(|_| Error::from("Couldn't send kill message"))?;
        Ok(())
    }

    async fn recv_kill_confirmation(&mut self) -> Result<()> {
        if self.inner.is_some() {
            return Err(Error::KillMessageNotSent);
        }
        let confirm = self.confirm.take().ok_or_else(|| Error::from("Already tried to recv kill confirmation"))?;
        confirm.await.map_err(|err| Error::from(format!("Couldn't receive kill confirm: {:?}", err)))?;
        Ok(())
    }

    pub async fn recv_kill_confirmation_with_ms_timeout(&mut self, millis: usize) -> Result<bool> {
        match timeout(Duration::from_millis(millis as u64), self.recv_kill_confirmation()).await {
            Ok(res) => res?,
            Err(_) => return Ok(false),
        }
        return Ok(true);
    }
}

pub fn new_pair() -> (KillSend, KillRecv) {
    let (kill_send, kill_recv) = channel();
    let (confirm_send, confirm_recv) = channel();

    (
        KillSend {
            inner: Some(kill_send),
            confirm: Some(confirm_recv),
        },
        KillRecv {
            inner: Some(kill_recv),
            confirm: Some(confirm_send),
        },
    )
}
