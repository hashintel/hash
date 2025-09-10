mod collector;
mod uploader;

use alloc::{borrow::Cow, sync::Arc};
use core::{error::Error, fmt::Write as _, time::Duration};
use std::{collections::HashMap, path::PathBuf, thread::JoinHandle, time::Instant};

use crossbeam_channel::Sender;
use error_stack::{Report, ResultExt as _};
use pyroscope::{PyroscopeAgent, pyroscope::PyroscopeAgentRunning};
use pyroscope_pprofrs::{PprofConfig, pprof_backend};
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

#[derive(Debug, derive_more::Display)]
pub enum ProfileConfigError {
    #[display("Failed to initialize CPU profiling")]
    Cpu,
    #[display("Failed to create Wall profiling")]
    Wall,
}

impl Error for ProfileConfigError {}

#[derive(Debug)]
pub struct ProfilerConfig {
    pub enable_wall: bool,
    pub enable_cpu: bool,
    pub pyroscope_endpoint: Option<String>,
    pub folded_path: Option<PathBuf>,
    pub service_name: String,
    pub labels: HashMap<&'static str, Cow<'static, str>>,
    pub flush_interval: Duration,
}

impl ProfilerConfig {
    /// Builds the profiling layer and its associated dropper.
    ///
    /// # Errors
    ///
    /// Returns an error if the profiling layer cannot be created.
    pub fn build<S>(mut self) -> Result<(impl Layer<S>, impl Drop), Report<ProfileConfigError>>
    where
        S: Subscriber + for<'a> LookupSpan<'a>,
    {
        struct Dropper {
            wall: Option<(Sender<ControlMessage>, JoinHandle<()>)>,
            cpu: Option<PyroscopeAgent<PyroscopeAgentRunning>>,
        }

        // TODO: We probably need to switch from `std::thread` to `tokio::task` but this prevents a
        //       `Drop` implementation.
        //   see https://linear.app/hash/issue/H-5339/implement-continuous-profiling-for-the-graph
        impl Drop for Dropper {
            fn drop(&mut self) {
                if let Some((control_tx, handle)) = self.wall.take() {
                    _ = control_tx.send(ControlMessage::Shutdown);
                    if handle.join().is_err() {
                        tracing::warn!("Failed to join profiling thread");
                    }
                }
                if let Some(agent) = self.cpu.take() {
                    match agent.stop() {
                        Ok(agent) => agent.shutdown(),
                        Err(error) => tracing::warn!("Failed to stop Pyroscope agent: {error}"),
                    }
                }
            }
        }

        self.service_name = self.service_name.replace(' ', "-").to_lowercase();

        let cpu = if self.enable_cpu
            && let Some(pyroscope_endpoint) = self.pyroscope_endpoint.as_deref()
        {
            let agent = PyroscopeAgent::builder(pyroscope_endpoint, "hash-graph-benchmarks")
                .backend(pprof_backend(PprofConfig::new().sample_rate(100)))
                .func(|mut report| {
                    report.data.retain(|trace, _| {
                        trace.frames.iter().any(|frame| {
                            frame.name.as_deref() != Some("std::thread::Thread::unpark")
                        })
                    });
                    report
                })
                .application_name(&self.service_name)
                .tags(
                    self.labels
                        .iter()
                        .map(|(key, value)| (*key, value.as_ref()))
                        .collect(),
                )
                .build()
                .change_context(ProfileConfigError::Cpu)?;
            Some(agent.start().change_context(ProfileConfigError::Cpu)?)
        } else {
            None
        };

        let (layer, wall) = if self.enable_wall
            && (self.pyroscope_endpoint.is_some() || self.folded_path.is_some())
        {
            let (message_tx, message_rx) = crossbeam_channel::bounded(1_000);
            let (control_tx, control_rx) = crossbeam_channel::unbounded();
            (
                Some(ProfileLayer { message_tx }),
                Some((
                    control_tx,
                    ProfileCollector::new(self)
                        .change_context(ProfileConfigError::Wall)?
                        .run(message_rx, control_rx),
                )),
            )
        } else {
            (None, None)
        };

        Ok((layer, Dropper { wall, cpu }))
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
