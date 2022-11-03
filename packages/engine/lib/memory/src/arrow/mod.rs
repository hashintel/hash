//! Contains structures to store the Apache Arrow memory-format in shared memory, and functions for
//! converting between Arrow and JSON.
//!
//! Also provides an FFI module to interact with the Arrow data.
//!
//! # What _is_ Arrow?
//!
//! Arrow is an in-memory format for storing columnar data. There are already a lot of good
//! resources explaining how Arrow works, so we won't duplicate those explanations here, and instead
//! just list them
//!
//! - [Arrow2's guide](https://jorgecarleitao.github.io/arrow2/)
//! - [Notes on Arrow](https://wesm.github.io/arrow-site-test/)
//! - [The Arrow specification](https://arrow.apache.org/docs/format/Columnar.html)

pub mod flush;
pub mod ipc;
pub mod meta;
pub mod record_batch;
pub mod util;

pub(crate) mod array_buffer_count;
mod batch;
mod buffer;
mod change;
mod conversion;
mod ffi;

pub use self::{
    batch::{columns::column_with_name_from_record_batch, ArrowBatch},
    buffer::{new_buffer, new_offsets_buffer, new_zero_bits},
    change::{ColumnChange, IntoArrowChange},
    conversion::{
        col_to_json_vals, json_utf8_json_vals, json_vals_to_any_type_col, json_vals_to_bool,
        json_vals_to_col, json_vals_to_primitive, json_vals_to_utf8,
    },
};
