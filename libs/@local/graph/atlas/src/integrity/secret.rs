use alloc::{alloc::Allocator, sync::Arc};
use core::{error::Error, fmt, marker::PhantomData, mem::MaybeUninit, str::FromStr};
use std::alloc::Global;

use clap::builder::TypedValueParser;
use zerocopy::IntoBytes as _;
use zeroize::{Zeroize as _, Zeroizing};

use super::{ParseHexError, hex::HexBytes};

/// A variable-length secret string.
///
/// The bytes zero on drop, and no path encodes them back out. [`fmt::Debug`] prints the length
/// alone, [`fmt::Display`] prints a fixed placeholder, and the type has no `Serialize`, so logging
/// or dumping a held secret discloses nothing. [`expose`](Self::expose) hands the buffer onward
/// under a guard that zeroizes it in turn, and [`into_unguarded`](Self::into_unguarded) is the one
/// exit that ends zeroizing custody.
///
/// The zeroing covers buffers this type and its guard own, never copies made from them. A consumer
/// that copies the exposed value into its own storage owns that copy's end of life. The value also
/// arrives from the command line or environment, whose copies precede the type.
#[derive(Clone)]
pub struct SecretString<A: Allocator = Global>(Arc<Zeroizing<str>, A>);

impl<A: Allocator> SecretString<A> {
    /// Consumes the secret, handing the shared allocation onward with custody intact.
    ///
    /// The returned guard is the same allocation, and it zeroizes when its last holder drops.
    /// Nothing copies in the transfer. A consumer whose API needs the value outside custody
    /// takes [`into_unguarded`](Self::into_unguarded) instead.
    #[must_use]
    pub(crate) fn expose(self) -> Arc<Zeroizing<str>, A> {
        self.0
    }

    /// Consumes the secret, moving the held value out of zeroizing custody.
    ///
    /// The returned [`Arc<str>`] carries no guard: whoever holds it determines its end of life,
    /// and nothing zeroizes it. A secret with one holder leaves as the same allocation,
    /// reinterpreted in place without a copy. A shared secret leaves as a fresh copy, and every
    /// other holder keeps the guarded original.
    #[must_use]
    pub fn into_unguarded(self) -> Arc<str, A>
    where
        A: Clone,
    {
        if Arc::is_unique(&self.0) {
            let (ptr, alloc) = Arc::into_raw_with_allocator(self.0);

            // SAFETY: the pointer and allocator come from `into_raw_with_allocator` on this same
            // allocation. `Zeroizing<str>` is `#[repr(transparent)]` over `str` with the
            // identical representation documented, so the pointee retype preserves layout and
            // slice metadata. Dropping the guard type is this method's contract.
            unsafe { Arc::from_raw_in(ptr as *const str, alloc) }
        } else {
            let alloc = Arc::allocator(&self.0).clone();
            let len = self.0.len();

            let mut arc: Arc<[MaybeUninit<u8>], A> = Arc::new_uninit_slice_in(len, alloc);

            // SAFETY: `arc` was allocated on the line above and never cloned, so this reference
            // is the allocation's only access. `write_copy_of_slice` fills exactly the `len`
            // elements the slice was allocated with, from a source of that same length.
            unsafe {
                Arc::get_mut_unchecked(&mut arc).write_copy_of_slice(self.0.as_bytes());
            }

            // SAFETY: the `write_copy_of_slice` call above initialized every element.
            let arc: Arc<[u8], A> = unsafe { arc.assume_init() };
            let (ptr, alloc) = Arc::into_raw_with_allocator(arc);

            // SAFETY: the pointer and allocator come from `into_raw_with_allocator` on this same
            // allocation. Its bytes are a copy of `self.0`, a valid `str`, so the UTF-8 invariant
            // holds, and `str` has the identical representation to `[u8]`, so the pointee retype
            // preserves layout and slice metadata.
            unsafe { Arc::from_raw_in(ptr as *const str, alloc) }
        }
    }
}

impl<A> PartialEq for SecretString<A>
where
    A: Allocator,
{
    fn eq(&self, other: &Self) -> bool {
        subtle::ConstantTimeEq::ct_eq(self.0.as_bytes(), other.0.as_bytes()).into()
    }
}

impl<A> Eq for SecretString<A> where A: Allocator {}

impl<A> fmt::Debug for SecretString<A>
where
    A: Allocator,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("SecretString")
            .field("len", &self.0.len())
            .finish_non_exhaustive()
    }
}

