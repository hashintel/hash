/// Internal representation of Arrow `Buffer` Message with padding included
#[derive(Debug, Clone, Eq, PartialEq)]
pub struct Buffer {
    /// Offset from data_buffer start (beginning of first column)
    pub offset: usize,
    /// Byte-length of the memory buffer
    pub length: usize,
    /// Byte-length of the memory buffer's padding
    pub padding: usize,
}

static NULL_BUFFER: Buffer = Buffer {
    offset: 0,
    length: 0,
    padding: 0,
};

impl Buffer {
    #[must_use]
    pub fn new(offset: usize, length: usize, padding: usize) -> Buffer {
        Buffer {
            offset,
            length,
            padding,
        }
    }

    #[must_use]
    pub fn null() -> &'static Buffer {
        &NULL_BUFFER
    }

    #[must_use]
    pub fn get_next_offset(&self) -> usize {
        self.offset + self.length + self.padding
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BufferType {
    /// This buffer contains the null bitmap of the node or is just binary data
    BitMap { is_null_bitmap: bool },
    /// This buffer contains i32 offsets
    Offset,
    /// This buffer contains i64 offsets (currently not implemented)
    // TODO: UNUSED: Needs triage
    LargeOffset,
    /// This buffer contains fixed-size (byte-level) data
    Data {
        // Note that for f64, it is 8, while for fixed size lists of f64 it's a multiple
        unit_byte_size: usize,
    },
}

/// When mutable sized buffers are resized/moved/overwritten, this
/// is used to calculate positions and potential resizes to shared buffers
#[allow(dead_code)]
pub enum BufferAction<'a> {
    Move {
        old_offset: usize,
        old_total_length: usize,
        new_offset: usize,
        first_index: usize,
        last_index: usize,
    },
    Owned {
        index: usize,
        offset: usize,
        padding: usize,
        buffer: Vec<u8>,
    },
    Ref {
        index: usize,
        offset: usize,
        padding: usize,
        buffer: &'a [u8],
    },
}
