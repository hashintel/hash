use std::io;

use crate::body::Body;

mod text;

pub trait PrettyPrinter<W>
where
    W: io::Write,
{
    fn from_writer(writer: W) -> Self;
    fn into_writer(self) -> W;

    fn pretty_body(&mut self, body: &Body) -> io::Result<()>;
}
