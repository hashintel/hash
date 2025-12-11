use std::io;

use bstr::ByteSlice as _;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum OutputFormat {
    #[default]
    Human,
    Json,
}

pub(crate) fn escape_json(mut write: impl io::Write, value: &str) -> io::Result<()> {
    let mut slice = value.as_bytes();

    while let Some(pos) = slice.find_byteset([0x22, 0x5C, 0x2F, 0x08, 0x09, 0x0A, 0x0C, 0x0D]) {
        let (head, tail) = slice.split_at(pos);
        write.write_all(head)?;

        let [escape, rest @ ..] = tail else {
            unreachable!()
        };

        match escape {
            0x22 => write.write_all(b"\\\"")?,
            0x5C => write.write_all(b"\\\\")?,
            0x2F => write.write_all(b"\\/")?,
            0x08 => write.write_all(b"\\b")?,
            0x09 => write.write_all(b"\\t")?,
            0x0A => write.write_all(b"\\n")?,
            0x0C => write.write_all(b"\\f")?,
            0x0D => write.write_all(b"\\r")?,
            _ => unreachable!(),
        }

        slice = rest;
    }

    write.write_all(slice)
}
