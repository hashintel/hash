use std::io::{self, Stderr, Stdout};

use tracing_subscriber::fmt::{MakeWriter, TestWriter};

pub(crate) enum ConsoleMakeWriter {
    Stdout,
    Stderr,
    Test,
}

impl<'writer> MakeWriter<'writer> for ConsoleMakeWriter {
    type Writer = ConsoleWriter;

    fn make_writer(&'writer self) -> Self::Writer {
        match self {
            Self::Stdout => ConsoleWriter::Stdout(io::stdout()),
            Self::Stderr => ConsoleWriter::Stderr(io::stderr()),
            Self::Test => ConsoleWriter::Test(TestWriter::default()),
        }
    }
}

pub(crate) enum ConsoleWriter {
    Stdout(Stdout),
    Stderr(Stderr),
    Test(TestWriter),
}

impl io::Write for ConsoleWriter {
    #[inline]
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        match self {
            Self::Stdout(w) => w.write(buf),
            Self::Stderr(w) => w.write(buf),
            Self::Test(w) => w.write(buf),
        }
    }

    #[inline]
    fn write_vectored(&mut self, bufs: &[io::IoSlice<'_>]) -> io::Result<usize> {
        match self {
            Self::Stdout(w) => w.write_vectored(bufs),
            Self::Stderr(w) => w.write_vectored(bufs),
            Self::Test(w) => w.write_vectored(bufs),
        }
    }

    #[inline]
    fn is_write_vectored(&self) -> bool {
        match self {
            Self::Stdout(w) => w.is_write_vectored(),
            Self::Stderr(w) => w.is_write_vectored(),
            Self::Test(w) => w.is_write_vectored(),
        }
    }

    #[inline]
    fn flush(&mut self) -> io::Result<()> {
        match self {
            Self::Stdout(w) => w.flush(),
            Self::Stderr(w) => w.flush(),
            Self::Test(w) => w.flush(),
        }
    }

    #[inline]
    fn write_all(&mut self, buf: &[u8]) -> io::Result<()> {
        match self {
            Self::Stdout(w) => w.write_all(buf),
            Self::Stderr(w) => w.write_all(buf),
            Self::Test(w) => w.write_all(buf),
        }
    }

    #[inline]
    fn write_all_vectored(&mut self, bufs: &mut [io::IoSlice<'_>]) -> io::Result<()> {
        match self {
            Self::Stdout(w) => w.write_all_vectored(bufs),
            Self::Stderr(w) => w.write_all_vectored(bufs),
            Self::Test(w) => w.write_all_vectored(bufs),
        }
    }

    #[inline]
    fn write_fmt(&mut self, fmt: core::fmt::Arguments<'_>) -> io::Result<()> {
        match self {
            Self::Stdout(w) => w.write_fmt(fmt),
            Self::Stderr(w) => w.write_fmt(fmt),
            Self::Test(w) => w.write_fmt(fmt),
        }
    }
}
