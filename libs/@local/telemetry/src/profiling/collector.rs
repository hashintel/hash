use core::{ops::ControlFlow, time::Duration};
use std::{
    fs::{self, File},
    io::{self, BufWriter, Write as _},
    thread,
};

use crossbeam_channel::{Receiver, select, tick};
use error_stack::Report;

use super::{ControlMessage, Message, ProfilerConfig, SpanMessage, uploader::ProfileUploader};

#[derive(Debug)]
pub(super) struct ProfileCollector {
    uploader: Option<ProfileUploader>,
    folded_file: Option<BufWriter<File>>,
    flush_interval: Duration,
}

impl ProfileCollector {
    pub(crate) fn new(mut config: ProfilerConfig) -> Result<Self, Report<io::Error>> {
        if let Some(endpoint) = &mut config.pyroscope_endpoint {
            endpoint.push_str("/ingest");
        }
        let tags = config
            .labels
            .iter()
            .map(|(key, value)| format!("{key}={value}"))
            .collect::<Vec<_>>()
            .join(",");

        // Format is `<SERVICE_NAME>.<PROFILE>{<KEY=VALUE>}`
        config.service_name = format!("{}.wall{{{}}}", config.service_name, tags);

        Ok(Self {
            uploader: config
                .pyroscope_endpoint
                .map(|endpoint| dbg!(ProfileUploader::new(endpoint, config.service_name))),
            folded_file: config
                .folded_path
                .as_ref()
                .map(|path| {
                    fs::create_dir_all(path)?;
                    File::create(path.join("tracing.folded")).map(BufWriter::new)
                })
                .transpose()?,
            flush_interval: config.flush_interval,
        })
    }

    pub(crate) fn run(
        mut self,
        message_rx: Receiver<Message>,
        ctrl_rx: Receiver<ControlMessage>,
    ) -> thread::JoinHandle<()> {
        let tick = tick(self.flush_interval);
        thread::spawn(move || {
            loop {
                let ctrl = select! {
                    recv(message_rx) -> message => match message {
                        Ok(message) => self.process_message(message),
                        Err(_) => self.process_ctrl_message(ControlMessage::Shutdown),
                    },
                    recv(ctrl_rx) -> ctrl => match ctrl {
                        Ok(ctrl) => self.process_ctrl_message(ctrl),
                        Err(_) => self.process_ctrl_message(ControlMessage::Shutdown),
                    },
                    recv(tick) -> _ => self.process_ctrl_message(ControlMessage::Flush),
                };

                match ctrl {
                    ControlFlow::Continue(()) => {}
                    ControlFlow::Break(()) => break,
                }
            }
        })
    }

    fn process_message(&mut self, message: Message) -> ControlFlow<()> {
        match message {
            Message::RecordSpan(span) => {
                self.record_message(&span);
                ControlFlow::Continue(())
            }
        }
    }

    fn process_ctrl_message(&mut self, message: ControlMessage) -> ControlFlow<()> {
        match message {
            ControlMessage::Flush => {
                self.flush();
                ControlFlow::Continue(())
            }
            ControlMessage::Shutdown => {
                self.flush();
                ControlFlow::Break(())
            }
        }
    }

    fn record_message(&mut self, message: &SpanMessage) {
        let scopes = message.scopes.join(";");

        let args = if scopes.is_empty() {
            format_args!("{} {}\n", message.thread_name, message.duration.as_nanos())
        } else {
            format_args!(
                "{}; {} {}\n",
                message.thread_name,
                scopes,
                message.duration.as_nanos()
            )
        };

        if let Some(file) = &mut self.folded_file
            && let Err(error) = file.write_fmt(args)
        {
            tracing::error!(?error, "Failed to write profile data to file");
        }
        if let Some(buffer) = &mut self.uploader {
            buffer.write_fmt(args);
        }
    }

    fn flush(&mut self) {
        if let Some(file) = &mut self.folded_file
            && let Err(error) = file.flush()
        {
            tracing::error!(?error, "Failed to flush profile data to file");
        }
        if let Some(buffer) = &mut self.uploader
            && let Err(error) = buffer.flush()
        {
            tracing::error!(?error, "Failed to flush profile data to uploader");
        }
    }
}