impl<A> fmt::Display for SecretString<A>
where
    A: Allocator,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("[redacted]")
    }
}

impl From<&str> for SecretString {
    fn from(value: &str) -> Self {
        Self::from_str(value).into_ok()
    }
}

impl FromStr for SecretString {
    type Err = !;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let value: Arc<str> = Arc::from(value);

        let ptr = Arc::into_raw(value);
        // SAFETY: the pointer comes from `into_raw` on this same allocation, and `Zeroizing<str>`
        // is `#[repr(transparent)]` over `str` with the identical representation documented, so
        // the pointee retype preserves layout and slice metadata and the guard's drop reaches
        // valid bytes.
        let arc = unsafe { Arc::from_raw(ptr as *const Zeroizing<str>) };

        Ok(Self(arc))
    }
}

/// A refused secret encoding, by position and never by byte.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ParseSecretHexError {
    /// The input contains a number of characters other than the encoded width.
    Length {
        /// The number of characters the encoded value occupies.
        expected: usize,
        /// The number of characters the input actually contains.
        actual: usize,
    },
    /// The input contains a character outside `0-9` and `a-f`.
    Character {
        /// The offset of the offending character within the input.
        index: usize,
    },
}

impl From<ParseHexError> for ParseSecretHexError {
    fn from(error: ParseHexError) -> Self {
        match error {
            ParseHexError::Length { expected, actual } => Self::Length { expected, actual },
            ParseHexError::Character { index, .. } => Self::Character { index },
        }
    }
}

impl fmt::Display for ParseSecretHexError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Length { expected, actual } => write!(
                fmt,
                "the secret contains {actual} characters and its encoding takes {expected}"
            ),
            Self::Character { index } => write!(
                fmt,
                "the secret contains a character outside 0-9 and a-f at offset {index}"
            ),
        }
    }
}

impl Error for ParseSecretHexError {}

/// The error for a password that is empty after trimming.
#[derive(Debug)]
pub struct EmptyPasswordError;

impl fmt::Display for EmptyPasswordError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("password is empty after trimming surrounding whitespace")
    }
}

impl Error for EmptyPasswordError {}

/// A non-empty, trimmed password.
///
/// Parsing trims surrounding whitespace and refuses an input that is empty afterwards. The
/// bytes zero on drop, and [`fmt::Debug`] prints the length alone, so logging a held password
/// discloses nothing.
#[derive(Clone)]
pub struct PasswordString<A: Allocator = Global>(SecretString<A>);

impl<A: Allocator> fmt::Debug for PasswordString<A> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("PasswordString")
            .field("len", &self.0.0.len())
            .finish_non_exhaustive()
    }
}

impl<A: Allocator> From<PasswordString<A>> for SecretString<A> {
    fn from(PasswordString(secret): PasswordString<A>) -> Self {
        secret
    }
}

impl FromStr for PasswordString {
    type Err = EmptyPasswordError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        // Whitespace around a password is quoting and paste residue, never part of the value.
        let value = value.trim();
        if value.is_empty() {
            return Err(EmptyPasswordError);
        }

        Ok(Self(SecretString::from(value)))
    }
}

/// An `N`-byte secret configured in the canonical hexadecimal encoding.
///
/// The bytes zero on drop, and this type's own renderings redact: [`fmt::Debug`] prints the width
/// alone and [`fmt::Display`] prints a fixed placeholder. The type has no `Serialize`, so logging
/// or serializing the value discloses nothing.
///
/// The redaction covers this value, not everything reachable through it: [`HexBytes`] renders every
/// byte, so rendering the dereferenced inner value writes the key in full. Code that holds a secret
/// renders the secret, never its target.
///
/// Parsing and deserialization accept exactly the canonical lowercase form.
#[derive(Clone, zerocopy::ByteHash, zerocopy::Immutable, zerocopy::KnownLayout)]
#[repr(transparent)]
pub(crate) struct SecretHexBytes<const N: usize>(HexBytes<N>);

impl<const N: usize> SecretHexBytes<N> {
    /// Wraps raw secret bytes.
    #[cfg(test)] // required by `WireSecret`
    pub(crate) const fn new(bytes: [u8; N]) -> Self {
        Self(HexBytes::new(bytes))
    }

    pub(crate) const fn zeroed() -> Self {
        Self(HexBytes::new([0_u8; N]))
    }

    /// Returns a reference to the secret bytes.
    pub(crate) const fn as_bytes(&self) -> &[u8] {
        self.0.as_ref()
    }

