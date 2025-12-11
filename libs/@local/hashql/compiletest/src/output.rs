use std::io;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum OutputFormat {
    #[default]
    Human,
    Json,
}

pub(crate) fn escape_json(mut write: impl io::Write, value: &str) -> io::Result<()> {
    let mut slice = value.as_bytes();

    // Using `iter().position()` here is actually the most efficient way to find the next escape
    // character, both lookup tables and unsafe code versions will result in worse performance.
    while let Some(pos) = slice
        .iter()
        .position(|&byte| (byte == 0x22) || (byte == 0x5C) || (byte < 0x20))
    {
        let (head, tail) = slice.split_at(pos);
        write.write_all(head)?;

        let [escape, rest @ ..] = tail else {
            unreachable!()
        };

        match escape {
            0x22 => write.write_all(b"\\\"")?,
            0x5C => write.write_all(b"\\\\")?,
            0x08 => write.write_all(b"\\b")?,
            0x09 => write.write_all(b"\\t")?,
            0x0A => write.write_all(b"\\n")?,
            0x0C => write.write_all(b"\\f")?,
            0x0D => write.write_all(b"\\r")?,
            byte => write!(write, "\\u{byte:04X}")?,
        }

        slice = rest;
    }

    write.write_all(slice)
}
