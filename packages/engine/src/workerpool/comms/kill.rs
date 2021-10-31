use std::time::Duration;

pub use super::{Error, Result};

use tokio::{
    sync::oneshot::{channel, Receiver, Sender},
    time::timeout,
};

pub struct KillMessage {}

pub struct KillRecv {
    inner: Receiver<KillMessage>,
    confirm: Option<Sender<()>>,
}

impl KillRecv {
    pub async fn recv(&mut self) -> Result<KillMessage> {
        let msg = self.inner.await?;
        Ok(msg)
    }

    pub fn confirm_kill(&mut self) -> Result<()> {
        let confirm = self
            .confirm
            .take()
            .ok_or_else(|| Error::KillConfirmAlreadySent)?;
        confirm.send(())?;
        Ok(())
    }
}

pub struct KillSend {
    inner: Option<Sender<KillMessage>>,
    confirm: Receiver<()>,
}

impl KillSend {
    pub fn send(&mut self) -> Result<()> {
        let sender = self
            .inner
            .take()
            .ok_or_else(|| Error::KillMessageAlreadySent)?;
        sender.send(KillMessage {})?;
        Ok(())
    }

    pub async fn recv_kill_confirmation(&mut self) -> Result<()> {
        if self.inner.is_some() {
            return Err(Error::KillMessageNotSent);
        }
        self.confirm.await?;
        Ok(())
    }

    pub async fn recv_kill_confirmation_with_ms_timeout(&mut self, millis: usize) -> Result<bool> {
        if self.inner.is_some() {
            return Err(Error::KillMessageNotSent);
        }
        match timeout(Duration::from_millis(millis as u64), self.confirm.recv()).await {
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
            confirm: confirm_recv,
        },
        KillRecv {
            inner: kill_recv,
            confirm: Some(confirm_send),
        },
    )
}
