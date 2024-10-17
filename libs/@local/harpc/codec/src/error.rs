use core::marker::PhantomData;

use bytes::{Buf, BufMut, Bytes, BytesMut};
use harpc_types::error_code::ErrorCode;

use self::kind::ErrorKind;

/// An error that is has been fully encoded and can be sent or received over the network.
///
/// Essentially a compiled version of a `NetworkError` or `Report<C>` into it's wire format.
///
/// An `EncodedError` is constructed through the `ErrorBuffer`.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct EncodedError {
    code: ErrorCode,
    bytes: Bytes,
}

impl EncodedError {
    pub fn new(code: ErrorCode, bytes: Bytes) -> Option<Self> {
        let &first = bytes.first()?;

        kind::Tag::variants()
            .into_iter()
            .any(|tag| tag as u8 == first)
            .then(|| Self { code, bytes })
    }

    pub const fn code(&self) -> ErrorCode {
        self.code
    }

    pub const fn bytes(&self) -> &Bytes {
        &self.bytes
    }

    pub fn into_parts(self) -> (ErrorCode, Bytes) {
        (self.code, self.bytes)
    }
}

pub trait NetworkError {
    fn code(&self) -> ErrorCode;
}

impl<T> NetworkError for T
where
    T: core::error::Error,
{
    fn code(&self) -> ErrorCode {
        core::error::request_ref::<ErrorCode>(self)
            .copied()
            .or_else(|| core::error::request_value::<ErrorCode>(self))
            .unwrap_or(ErrorCode::INTERNAL_SERVER_ERROR)
    }
}

pub mod kind {
    #[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
    #[repr(u8)]
    pub enum Tag {
        NetworkError = 0x01,
        Report = 0x02,
        Recovery = 0xFF,
    }

    impl Tag {
        pub(crate) fn variants() -> impl IntoIterator<Item = Self> {
            [Self::NetworkError, Self::Report, Self::Recovery]
        }

        #[must_use]
        pub const fn from_u8(value: u8) -> Option<Self> {
            match value {
                0x01 => Some(Self::NetworkError),
                0x02 => Some(Self::Report),
                0xFF => Some(Self::Recovery),
                _ => None,
            }
        }
    }

    pub trait ErrorKind {
        fn tag() -> Tag;
    }

    pub struct NetworkError {
        _private: (),
    }
    impl ErrorKind for NetworkError {
        fn tag() -> Tag {
            Tag::NetworkError
        }
    }

    pub struct Report {
        _private: (),
    }

    impl ErrorKind for Report {
        fn tag() -> Tag {
            Tag::Report
        }
    }

    pub struct Recovery {
        _private: (),
    }

    impl ErrorKind for Recovery {
        fn tag() -> Tag {
            Tag::Recovery
        }
    }
}

pub struct ErrorBuffer<T> {
    kind: PhantomData<fn() -> *const T>,
    buffer: BytesMut,
}

impl<T> ErrorBuffer<T>
where
    T: ErrorKind,
{
    fn new() -> Self {
        let mut buffer = BytesMut::new();
        buffer.put_u8(T::tag() as u8);

        Self {
            kind: PhantomData,
            buffer,
        }
    }

    #[must_use]
    pub fn finish(self, code: ErrorCode) -> EncodedError {
        EncodedError {
            code,
            bytes: self.buffer.freeze(),
        }
    }
}

impl ErrorBuffer<kind::NetworkError> {
    #[must_use]
    pub fn error() -> Self {
        Self::new()
    }
}

impl ErrorBuffer<kind::Report> {
    #[must_use]
    pub fn report() -> Self {
        Self::new()
    }
}

impl ErrorBuffer<kind::Recovery> {
    #[must_use]
    pub fn recovery() -> Self {
        Self::new()
    }
}

impl<T> Buf for ErrorBuffer<T> {
    fn remaining(&self) -> usize {
        self.buffer.remaining()
    }

    fn chunk(&self) -> &[u8] {
        self.buffer.chunk()
    }

    fn advance(&mut self, cnt: usize) {
        self.buffer.advance(cnt);
    }

    // These methods are specialized in the underlying `Bytes` implementation, relay them as well

    fn copy_to_bytes(&mut self, len: usize) -> Bytes {
        self.buffer.copy_to_bytes(len)
    }
}

#[expect(
    unsafe_code,
    reason = "delegating to the underlying `BytesMut` implementation"
)]
// SAFETY: we are delegating to the underlying `BytesMut` implementation
unsafe impl<T> BufMut for ErrorBuffer<T> {
    fn remaining_mut(&self) -> usize {
        self.buffer.remaining_mut()
    }

    unsafe fn advance_mut(&mut self, cnt: usize) {
        // SAFETY: This is safe, as we are delegating to the underlying `BytesMut` implementation
        unsafe {
            self.buffer.advance_mut(cnt);
        }
    }

    fn chunk_mut(&mut self) -> &mut bytes::buf::UninitSlice {
        self.buffer.chunk_mut()
    }

    // These methods are specialized in the underlying `BytesMut` implementation, relay them as well

    fn put<B: Buf>(&mut self, src: B)
    where
        Self: Sized,
    {
        self.buffer.put(src);
    }

    fn put_slice(&mut self, src: &[u8]) {
        self.buffer.put_slice(src);
    }

    fn put_bytes(&mut self, val: u8, cnt: usize) {
        self.buffer.put_bytes(val, cnt);
    }
}
