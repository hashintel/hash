//! Contains structures to store the Apache Arrow memory-format in shared memory, and functions for
//! converting between Arrow and JSON.
//!
//! Also provides an FFI module to interact with the Arrow data.
pub mod flush;
pub mod ipc;
pub mod load;
pub mod meta;

mod batch;
mod change;
mod conversion;
mod ffi;

pub use self::{
    batch::{column_with_name, ArrowBatch},
    change::ColumnChange,
    conversion::{
        col_to_json_vals, json_utf8_json_vals, json_vals_to_any_type_col, json_vals_to_bool,
        json_vals_to_col, json_vals_to_primitive, json_vals_to_utf8, new_buffer,
        new_offsets_buffer, new_zero_bits,
    },
};