    /// Decodes the canonical lowercase hexadecimal encoding of the secret.
    ///
    /// # Errors
    ///
    /// [`ParseSecretHexError`] for an input other than exactly `2 · N` lowercase hexadecimal
    /// characters.
    pub(crate) fn from_encoded_bytes(bytes: &[u8]) -> Result<Self, ParseSecretHexError> {
        HexBytes::from_encoded_bytes(bytes)
            .map(Self)
            .map_err(ParseSecretHexError::from)
    }
}

const impl<const N: usize> AsRef<[u8]> for SecretHexBytes<N> {
    fn as_ref(&self) -> &[u8] {
        self.0.as_ref()
    }
}

const impl<const N: usize> AsMut<[u8]> for SecretHexBytes<N> {
    fn as_mut(&mut self) -> &mut [u8] {
        self.0.as_mut()
    }
}

impl<const N: usize> PartialEq for SecretHexBytes<N> {
    fn eq(&self, other: &Self) -> bool {
        subtle::ConstantTimeEq::ct_eq(self.0.as_ref(), other.0.as_ref()).into()
    }
}

impl<const N: usize> Eq for SecretHexBytes<N> {}

impl<const N: usize> fmt::Debug for SecretHexBytes<N> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("SecretHexBytes")
            .field("len", &N)
            .finish_non_exhaustive()
    }
}

impl<const N: usize> fmt::Display for SecretHexBytes<N> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("[redacted]")
    }
}

impl<const N: usize> Drop for SecretHexBytes<N> {
    fn drop(&mut self) {
        let bytes = self.0.as_mut_bytes();
        bytes.zeroize();
    }
}

impl<const N: usize> FromStr for SecretHexBytes<N> {
    type Err = ParseSecretHexError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        Self::from_encoded_bytes(value.as_bytes())
    }
}

impl<'de, const N: usize> serde::Deserialize<'de> for SecretHexBytes<N> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        struct SecretHexVisitor<const N: usize>;

        impl<const N: usize> serde::de::Visitor<'_> for SecretHexVisitor<N> {
            type Value = SecretHexBytes<N>;

            fn expecting(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
                write!(fmt, "{} lowercase hexadecimal characters", N * 2)
            }

            fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                value.parse().map_err(E::custom)
            }
        }

        deserializer.deserialize_str(SecretHexVisitor)
    }
}

/// A command-line value parser for a secret, refusing without echoing the value.
///
/// clap's adapter for a parse function echoes the rejected text in its error. This one renders a
/// [`ParseSecretHexError`] and names the argument alone.
#[derive(Debug)]
pub(crate) struct SecretHexBytesValueParser<T, const N: usize> {
    _marker: PhantomData<fn() -> (T, SecretHexBytes<N>)>,
}

impl<T, const N: usize> SecretHexBytesValueParser<T, N> {
    /// Creates the parser.
    pub(crate) fn new() -> Self {
        Self {
            _marker: PhantomData,
        }
    }
}

impl<T, const N: usize> TypedValueParser for SecretHexBytesValueParser<T, N>
where
    T: From<SecretHexBytes<N>> + Send + Sync + Clone + 'static,
{
    type Value = T;

    fn parse_ref(
        &self,
        cmd: &clap::Command,
        arg: Option<&clap::Arg>,
        value: &std::ffi::OsStr,
    ) -> Result<Self::Value, clap::Error> {
        SecretHexBytes::from_encoded_bytes(value.as_encoded_bytes())
            .map(T::from)
            .map_err(|error| {
                let argument = arg.map_or_else(|| "...".to_owned(), ToString::to_string);
                clap::Error::raw(
                    clap::error::ErrorKind::ValueValidation,
                    format!("invalid value for '{argument}': {error}"),
                )
                .with_cmd(cmd)
            })
    }
}

impl<T, const N: usize> Copy for SecretHexBytesValueParser<T, N> {}

impl<T, const N: usize> Clone for SecretHexBytesValueParser<T, N> {
    fn clone(&self) -> Self {
        *self
    }
}

#[cfg(test)]
mod tests {
    use core::{assert_matches, str::FromStr as _};

    use super::{
        EmptyPasswordError, ParseSecretHexError, PasswordString, SecretHexBytes, SecretString,
    };

    /// A key whose adjacent bytes differ, so a partial leak cannot hide inside a repeated run.
    const HEX: &str = "6ad599a5c17e1fc4d7e2988bd4f3e0367f3c4a35d6dae135f9a1e0efc775ce55";

