use std::io::Cursor;

use bytes::{Buf, BufMut, Bytes};
use error_stack::{Report, Result};

pub(crate) trait Number {
    const WIDTH: usize;

    fn unchecked_read_from_buf<B>(buf: B) -> Self
    where
        B: Buf;

    fn unchecked_write_to_buf<B>(self, buf: B)
    where
        B: BufMut;
}

impl Number for u8 {
    const WIDTH: usize = 1;

    fn unchecked_read_from_buf<B>(mut buf: B) -> Self
    where
        B: Buf,
    {
        buf.get_u8()
    }

    fn unchecked_write_to_buf<B>(self, mut buf: B)
    where
        B: BufMut,
    {
        buf.put_u8(self);
    }
}

impl Number for u16 {
    const WIDTH: usize = 2;

    fn unchecked_read_from_buf<B>(mut buf: B) -> Self
    where
        B: Buf,
    {
        buf.get_u16()
    }

    fn unchecked_write_to_buf<B>(self, mut buf: B)
    where
        B: BufMut,
    {
        buf.put_u16(self);
    }
}

impl Number for u32 {
    const WIDTH: usize = 4;

    fn unchecked_read_from_buf<B>(mut buf: B) -> Self
    where
        B: Buf,
    {
        buf.get_u32()
    }

    fn unchecked_write_to_buf<B>(self, mut buf: B)
    where
        B: BufMut,
    {
        buf.put_u32(self);
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, thiserror::Error)]
pub enum BufferError {
    #[error("early end of stream")]
    EarlyEndOfStream,
    #[error("not enough capacity to write to buffer")]
    NotEnoughCapacity,
}

pub struct Buffer<'a, B>(&'a mut B);

impl<'a, B> Buffer<'a, B> {
    pub fn new(buffer: &'a mut B) -> Self {
        Self(buffer)
    }
}

impl<'a, B> Buffer<'a, B>
where
    B: Buf,
{
    pub(crate) fn next_number<N: Number>(&mut self) -> Result<N, BufferError> {
        if self.0.remaining() < N::WIDTH {
            return Err(Report::new(BufferError::EarlyEndOfStream));
        }

        Ok(N::unchecked_read_from_buf(&mut self.0))
    }

    pub(crate) fn next_bytes(&mut self, at: usize) -> Result<Bytes, BufferError> {
        if self.0.remaining() < at {
            return Err(Report::new(BufferError::EarlyEndOfStream));
        }

        Ok(self.0.copy_to_bytes(at))
    }

    pub(crate) fn next_array<const N: usize>(&mut self) -> Result<[u8; N], BufferError> {
        if self.0.remaining() < N {
            return Err(Report::new(BufferError::EarlyEndOfStream));
        }

        let mut bytes = [0; N];
        self.0.copy_to_slice(&mut bytes);

        Ok(bytes)
    }

    pub(crate) fn discard(&mut self, count: usize) -> Result<(), BufferError> {
        if self.0.remaining() < count {
            return Err(Report::new(BufferError::EarlyEndOfStream));
        }

        self.0.advance(count);

        Ok(())
    }
}

