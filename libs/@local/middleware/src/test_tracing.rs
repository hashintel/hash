//! Tracing subscribers for the middleware tests.

use alloc::sync::Arc;
use std::sync::{Mutex, OnceLock};

use opentelemetry::trace::TracerProvider as _;
use opentelemetry_sdk::trace::{InMemorySpanExporter, SdkTracerProvider, SpanData};
use tracing::Dispatch;
use tracing_subscriber::layer::SubscriberExt as _;

/// Records the level of every event emitted under the subscriber it is layered onto.
#[derive(Clone, Default)]
struct EventLevels(Arc<Mutex<Vec<tracing::Level>>>);

impl EventLevels {
    /// The levels of the events recorded so far, in the order they were emitted.
    fn recorded(&self) -> Vec<tracing::Level> {
        self.0.lock().expect("the event log should lock").clone()
    }
}

impl<S: tracing::Subscriber> tracing_subscriber::Layer<S> for EventLevels {
    fn on_event(
        &self,
        event: &tracing::Event<'_>,
        _ctx: tracing_subscriber::layer::Context<'_, S>,
    ) {
        self.0
            .lock()
            .expect("the event log should lock")
            .push(*event.metadata().level());
    }
}

/// A subscriber that exports its spans through OpenTelemetry into memory and records the level of
/// every event.
pub(crate) struct RecordedTrace {
    dispatch: Dispatch,
    exporter: InMemorySpanExporter,
    levels: EventLevels,
}

impl RecordedTrace {
    pub(crate) fn new() -> Self {
        keep_dispatcher_list_plural();

        let exporter = InMemorySpanExporter::default();
        let provider = SdkTracerProvider::builder()
            .with_simple_exporter(exporter.clone())
            .build();
        let levels = EventLevels::default();
        let dispatch = Dispatch::new(
            tracing_subscriber::registry()
                .with(tracing_opentelemetry::layer().with_tracer(provider.tracer("test")))
                .with(levels.clone()),
        );

        Self {
            dispatch,
            exporter,
            levels,
        }
    }

    /// The subscriber, to run a test under.
    pub(crate) fn dispatch(&self) -> Dispatch {
        self.dispatch.clone()
    }

    /// The spans that have ended so far.
    pub(crate) fn spans(&self) -> Vec<SpanData> {
        self.exporter
            .get_finished_spans()
            .expect("the exporter should return the finished spans")
    }

    /// The levels of the events emitted so far.
    pub(crate) fn levels(&self) -> Vec<tracing::Level> {
        self.levels.recorded()
    }

    /// Whether an event of an ended span carries an `error` attribute containing `text`.
    pub(crate) fn traces_error(&self, text: &str) -> bool {
        self.spans()
            .iter()
            .flat_map(|span| span.events.iter())
            .any(|event| {
                event.attributes.iter().any(|attribute| {
                    attribute.key.as_str() == "error" && attribute.value.as_str().contains(text)
                })
            })
    }
}

/// Keeps the registered-dispatcher list plural for the rest of the process.
///
/// With at most one registered dispatcher, tracing-core rebuilds a first-hit callsite's
/// interest from the calling thread's default dispatcher (`Rebuilder::JustOne`). A parallel
/// test thread with no default dispatcher then caches `never` for a callsite this test just
/// enabled, and the event is skipped before the scoped subscriber is consulted. Two
/// dispatchers that never drop keep `has_just_one` false, so every rebuild reads the real
/// registry list under its lock, and that list contains this test's live dispatch.
fn keep_dispatcher_list_plural() {
    static KEEPERS: OnceLock<[Dispatch; 2]> = OnceLock::new();
    KEEPERS.get_or_init(|| {
        [
            Dispatch::new(tracing_subscriber::registry()),
            Dispatch::new(tracing_subscriber::registry()),
        ]
    });
}
