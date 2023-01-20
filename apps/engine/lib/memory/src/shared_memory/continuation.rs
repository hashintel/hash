pub const CONTINUATION: usize = 8;

#[must_use]
pub(crate) fn buffer_without_continuation(buf: &[u8]) -> &[u8] {
    &buf[CONTINUATION..]
}

#[must_use]
pub fn arrow_continuation(len: usize) -> Vec<u8> {
    let mut data_vec = Vec::with_capacity(CONTINUATION);
    data_vec.extend_from_slice(&[255, 255, 255, 255]);
    data_vec.extend_from_slice(&(len as u32).to_le_bytes());
    data_vec
}
