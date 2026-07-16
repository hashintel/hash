//! Ed25519 signing and verification.

use core::{error::Error, fmt, str::FromStr};

use ed25519_dalek::{
    PUBLIC_KEY_LENGTH, SECRET_KEY_LENGTH, SIGNATURE_LENGTH, Signer as _, SigningKey, VerifyingKey,
};

use super::hex::{HexBytes, ParseHexError};

/// A byte string that is not a valid Ed25519 public key.
#[derive(Debug)]
pub struct InvalidPublicKeyError(ed25519_dalek::SignatureError);

impl fmt::Display for InvalidPublicKeyError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("bytes do not encode a valid Ed25519 public key")
    }
}

impl Error for InvalidPublicKeyError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.0)
    }
}

/// A signature that does not attest the message under the pinned key.
#[derive(Debug)]
pub struct InvalidSignatureError(ed25519_dalek::SignatureError);

impl fmt::Display for InvalidSignatureError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("signature does not attest the message under the pinned public key")
    }
}

impl Error for InvalidSignatureError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.0)
    }
}

/// A string that does not parse as an Ed25519 public key.
#[derive(Debug)]
pub enum ParseVerifierError {
    /// The string is not canonical lowercase hexadecimal.
    Hex(ParseHexError),
    /// The decoded bytes are not a valid compressed Ed25519 point.
    Key(InvalidPublicKeyError),
}

impl fmt::Display for ParseVerifierError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Hex(error) => fmt::Display::fmt(error, formatter),
            Self::Key(error) => fmt::Display::fmt(error, formatter),
        }
    }
}

impl Error for ParseVerifierError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Hex(error) => Some(error),
            Self::Key(error) => Some(error),
        }
    }
}

/// A detached Ed25519 signature.
///
/// A signature binds one message to one signing key; it reveals nothing
/// about the message and is meaningless without both the message bytes and
/// the [`Verifier`] it is checked against.
///
/// The text and JSON form is 128 characters of canonical lowercase
/// hexadecimal. Parsing rejects uppercase digits and noncanonical lengths;
/// whether the bytes constitute a valid signature is decided only by
/// [`Verifier::verify`].
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    serde::Serialize,
    serde::Deserialize,
    zerocopy::ByteHash,
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[serde(transparent)]
pub struct Signature(HexBytes<SIGNATURE_LENGTH>);

impl Signature {
    /// Creates a signature from its raw bytes.
    #[must_use]
    #[inline]
    pub const fn from_bytes(bytes: [u8; SIGNATURE_LENGTH]) -> Self {
        Self(HexBytes::new(bytes))
    }

    /// Returns the raw signature bytes.
    #[must_use]
    #[inline]
    pub const fn to_bytes(self) -> [u8; SIGNATURE_LENGTH] {
        self.0.into_inner()
    }
}

impl fmt::Display for Signature {
    #[inline]
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, formatter)
    }
}

impl FromStr for Signature {
    type Err = ParseHexError;

    #[inline]
    fn from_str(value: &str) -> Result<Self, Self::Err> {
        value.parse().map(Self)
    }
}

/// An Ed25519 secret key that attests messages.
///
/// A signer is created from a 32-byte secret with [`Signer::from_bytes`] and
/// produces detached [`Signature`]s with [`Signer::sign`]. Signing is
/// deterministic: the same key and message always produce the same
/// signature, so signatures are reproducible and diffable.
///
/// Sign short canonical statements rather than raw artifacts: digest the
/// artifact with [`Sha256`](super::Sha256) and sign the digest (or the
/// manifest that contains it). Verification is then a single cheap
/// operation regardless of artifact size, and the signed statement is
/// auditable on its own.
///
/// The verification half is available as [`Signer::verifier`]; distribute
/// that, never the signer. The secret is zeroized on drop, redacted from
/// [`fmt::Debug`] output, and deliberately has no text or serde encoding.
///
/// # Examples
///
/// ```rust
/// use hash_graph_atlas::integrity::Signer;
///
/// let signer = Signer::from_bytes([7_u8; 32]);
/// let signature = signer.sign(b"generation 42 is ready");
///
/// let verifier = signer.verifier();
/// assert!(
///     verifier
///         .verify(b"generation 42 is ready", &signature)
///         .is_ok()
/// );
/// assert!(
///     verifier
///         .verify(b"generation 43 is ready", &signature)
///         .is_err()
/// );
/// ```
#[derive(Clone)]
pub struct Signer(SigningKey);

