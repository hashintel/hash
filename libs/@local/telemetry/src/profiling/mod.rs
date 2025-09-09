mod collector;
mod uploader;

use alloc::sync::Arc;
use core::{fmt::Write as _, time::Duration};
use std::{io, path::PathBuf, thread::JoinHandle, time::Instant};

use crossbeam_channel::Sender;
use error_stack::Report;
use tracing::{Subscriber, span};
use tracing_subscriber::{
    Layer,
    layer::Context,
    registry::{LookupSpan, SpanRef},
};

use self::collector::ProfileCollector;

thread_local! {
    /// Use thread name if available (e.g., "main", "tokio-runtime-worker"), otherwise thread ID.
    ///
    /// With work stealing (e.g., Tokio), the actual execution thread may differ from the thread
    /// where the span was created. Typically, work-stealing threads share the same name so in the
    /// context of profiling the spans share the same thread name.
    static THREAD_NAME: Arc<str> = {
        let thread = std::thread::current();
        thread.name().map_or_else(|| Arc::from(format!("{:?}", thread.id())), Arc::from)
    };
}

struct SpanMessage {
    thread_name: Arc<str>,
    scopes: Vec<String>,
    duration: Duration,
}

impl SpanMessage {
    fn from_span<'r, R>(span: &SpanRef<'r, R>, duration: Duration) -> Self
    where
        R: LookupSpan<'r>,
    {
        Self {
            thread_name: THREAD_NAME.with(Arc::clone),
            scopes: span
                .scope()
                .from_root()
                .map(|span| {
                    let mut span_str = String::new();
                    if let Some(module_path) = span.metadata().module_path() {
                        let _ = write!(span_str, "{module_path}::");
                    }

                    _ = write!(span_str, "{}", span.name());

                    if let Some(file) = span.metadata().file() {
                        let _ = write!(span_str, ":{file}");
                    }
                    if let Some(line) = span.metadata().line() {
                        let _ = write!(span_str, ":{line}");
                    }
                    span_str
                })
                .collect(),
            duration,
        }
    }
}

enum Message {
    RecordSpan(SpanMessage),
}

#[derive(Debug, Copy, Clone)]
enum ControlMessage {
    Flush,
    Shutdown,
}

#[derive(Debug, Clone)]
#[cfg_attr(feature = "clap", derive(clap::Parser), clap(next_help_heading = Some("Profiler")))]
pub struct ProfilerCliConfig {
    #[cfg_attr(
        feature = "clap",
        arg(long = "profile-endpoint", env = "HASH_PROFILER_ENDPOINT",)
    )]
    pub profile_endpoint: Option<String>,

    #[cfg_attr(
        feature = "clap",
        arg(
            long = "profile-flush-interval-seconds",
            env = "HASH_GRAPH_PROFILE_FLUSH_INTERVAL_SECONDS",
            default_value_t = 10,
        )
    )]
    pub flush_interval_seconds: u64,
}

#[derive(Debug)]
pub struct ProfilerConfig {
    pub pyroscope_endpoint: Option<String>,
    pub folded_path: Option<PathBuf>,
    pub service_name: String,
    pub flush_interval: Duration,
}

impl ProfilerConfig {
    /// Builds the profiling layer and its associated dropper.
    ///
    /// # Errors
    ///
    /// Returns an error if the profiling layer cannot be created.
    pub fn build<S>(self) -> Result<(impl Layer<S>, impl Drop), Report<io::Error>>
    where
        S: Subscriber + for<'a> LookupSpan<'a>,
    {
        struct Dropper {
            join: Option<JoinHandle<()>>,
            control_tx: Sender<ControlMessage>,
        }

        impl Drop for Dropper {
            fn drop(&mut self) {
                _ = self.control_tx.send(ControlMessage::Shutdown);
                self.join.take().map(JoinHandle::join);
            }
        }

        let (message_tx, message_rx) = crossbeam_channel::bounded(1_000);
        let (control_tx, control_rx) = crossbeam_channel::unbounded();

        Ok((
            ProfileLayer { message_tx },
            Dropper {
                join: Some(ProfileCollector::new(self)?.run(message_rx, control_rx)),
                control_tx,
            },
        ))
    }
}

struct Timings {
    last: Instant,
    // Track total time of all children for exclusive calculation
    child_total: Duration,
}
#[derive(Debug)]
struct ProfileLayer {
    message_tx: Sender<Message>,
}

impl<S> Layer<S> for ProfileLayer
where
    S: Subscriber + for<'s> LookupSpan<'s>,
{
    fn on_new_span(&self, _attrs: &span::Attributes<'_>, id: &span::Id, ctx: Context<'_, S>) {
        let Some(span) = ctx.span(id) else {
            return;
        };

        span.extensions_mut().insert(Timings {
            last: Instant::now(),
            child_total: Duration::ZERO,
        });
    }

    fn on_close(&self, id: span::Id, ctx: Context<'_, S>) {
        let Some(span) = ctx.span(&id) else {
            return;
        };

        let duration = if let Some(timings) = span.extensions_mut().get_mut::<Timings>() {
            let total_duration = timings.last.elapsed();

            // Add this span's total duration to parent's child_total for exclusive calculation
            if let Some(parent) = span.parent()
                && let Some(parent_timings) = parent.extensions_mut().get_mut::<Timings>()
            {
                parent_timings.child_total += total_duration;
            }

            // Calculate exclusive time by subtracting child durations
            total_duration.saturating_sub(timings.child_total)
        } else {
            return;
        };

        _ = self
            .message_tx
            .send(Message::RecordSpan(SpanMessage::from_span(&span, duration)));
    }
}
