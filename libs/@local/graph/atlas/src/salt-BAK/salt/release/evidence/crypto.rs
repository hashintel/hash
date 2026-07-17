use core::{fmt, str::FromStr as _};

use ed25519_dalek::{Signature, Signer as _, SigningKey, VerifyingKey};
use serde::{Deserialize, Deserializer, Serialize, Serializer, de::Visitor};

use super::GateEvidenceError;
use crate::salt::hash::ContentHash;

const SIGNATURE_BYTES: usize = 64;
const SIGNATURE_HEX_BYTES: usize = SIGNATURE_BYTES * 2;

/// An Ed25519 authority permitted to attest release evidence.
#[derive(Clone)]
pub(crate) struct GateSigner {
    authority: String,
    key: SigningKey,
}

impl fmt::Debug for GateSigner {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("GateSigner")
            .field("authority", &self.authority)
            .field("public_key", &self.public_key())
            .finish_non_exhaustive()
    }
}

impl GateSigner {
    /// Creates an authority from a 32-byte Ed25519 secret.
    ///
    /// # Errors
    ///
    /// This returns an error when `authority` is empty, has surrounding
    /// whitespace, or uses the reserved value `TBD`.
    pub(crate) fn new(
        authority: impl Into<String>,
        secret: [u8; 32],
    ) -> Result<Self, GateEvidenceError> {
        let authority = authority.into();
        validate_authority(&authority)?;
        Ok(Self {
            authority,
            key: SigningKey::from_bytes(&secret),
        })
    }

    /// Returns the verification-only half of this authority.
    #[must_use]
    pub(crate) fn verifier(&self) -> GateVerifier {
        GateVerifier {
            authority: self.authority.clone(),
            key: self.key.verifying_key(),
        }
    }

    #[inline]
    pub(super) fn sign(&self, message: &[u8]) -> SignatureHex {
        SignatureHex(self.key.sign(message).to_bytes())
    }

    #[inline]
    fn public_key(&self) -> ContentHash {
        ContentHash::from_bytes(self.key.verifying_key().to_bytes())
    }
}

/// A pinned Ed25519 authority for release and restart verification.
#[derive(Debug, Clone)]
pub(crate) struct GateVerifier {
    authority: String,
    key: VerifyingKey,
}

impl GateVerifier {
    /// Parses a verification key for one named authority.
    ///
    /// # Errors
    ///
    /// This returns an error when the authority name or compressed Ed25519
    /// point is invalid.
    pub(crate) fn new(
        authority: impl Into<String>,
        public_key: [u8; 32],
    ) -> Result<Self, GateEvidenceError> {
        let authority = authority.into();
        validate_authority(&authority)?;
        Ok(Self {
            authority,
            key: VerifyingKey::from_bytes(&public_key)
                .map_err(GateEvidenceError::InvalidPublicKey)?,
        })
    }

    /// Returns the raw public-key pin recorded in generation manifests.
    #[must_use]
    #[inline]
    pub(crate) fn public_key(&self) -> ContentHash {
        ContentHash::from_bytes(self.key.to_bytes())
    }

    #[must_use]
    #[inline]
    pub(crate) fn authority(&self) -> &str {
        &self.authority
    }

    pub(super) fn verify(
        &self,
        message: &[u8],
        signature: SignatureHex,
    ) -> Result<(), GateEvidenceError> {
        self.key
            .verify_strict(message, &Signature::from_bytes(&signature.0))
            .map_err(|_error| GateEvidenceError::InvalidSignature)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) struct SignatureHex([u8; SIGNATURE_BYTES]);

impl Default for SignatureHex {
    #[inline]
    fn default() -> Self {
        Self([0; SIGNATURE_BYTES])
    }
}

impl Serialize for SignatureHex {
    fn serialize<SerializerType>(
        &self,
        serializer: SerializerType,
    ) -> Result<SerializerType::Ok, SerializerType::Error>
    where
        SerializerType: Serializer,
    {
        let mut encoded = String::with_capacity(SIGNATURE_HEX_BYTES);
        for byte in self.0 {
            use fmt::Write as _;
            write!(encoded, "{byte:02x}").expect("writing to a String should not fail");
        }
        serializer.serialize_str(&encoded)
    }
}

impl<'de> Deserialize<'de> for SignatureHex {
    fn deserialize<DeserializerType>(
        deserializer: DeserializerType,
    ) -> Result<Self, DeserializerType::Error>
    where
        DeserializerType: Deserializer<'de>,
    {
        deserializer.deserialize_str(SignatureVisitor)
    }
}

struct SignatureVisitor;

impl Visitor<'_> for SignatureVisitor {
    type Value = SignatureHex;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a 128-character lowercase hexadecimal Ed25519 signature")
    }

    fn visit_str<ErrorType>(self, value: &str) -> Result<Self::Value, ErrorType>
    where
        ErrorType: serde::de::Error,
    {
        SignatureHex::from_str(value).map_err(ErrorType::custom)
    }
}

impl core::str::FromStr for SignatureHex {
    type Err = GateEvidenceError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        if value.len() != SIGNATURE_HEX_BYTES {
            return Err(GateEvidenceError::InvalidSignatureEncoding);
        }
        let mut bytes = [0_u8; SIGNATURE_BYTES];
        for (index, pair) in value.as_bytes().chunks_exact(2).enumerate() {
            bytes[index] = decode(pair[0])?
                .checked_mul(16)
                .and_then(|high| high.checked_add(decode(pair[1]).ok()?))
                .ok_or(GateEvidenceError::InvalidSignatureEncoding)?;
        }
        Ok(Self(bytes))
    }
}

#[inline]
const fn decode(byte: u8) -> Result<u8, GateEvidenceError> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        _ => Err(GateEvidenceError::InvalidSignatureEncoding),
    }
}

fn validate_authority(authority: &str) -> Result<(), GateEvidenceError> {
    if authority.is_empty()
        || authority.trim() != authority
        || authority.eq_ignore_ascii_case("TBD")
    {
        Err(GateEvidenceError::InvalidAuthority)
    } else {
        Ok(())
    }
}
