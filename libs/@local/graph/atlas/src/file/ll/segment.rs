use zerocopy::{LE, U32};

use crate::integrity::Checksum;

struct DirectorySegment {}

impl DirectorySegment {
    const CHECKSUM_SIZE: u32 = Checksum::SIZE;
    const PAYLOAD_SIZE: u32 = Self::SIZE - Self::CHECKSUM_SIZE;
    const SIZE: u32 = 4096;
}
