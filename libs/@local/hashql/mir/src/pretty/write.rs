use std::io;

pub(crate) trait WriteValue<V> {
    fn write_value(&mut self, value: V) -> io::Result<()>;
}
