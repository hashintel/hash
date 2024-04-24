use std::io::{self, Stderr, Stdout};

use tracing_subscriber::fmt::MakeWriter;

pub(crate) enum ConsoleMakeWriter {
    Stdout,
    Stderr,
}

impl<'writer> MakeWriter<'writer> for ConsoleMakeWriter {
    type Writer = ConsoleWriter;

    fn make_writer(&'writer self) -> Self::Writer {
        match self {
            Self::Stdout => ConsoleWriter::Stdout(io::stdout()),
            Self::Stderr => ConsoleWriter::Stderr(io::stderr()),
        }
    }
}

pub(crate) enum ConsoleWriter {
    Stdout(Stdout),
    Stderr(Stderr),
}

impl io::Write for ConsoleWriter {
    #[inline]
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        match self {
            Self::Stdout(w) => w.write(buf),
            Self::Stderr(w) => w.write(buf),
        }
    }

    #[inline]
    fn write_vectored(&mut self, bufs: &[io::IoSlice<'_>]) -> io::Result<usize> {
        match self {
            Self::Stdout(w) => w.write_vectored(bufs),
            Self::Stderr(w) => w.write_vectored(bufs),
        }
    }

    #[inline]
    fn is_write_vectored(&self) -> bool {
        match self {
            Self::Stdout(w) => w.is_write_vectored(),
            Self::Stderr(w) => w.is_write_vectored(),
        }
    }

    #[inline]
    fn flush(&mut self) -> io::Result<()> {
        match self {
            Self::Stdout(w) => w.flush(),
            Self::Stderr(w) => w.flush(),
        }
    }

    #[inline]
    fn write_all(&mut self, buf: &[u8]) -> io::Result<()> {
        match self {
            Self::Stdout(w) => w.write_all(buf),
            Self::Stderr(w) => w.write_all(buf),
        }
    }

    #[inline]
    fn write_all_vectored(&mut self, bufs: &mut [io::IoSlice<'_>]) -> io::Result<()> {
        match self {
            Self::Stdout(w) => w.write_all_vectored(bufs),
            Self::Stderr(w) => w.write_all_vectored(bufs),
        }
    }

    #[inline]
    fn write_fmt(&mut self, fmt: std::fmt::Arguments<'_>) -> io::Result<()> {
        match self {
            Self::Stdout(w) => w.write_fmt(fmt),
            Self::Stderr(w) => w.write_fmt(fmt),
        }
    }
}