    /// Asserts that no eight-byte window of `material` survives into `rendered`.
    ///
    /// Windows rather than the whole value: a rendering that truncates or encodes only part of the
    /// material discloses it as much as a complete one does.
    #[track_caller]
    fn assert_redacted(rendered: &str, material: &str) {
        for (start, window) in material.as_bytes().windows(8).enumerate() {
            assert!(
                !rendered
                    .as_bytes()
                    .windows(8)
                    .any(|candidate| candidate == window),
                "the rendering carries held material at position {start}: {rendered}"
            );
        }
    }

    /// Neither rendering of a held key encodes its bytes.
    ///
    /// This test checks both renderings against every eight-byte window of the canonical form, so a
    /// partial disclosure fails the same way a whole one does. The dereferenced inner value is
    /// outside this witness: [`HexBytes`] renders every byte, and a rendering taken through the
    /// deref is what the type documentation covers.
    #[test]
    fn hex_secret_renderings() {
        let secret =
            SecretHexBytes::<32>::from_str(HEX).expect("the literal is the canonical form");

        assert_redacted(&format!("{secret:?}"), HEX);
        assert_redacted(&format!("{secret}"), HEX);
    }

    /// Neither rendering of a held string encodes its characters.
    #[test]
    fn string_secret_renderings() {
        const VALUE: &str = "postgres://atlas:hunter2@10.0.0.7:5432/graph";

        let secret = SecretString::from_str(VALUE).expect("the conversion cannot fail");

        assert_redacted(&format!("{secret:?}"), VALUE);
        assert_redacted(&format!("{secret}"), VALUE);
    }

    /// A refused secret's error names the offset and none of the input's characters.
    #[test]
    fn hex_secret_refusal_uppercase() {
        let uppercase = HEX.to_ascii_uppercase();

        let error = SecretHexBytes::<32>::from_str(&uppercase).expect_err("uppercase hex refuses");
        let rendered = error.to_string();

        assert_eq!(error, ParseSecretHexError::Character { index: 1 });
        for character in uppercase.chars() {
            assert!(
                !rendered.contains(&format!("'{character}'")),
                "a character of the input reached the error: {rendered}"
            );
        }
    }

    /// The sole holder's allocation leaves custody in place, with no copy.
    ///
    /// Pointer equality is the witness: the unguarded value is the same allocation the secret
    /// held, reinterpreted rather than moved. Run under Miri, this also checks the retype's
    /// provenance.
    #[test]
    fn unguarded_unique() {
        const VALUE: &str = "a-secret-with-one-holder";

        let secret = SecretString::from_str(VALUE).expect("the conversion cannot fail");
        let address = secret.0.as_ptr();

        let unguarded = secret.into_unguarded();

        assert_eq!(unguarded.as_ptr(), address);
        assert_eq!(&*unguarded, VALUE);
    }

    /// Parsing holds the trimmed bytes alone.
    #[test]
    fn password_trim() {
        let password = PasswordString::from_str("  hunter2\t").expect("the value is non-empty");

        assert_eq!(SecretString::from(password).expose().as_bytes(), b"hunter2");
    }

    /// An empty input refuses, and so does one that trims to empty.
    #[test]
    fn password_empty() {
        assert_matches!(PasswordString::from_str(""), Err(EmptyPasswordError));
        assert_matches!(PasswordString::from_str(" \t\n"), Err(EmptyPasswordError));
    }

    /// The debug rendering of a held password encodes none of its characters.
    #[test]
    fn password_debug_redacts() {
        const VALUE: &str = "correct-horse-battery-staple";

        let password = PasswordString::from_str(VALUE).expect("the value is non-empty");

        assert_redacted(&format!("{password:?}"), VALUE);
    }

    /// A shared secret leaves as a fresh copy, and the held clone keeps its guarded allocation.
    ///
    /// Pointer inequality is the witness for the copy, and the held clone still exposing the
    /// value is the witness that custody stayed with it. Run under Miri, this also checks the
    /// copy's initialization and provenance.
    #[test]
    fn unguarded_shared() {
        const VALUE: &str = "a-secret-with-two-holders";

        let secret = SecretString::from_str(VALUE).expect("the conversion cannot fail");
        let held = secret.clone();
        let address = held.0.as_ptr();

        let unguarded = secret.into_unguarded();

        assert_ne!(unguarded.as_ptr(), address);
        assert_eq!(&*unguarded, VALUE);
        assert_eq!(held.expose().as_bytes(), VALUE.as_bytes());
    }
}
