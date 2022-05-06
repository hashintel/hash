use memory::arrow::meta::{
    util::DataSliceUtils, Buffer, ColumnDynamicMetadata, ColumnDynamicMetadataBuilder,
};
use stateful::context::ContextColumnWriter;

use crate::package::simulation::context::api_requests::response::ApiResponses;

const NUM_NODES: usize = 5;
const NUM_BUFFERS: usize = 12;

impl ContextColumnWriter for ApiResponses<'_> {
    fn dynamic_metadata(&self) -> stateful::Result<ColumnDynamicMetadata> {
        let mut builder = ColumnDynamicMetadataBuilder::with_capacities(NUM_NODES, NUM_BUFFERS);

        // List of Structs
        let num_agents = self.data.data.len();
        builder.add_node(num_agents, 0);
        builder.add_static_bit_buffer(num_agents); // Null buffer for List of structs
        builder.add_static_byte_buffer((num_agents + 1) * 4); // Offsets for List of structs

        // Struct
        let num_messages = self.msg_count;
        builder.add_node(num_messages, 0);
        builder.add_static_bit_buffer(num_messages); // Null buffer for Struct

        // Fields
        builder.add_string_array_dynamic_meta(num_messages, self.from.char_count);
        builder.add_string_array_dynamic_meta(num_messages, self.r#type.char_count);
        builder.add_string_array_dynamic_meta(num_messages, self.data.char_count);
        Ok(builder.finish())
    }

    fn write(&self, mut data: &mut [u8], meta: &ColumnDynamicMetadata) -> stateful::Result<()> {
        // Null buffer
        data.from_offset(&meta.buffers[0]).fill_with_ones();

        // Offsets
        data.from_offset(&meta.buffers[1])
            .write_i32_offsets_from_iter(self.from.data.iter().map(Vec::len));
        // Null buffer
        data.from_offset(&meta.buffers[2]).fill_with_ones();

        // From
        write_string_list_inner_column_unchecked(
            self.from.data.iter(),
            self.from
                .data
                .iter()
                .flat_map(|v| v.iter().map(|v| v.len())),
            data,
            &meta.buffers,
            3,
        );
        // Type
        write_string_list_inner_column_unchecked(
            self.r#type.data.iter(),
            self.r#type
                .data
                .iter()
                .flat_map(|v| v.iter().map(|v| v.len())),
            data,
            &meta.buffers,
            6,
        );
        // Data
        write_string_list_inner_column_unchecked(
            self.data.data.iter(),
            self.data
                .data
                .iter()
                .flat_map(|v| v.iter().map(|v| v.len())),
            data,
            &meta.buffers,
            9,
        );
        Ok(())
    }
}

fn write_string_list_inner_column_unchecked<'a, K: AsRef<str> + 'a>(
    data: impl Iterator<Item = &'a Vec<K>>,
    offsets: impl Iterator<Item = usize>,
    mut data_slice: &mut [u8],
    buffers: &[Buffer],
    start_index: usize,
) {
    // Null buffer
    data_slice
        .from_offset(&buffers[start_index])
        .fill_with_ones();
    // Offsets
    data_slice
        .from_offset(&buffers[start_index + 1])
        .write_i32_offsets_from_iter(offsets);
    // Data
    let dest = data_slice.from_offset(&buffers[start_index + 2]);

    let mut offset = 0;
    data.flat_map(|v| v.iter()).for_each(|v| {
        let v = v.as_ref();
        let string_size = v.len();
        dest[offset..offset + string_size].copy_from_slice(v.as_bytes());
        offset += string_size;
    });
}
