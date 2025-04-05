use core::{fmt, fmt::Write as _};
use std::io::{IsTerminal as _, stderr};

use indicatif::ProgressState;
use tracing::info_span;
use tracing_indicatif::{IndicatifLayer, span_ext::IndicatifSpanExt as _, style::ProgressStyle};
use tracing_subscriber::{layer::SubscriberExt as _, util::SubscriberInitExt as _};

use crate::styles::{BOLD, GREEN, RED, YELLOW};

#[expect(clippy::integer_division, clippy::integer_division_remainder_used)]
pub(crate) fn elapsed_subsec(state: &ProgressState, writer: &mut dyn fmt::Write) {
    let elapsed = state.elapsed();
    let seconds = elapsed.as_secs();
    let sub_seconds = elapsed.subsec_millis() / 100;

    let color = if seconds > 8 {
        RED
    } else if seconds > 4 {
        YELLOW
    } else {
        GREEN
    };

    writer
        .write_fmt(format_args!("{color}{seconds}.{sub_seconds}s{color:#}"))
        .expect("should be able to write to stdout");
}

pub(crate) macro header({ reporter: $reporter:expr,length: $length:expr,ignored: $ignored:expr }) {
    let mut header = String::new();
    let _ = write!(
        header,
        "{GREEN}Running{GREEN:#} {BOLD}{}{BOLD:#} tests",
        $length
    );

    if $ignored > 0 {
        let _ = write!(header, " {YELLOW}({} ignored){YELLOW:#}", $ignored);
    }

    header.push_str(" {wide_msg} {elapsed_subsec}\n{wide_bar}");

    let header_span = info_span!("header");

    if $reporter.is_terminal {
        header_span.pb_set_style(
            &ProgressStyle::with_template(&header)
                .expect("progress style should be valid")
                .with_key("elapsed_subsec", elapsed_subsec)
                .progress_chars("---"),
        );
        header_span.pb_start();

        // Bit of a hack to show a full "-----" line underneath the header.
        header_span.pb_set_length(1);
        header_span.pb_set_position(1);
    }
}

pub(crate) struct Reporter {
    pub is_terminal: bool,
}

impl Reporter {
    pub fn install() -> Self {
        if stderr().is_terminal() {
            Self::install_interactive()
        } else {
            Self::install_non_interactive()
        }
    }

    fn install_non_interactive() -> Self {
        tracing_subscriber::registry()
            .with(tracing_subscriber::fmt::layer())
            .init();

        Self { is_terminal: false }
    }

    fn install_interactive() -> Self {
        let indicatif_layer = IndicatifLayer::new()
            .with_progress_style(
                ProgressStyle::with_template(
                    "{span_child_prefix}{span_fields} -- {span_name} {wide_msg} {elapsed_subsec}",
                )
                .expect("progress style should be valid")
                .with_key("elapsed_subsec", elapsed_subsec),
            )
            .with_span_child_prefix_symbol("\u{21b3} ")
            .with_span_child_prefix_indent(" ");

        tracing_subscriber::registry()
            .with(tracing_subscriber::fmt::layer().with_writer(indicatif_layer.get_stderr_writer()))
            .with(indicatif_layer)
            .init();

        Self { is_terminal: true }
    }
}
