//! Variant names read from an enum's definition when the crate compiles.

use core::{any::TypeId, mem, str};

/// The longest variant name [`VariantName`] holds, in bytes.
const MAX_VARIANT_NAME_BYTES: usize = 32;

/// A variant name in camelCase, kept in a fixed buffer so that a constant can hold it.
#[derive(Debug, Clone, Copy)]
pub(crate) struct VariantName {
    bytes: [u8; MAX_VARIANT_NAME_BYTES],
    len: usize,
}

impl VariantName {
    /// Returns the name of each variant of `T` in declaration order, with its first letter
    /// lowercased.
    ///
    /// `N` must be the number of variants of `T`, and each name at most 32 bytes. Either mistake
    /// fails the build.
    pub(crate) const fn camel_case<T: 'static, const N: usize>() -> [Self; N] {
        const {
            assert!(
                N == mem::variant_count::<T>(),
                "`N` should be the number of variants"
            );

            let id = TypeId::of::<T>();
            let mut names = [Self {
                bytes: [0; MAX_VARIANT_NAME_BYTES],
                len: 0,
            }; N];
            let mut index = 0;
            while index < N {
                let name = id.variant(index).name().as_bytes();
                assert!(
                    name.len() <= MAX_VARIANT_NAME_BYTES,
                    "a variant name should be at most 32 bytes"
                );

                let mut byte = 0;
                while byte < name.len() {
                    names[index].bytes[byte] = if byte == 0 {
                        name[byte].to_ascii_lowercase()
                    } else {
                        name[byte]
                    };
                    byte += 1;
                }
                names[index].len = name.len();
                index += 1;
            }
            names
        }
    }

    /// Returns each of `names` as a string.
    pub(crate) const fn as_strs<const N: usize>(names: &'static [Self; N]) -> [&'static str; N] {
        let mut strs = [""; N];
        let mut index = 0;
        while index < N {
            let (bytes, _) = names[index].bytes.split_at(names[index].len);
            strs[index] = match str::from_utf8(bytes) {
                Ok(name) => name,
                Err(_) => panic!("a variant name should be UTF-8"),
            };
            index += 1;
        }
        strs
    }
}
