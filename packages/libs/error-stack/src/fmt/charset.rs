#[cfg(feature = "detect")]
use core::sync::atomic::{AtomicU8, Ordering};

use owo_colors::Stream;

#[derive(Debug, Copy, Clone)]
pub enum Charset {
    Utf8,
    Ascii,
}

#[cfg(feature = "detect")]
pub(crate) fn on_cached(stream: Stream) -> bool {
    if let Some(supports) = SUPPORTS.load(stream) {
        return supports;
    }

    let supports = supports_unicode::on(stream);
    SUPPORTS.store(stream, supports);

    supports
}

/// Saves a cached version of the support, the value layout is:
///
/// `XX EE OO II`
///
/// * `X`: reserved/unused
/// * `E`: `stderr`
/// * `O`: `stdout`
/// * `I`: `stdin`
///
/// for each:
/// * `0b11` OR `0b10`: uncached
/// * `0b00`: false
/// * `0b01`: true
#[cfg(feature = "detect")]
struct AtomicSupport(AtomicU8);

#[cfg(feature = "detect")]
impl AtomicSupport {
    const fn new() -> Self {
        Self(AtomicU8::new(0xFF))
    }

    fn shift(stream: Stream) -> u8 {
        match stream {
            Stream::Stdin => 0,
            Stream::Stdout => 2,
            Stream::Stderr => 4,
        }
    }

    fn store(&self, stream: Stream, value: bool) {
        let shift = Self::shift(stream);
        let mut inner = self.0.load(Ordering::Relaxed);

        // erase the bits that we wanna set
        inner &= (0xFF ^ (0b11 << shift));
        // set the bits
        inner |= u8::from(value) << shift;

        self.0.store(inner, Ordering::Relaxed);
    }

    fn load(&self, stream: Stream) -> Option<bool> {
        let shift = Self::shift(stream);
        let inner = self.0.load(Ordering::Relaxed);

        // get the value at the requested shift position, and make sure that we only consider those
        // two bytes
        let value = (inner >> shift) & 0b11;

        match value {
            0b00 => Some(false),
            0b01 => Some(true),
            // in theory this can only be `0b10` or `0b11`
            _ => None,
        }
    }
}

#[cfg(feature = "detect")]
static SUPPORTS: AtomicSupport = AtomicSupport::new();
