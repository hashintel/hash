//! This module handles writing Arrow data as raw bytes. We would use the types which [`arrow2`]
//! provides, except that they do not provide a way to write the different components of a message
//! to seperate sections.
//!
//! IMPORTANT: do not feed the items in this module untrusted data (it might be ok, but they haven't
//! been explicitly designed to do so).
//!
//! Note that "length" is used somewhat ambigously - sometimes we are referring to the number of
//! _elements_ in an array, but sometimes to the number of _bytes_. If anything is unclear please
//! update the naming of items and/or their documentation.
//!
//! # Further reading
//! - [This explanation of the IPC format](https://wesm.github.io/arrow-site-test/format/IPC.html)

use arrow2::io::ipc::write::{default_ipc_fields, schema_to_bytes};

use super::record_batch::RecordBatch;

pub mod read;
pub mod write;

/// Contains code taken from arrow2 (and slightly modified) to allow us to write arrays.
pub(crate) mod serialize;

#[cfg(test)]
mod test;

pub use read::*;
pub use write::*;

/// Calculates the number of bytes that the schema occupies.
///
/// For convenience, this is how the Arrow format works (taken from <https://wesm.github.io/arrow-site-test>)
/// ```ignore
/// <continuation: 0xFFFFFFFF>
/// <metadata_size: int32>
/// <metadata_flatbuffer: bytes>
/// <padding>
/// <message body>
/// ```
pub fn calculate_schema_size(record_batch: &RecordBatch) -> usize {
    let ipc_fields = default_ipc_fields(&record_batch.schema().fields);

    let schema = schema_to_bytes(&record_batch.schema(), &ipc_fields);
    schema.len()
}