impl Signer {
    /// Creates a signer from a 32-byte Ed25519 secret.
    ///
    /// Every 32-byte value is a usable secret key; for real deployments the
    /// value must come from a secret store or a cryptographically secure
    /// random generator.
    #[must_use]
    pub fn from_bytes(secret: [u8; SECRET_KEY_LENGTH]) -> Self {
        Self(SigningKey::from_bytes(&secret))
    }

    /// Signs `message` with this key.
    #[must_use]
    pub fn sign(&self, message: &[u8]) -> Signature {
        Signature(HexBytes::new(self.0.sign(message).to_bytes()))
    }

    /// Returns the verification-only half of this key pair.
    #[must_use]
    pub fn verifier(&self) -> Verifier {
        Verifier(self.0.verifying_key())
    }
}

impl fmt::Debug for Signer {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_tuple("Signer").finish_non_exhaustive()
    }
}

/// An Ed25519 public key that verifies signatures.
///
/// A verifier pins one exact public key: [`Verifier::verify`] accepts a
/// message only when the signature was produced by the matching [`Signer`]
/// over exactly those bytes.
///
/// Verification is strict: signatures with non-canonical encodings or
/// small-order components are rejected even though permissive Ed25519
/// verifiers may accept them. Acceptance is therefore deterministic and
/// consistent with other strict verifiers, at the cost of rejecting a small
/// class of exotic signatures that only adversarial signers produce.
///
/// The text and JSON form is the public key as 64 characters of canonical
/// lowercase hexadecimal, so configuration can pin the key directly.
/// Parsing validates that the bytes encode a real curve point and rejects
/// uppercase digits and noncanonical lengths.
#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(
    try_from = "HexBytes<PUBLIC_KEY_LENGTH>",
    into = "HexBytes<PUBLIC_KEY_LENGTH>"
)]
pub struct Verifier(VerifyingKey);

impl Verifier {
    /// Creates a verifier from raw Ed25519 public-key bytes.
    ///
    /// # Errors
    ///
    /// This returns an error when `public_key` is not a valid compressed
    /// Ed25519 point.
    pub fn from_bytes(public_key: [u8; PUBLIC_KEY_LENGTH]) -> Result<Self, InvalidPublicKeyError> {
        VerifyingKey::from_bytes(&public_key)
            .map(Self)
            .map_err(InvalidPublicKeyError)
    }

    /// Returns the raw public-key bytes.
    #[must_use]
    #[inline]
    pub fn to_bytes(&self) -> [u8; PUBLIC_KEY_LENGTH] {
        self.0.to_bytes()
    }

    /// Verifies that `signature` attests exactly `message` under this key.
    ///
    /// # Errors
    ///
    /// This returns an error when the signature was produced by a different
    /// key, attests different bytes, or is not strictly canonical.
    pub fn verify(
        &self,
        message: &[u8],
        signature: &Signature,
    ) -> Result<(), InvalidSignatureError> {
        self.0
            .verify_strict(
                message,
                &ed25519_dalek::Signature::from_bytes(&signature.to_bytes()),
            )
            .map_err(InvalidSignatureError)
    }
}

impl fmt::Debug for Verifier {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_tuple("Verifier").finish_non_exhaustive()
    }
}

impl fmt::Display for Verifier {
    #[inline]
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&HexBytes::new(self.to_bytes()), formatter)
    }
}

impl TryFrom<HexBytes<PUBLIC_KEY_LENGTH>> for Verifier {
    type Error = InvalidPublicKeyError;

    #[inline]
    fn try_from(bytes: HexBytes<PUBLIC_KEY_LENGTH>) -> Result<Self, Self::Error> {
        Self::from_bytes(bytes.into_inner())
    }
}

