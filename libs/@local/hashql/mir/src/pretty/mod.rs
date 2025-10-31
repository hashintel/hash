use crate::body::Body;

mod text;

pub trait PrettyPrinter<'buf> {
    fn from_buffer(buffer: &'buf mut Vec<u8>) -> Self;

    fn pretty_body(&mut self, body: &Body);
}
