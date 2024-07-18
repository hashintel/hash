use tracing::{Event, Subscriber};
use tracing_subscriber::{
    fmt::{
        format::{Compact, Format, Full, Json, Pretty, Writer},
        time::FormatTime,
        FmtContext, FormatEvent, FormatFields,
    },
    registry::LookupSpan,
};

pub(crate) enum TracingFormatter<T> {
    Full(Format<Full, T>),
    Pretty(Format<Pretty, T>),
    Json(Format<Json, T>),
    Compact(Format<Compact, T>),
}

impl<S, N, T> FormatEvent<S, N> for TracingFormatter<T>
where
    S: Subscriber + for<'a> LookupSpan<'a>,
    N: for<'a> FormatFields<'a> + 'static,
    T: FormatTime,
{
    fn format_event(
        &self,
        ctx: &FmtContext<'_, S, N>,
        writer: Writer<'_>,
        event: &Event<'_>,
    ) -> core::fmt::Result {
        match self {
            Self::Full(fmt) => fmt.format_event(ctx, writer, event),
            Self::Pretty(fmt) => fmt.format_event(ctx, writer, event),
            Self::Json(fmt) => fmt.format_event(ctx, writer, event),
            Self::Compact(fmt) => fmt.format_event(ctx, writer, event),
        }
    }
}