impl From<Verifier> for HexBytes<PUBLIC_KEY_LENGTH> {
    #[inline]
    fn from(verifier: Verifier) -> Self {
        Self::new(verifier.to_bytes())
    }
}

impl FromStr for Verifier {
    type Err = ParseVerifierError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let bytes: HexBytes<PUBLIC_KEY_LENGTH> = value.parse().map_err(ParseVerifierError::Hex)?;
        Self::try_from(bytes).map_err(ParseVerifierError::Key)
    }
}

#[cfg(test)]
mod tests {
    use core::assert_matches;

    use ed25519_dalek::SECRET_KEY_LENGTH;

    use super::{InvalidSignatureError, ParseVerifierError, Signature, Signer, Verifier};
    use crate::integrity::hex::HexBytes;

    // Test vector 1 from RFC 8032, section 7.1: the empty message.
    const SECRET_KEY: &str = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
    const PUBLIC_KEY: &str = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
    const SIGNATURE: &str = "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a3\
                             3bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b";

    fn rfc8032_signer() -> Signer {
        let secret: HexBytes<SECRET_KEY_LENGTH> = SECRET_KEY
            .parse()
            .expect("should decode the RFC 8032 secret key");
        Signer::from_bytes(secret.into_inner())
    }

    #[test]
    fn signs_the_rfc8032_vector() {
        let signer = rfc8032_signer();
        assert_eq!(signer.verifier().to_string(), PUBLIC_KEY);
        assert_eq!(signer.sign(b"").to_string(), SIGNATURE);
    }

    #[test]
    fn verifies_and_rejects() {
        let signer = rfc8032_signer();
        let verifier = signer.verifier();
        let signature = signer.sign(b"payload");

        assert_matches!(verifier.verify(b"payload", &signature), Ok(()));
        assert_matches!(
            verifier.verify(b"tampered", &signature),
            Err(InvalidSignatureError(_))
        );

        let other_verifier = Signer::from_bytes([7_u8; 32]).verifier();
        assert_matches!(
            other_verifier.verify(b"payload", &signature),
            Err(InvalidSignatureError(_))
        );
    }

    #[test]
    fn verifier_text_round_trip() {
        let verifier: Verifier = PUBLIC_KEY
            .parse()
            .expect("should parse a canonical public key");
        assert_eq!(verifier.to_string(), PUBLIC_KEY);

        // A valid hex string whose bytes fail point decompression (y = 2 is
        // not the y-coordinate of any curve point) is rejected.
        assert_matches!(
            "0200000000000000000000000000000000000000000000000000000000000000".parse::<Verifier>(),
            Err(ParseVerifierError::Key(_))
        );
        assert_matches!("d75a".parse::<Verifier>(), Err(ParseVerifierError::Hex(_)));
    }

    #[test]
    fn verifier_serde_validates_the_point() {
        let encoded = format!("\"{PUBLIC_KEY}\"");
        let verifier: Verifier =
            serde_json::from_str(&encoded).expect("should deserialize a canonical public key");
        assert_eq!(
            serde_json::to_string(&verifier).expect("should serialize a verifier"),
            encoded
        );

        let not_a_point = "\"0200000000000000000000000000000000000000000000000000000000000000\"";
        assert_matches!(serde_json::from_str::<Verifier>(not_a_point), Err(_));
    }

    #[test]
    fn signature_serde_round_trip() {
        let signature: Signature = SIGNATURE
            .parse()
            .expect("should parse a canonical signature");

        let encoded = serde_json::to_string(&signature)
            .expect("should serialize a signature to a JSON string");
        assert_eq!(encoded, format!("\"{SIGNATURE}\""));

        let decoded: Signature =
            serde_json::from_str(&encoded).expect("should deserialize the canonical JSON string");
        assert_eq!(decoded, signature);
    }

    #[test]
    fn signer_debug_redacts_the_secret() {
        assert_eq!(format!("{:?}", rfc8032_signer()), "Signer(..)");
    }
}
