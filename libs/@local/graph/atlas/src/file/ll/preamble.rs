use core::mem;

use zerocopy::{LE, U32, U64};

use super::salt::SaltHeader;
use crate::integrity::Checksum;

#[derive(
    Debug,
    PartialEq,
    zerocopy::TryFromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(C)]
struct Preamble<T> {
    variant: T,
    directory_len: U32<LE>,
    total_entry_count: U64<LE>,
    container_len: U64<LE>,
    _reserved: [u8; 4056],
    checksum: Checksum,
}

type SaltPreamble = Preamble<SaltHeader>;
