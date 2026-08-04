use std::{
    collections::HashMap,
    io::{self, Write as _},
};

use fst::MapBuilder;
use hashql_core::id::{Id, IdSlice};
use zerocopy::IntoBytes;

use super::{KeyKind, Kind};
use crate::file::{
    identity2::{FileHeader, PaddedFileHeader},
    region::{ByteStable, PAGE, write_padding, write_region},
};

unsafe trait Key: ByteStable {
    type Id: Id;
    type Auxiliary: zerocopy::IntoBytes + zerocopy::Immutable;
    const KIND: KeyKind;
}

struct PositionalWriter<W> {
    writer: W,
    offset: u64,
}

impl<W> PositionalWriter<W> {
    const fn new(writer: W) -> Self {
        Self { writer, offset: 0 }
    }
}

impl<W> io::Write for PositionalWriter<W>
where
    W: io::Write,
{
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let len = buf.len();
        self.writer.write(buf)?;
        self.offset += len as u64;
        Ok(len)
    }

    fn write_all(&mut self, buf: &[u8]) -> io::Result<()> {
        let len = buf.len();
        self.writer.write_all(buf)?;
        self.offset += len as u64;
        Ok(())
    }

    fn flush(&mut self) -> io::Result<()> {
        self.writer.flush()
    }
}

pub(crate) fn write_regions<K>(
    kind: Kind,
    keys: &IdSlice<K::Id, K>,
    auxiliary: &IdSlice<K::Id, K::Auxiliary>,
    write: impl io::Write,
) -> io::Result<()>
where
    K: Key,
{
    let mut write = PositionalWriter::new(write);
    debug_assert_eq!(keys.len(), auxiliary.len());

    // We do progressive caching/interning
    let mut interner = HashMap::<&[u8], (u64, u64)>::new();
    let mut scratch = Vec::new(); // TODO: I feel like there's a way we can get rid of this?

    let header = FileHeader::new(kind, keys.len() as u64, K::KIND);

    write_region(&mut write, PaddedFileHeader::new(header).as_bytes())?;
    write_region(&mut write, keys.as_bytes())?;

    let initial_offset = write.offset;
    let mut builder = MapBuilder::new(&mut write).unwrap();
    for (id, aux) in auxiliary.iter_enumerated() {
        builder.insert(aux.as_bytes(), id.as_u64()).unwrap();
    }
    builder.finish().unwrap();

    let map_length = write.offset - initial_offset;
    write_padding(&mut write, map_length)?;

    let file_offset = write.offset;
    let expected_length = size_of::<[u64; 2]>() as u64 * auxiliary.len() as u64;
    let next_boundary = expected_length.next_multiple_of(PAGE);

    let mut bytes_written = 0_u64;
    for aux in auxiliary {
        let &mut (offset, len) = interner.entry(aux.as_bytes()).or_insert_with(|| {
            let offset = scratch.len();
            let len = aux.as_bytes().len();
            scratch.extend(aux.as_bytes());

            (offset as u64, len as u64)
        });

        let entry = [file_offset + next_boundary + offset, len];
        write.write_all(entry.as_bytes())?;
        bytes_written += entry.as_bytes().len() as u64;
    }

    debug_assert_eq!(bytes_written, expected_length);
    write_padding(&mut write, bytes_written)?;

    write_region(&mut write, &scratch)?;

    Ok(())
}