impl<'a, B> Buffer<'a, B>
where
    B: BufMut,
{
    pub(crate) fn push_number<N: Number>(&mut self, number: N) -> Result<(), BufferError> {
        if self.0.remaining_mut() < N::WIDTH {
            return Err(Report::new(BufferError::NotEnoughCapacity));
        }

        number.unchecked_write_to_buf(&mut self.0);

        Ok(())
    }

    pub(crate) fn push_bytes(&mut self, bytes: &Bytes) -> Result<(), BufferError> {
        if self.0.remaining_mut() < bytes.len() {
            return Err(Report::new(BufferError::NotEnoughCapacity));
        }

        let cursor = Cursor::new(bytes);

        self.0.put(cursor);

        Ok(())
    }

    pub(crate) fn push_slice(&mut self, slice: &[u8]) -> Result<(), BufferError> {
        if self.0.remaining_mut() < slice.len() {
            return Err(Report::new(BufferError::NotEnoughCapacity));
        }

        self.0.put_slice(slice);

        Ok(())
    }

    pub(crate) fn push_repeat(&mut self, byte: u8, count: usize) -> Result<(), BufferError> {
        if self.0.remaining_mut() < count {
            return Err(Report::new(BufferError::NotEnoughCapacity));
        }

        self.0.put_bytes(byte, count);

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use bytes::Bytes;

    use super::Buffer;
    use crate::codec::BufferError;

    #[test]
    fn next() {
        let bytes = [1_u8, 2, 3, 4];

        let mut pointer = &bytes[..];
        let number = Buffer::new(&mut pointer)
            .next_number::<u8>()
            .expect("should have enough remaining capacity");
        assert_eq!(number, 1);

        let mut pointer = &bytes[..];
        let number = Buffer::new(&mut pointer)
            .next_number::<u16>()
            .expect("should have enough remaining capacity");
        assert_eq!(number, 0x01_02);

        let mut pointer = &bytes[..];
        let number = Buffer::new(&mut pointer)
            .next_number::<u32>()
            .expect("should have enough remaining capacity");
        assert_eq!(number, 0x01_02_03_04);

        let mut pointer = &bytes[..];
        let output = Buffer::new(&mut pointer)
            .next_bytes(4)
            .expect("should have enough remaining capacity");
        assert_eq!(output, Bytes::from_static(&[1, 2, 3, 4]));

        let mut pointer = &bytes[..];
        let output = Buffer::new(&mut pointer)
            .next_array::<4>()
            .expect("should have enough remaining capacity");
        assert_eq!(output, [1, 2, 3, 4]);

        let mut pointer = &bytes[..];
        Buffer::new(&mut pointer)
            .discard(4)
            .expect("should have enough remaining capacity");
        assert_eq!(pointer.len(), 0);
    }

    #[test]
    fn next_eof() {
        let bytes = [1_u8, 2, 3, 4];

        let mut pointer = &bytes[..0];
        let report = Buffer::new(&mut pointer)
            .next_number::<u8>()
            .expect_err("should not have enough remaining capacity");
        assert_eq!(report.current_context(), &BufferError::EarlyEndOfStream);

        let mut pointer = &bytes[..1];
        let report = Buffer::new(&mut pointer)
            .next_number::<u16>()
            .expect_err("should not have enough remaining capacity");
        assert_eq!(report.current_context(), &BufferError::EarlyEndOfStream);

        let mut pointer = &bytes[..3];
        let report = Buffer::new(&mut pointer)
            .next_number::<u32>()
            .expect_err("should not have enough remaining capacity");
        assert_eq!(report.current_context(), &BufferError::EarlyEndOfStream);

        let mut pointer = &bytes[..3];
        let report = Buffer::new(&mut pointer)
            .next_bytes(4)
            .expect_err("should not have enough remaining capacity");
        assert_eq!(report.current_context(), &BufferError::EarlyEndOfStream);

        let mut pointer = &bytes[..3];
        let report = Buffer::new(&mut pointer)
            .next_array::<4>()
            .expect_err("should not have enough remaining capacity");
        assert_eq!(report.current_context(), &BufferError::EarlyEndOfStream);

        let mut pointer = &bytes[..3];
        let report = Buffer::new(&mut pointer)
            .discard(4)
            .expect_err("should not have enough remaining capacity");
        assert_eq!(report.current_context(), &BufferError::EarlyEndOfStream);
    }

    #[test]
    fn push() {
        let mut bytes = [0_u8; 4];

        let mut pointer = &mut bytes[..];
        Buffer::new(&mut pointer)
            .push_number(1_u8)
            .expect("should have enough remaining capacity");
        assert_eq!(bytes, [1, 0, 0, 0]);

        let mut pointer = &mut bytes[..];
        Buffer::new(&mut pointer)
            .push_number(1_u16)
            .expect("should have enough remaining capacity");
        assert_eq!(bytes, [0, 1, 0, 0]);

        let mut pointer = &mut bytes[..];
        Buffer::new(&mut pointer)
            .push_number(1_u32)
            .expect("should have enough remaining capacity");
        assert_eq!(bytes, [0, 0, 0, 1]);

        let mut pointer = &mut bytes[..];
        Buffer::new(&mut pointer)
            .push_bytes(&Bytes::from_static(&[1, 2, 3, 4]))
            .expect("should have enough remaining capacity");
        assert_eq!(bytes, [1, 2, 3, 4]);

        let mut pointer = &mut bytes[..];
        Buffer::new(&mut pointer)
            .push_slice(&[5, 6, 7, 8])
            .expect("should have enough remaining capacity");
        assert_eq!(bytes, [5, 6, 7, 8]);

        let mut pointer = &mut bytes[..];
        Buffer::new(&mut pointer)
            .push_repeat(9, 4)
            .expect("should have enough remaining capacity");
        assert_eq!(bytes, [9, 9, 9, 9]);
    }

    #[test]
    fn push_eof() {
        let mut bytes = [0_u8; 4];

        let mut pointer = &mut bytes[..0];
        let report = Buffer::new(&mut pointer)
            .push_number(1_u8)
            .expect_err("should not have enough remaining capacity");
        assert_eq!(report.current_context(), &BufferError::NotEnoughCapacity);

        let mut pointer = &mut bytes[..1];
        let report = Buffer::new(&mut pointer)
            .push_number(1_u16)
            .expect_err("should have enough remaining capacity");
        assert_eq!(report.current_context(), &BufferError::NotEnoughCapacity);

        let mut pointer = &mut bytes[..3];
        let report = Buffer::new(&mut pointer)
            .push_number(1_u32)
            .expect_err("should have enough remaining capacity");
        assert_eq!(report.current_context(), &BufferError::NotEnoughCapacity);

        let mut pointer = &mut bytes[..2];
        let report = Buffer::new(&mut pointer)
            .push_bytes(&Bytes::from_static(&[1, 2, 3]))
            .expect_err("should have enough remaining capacity");
        assert_eq!(report.current_context(), &BufferError::NotEnoughCapacity);

        let mut pointer = &mut bytes[..2];
        let report = Buffer::new(&mut pointer)
            .push_slice(&[1, 2, 3])
            .expect_err("should have enough remaining capacity");
        assert_eq!(report.current_context(), &BufferError::NotEnoughCapacity);

        let mut pointer = &mut bytes[..2];
        let report = Buffer::new(&mut pointer)
            .push_repeat(1, 3)
            .expect_err("should have enough remaining capacity");
        assert_eq!(report.current_context(), &BufferError::NotEnoughCapacity);
    }
}
