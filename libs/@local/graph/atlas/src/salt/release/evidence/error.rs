use core::{error::Error, fmt};
use std::io;

use super::super::GateId;

/// A release-evidence document that cannot authorize a generation.
#[derive(Debug)]
pub(crate) enum GateEvidenceError {
    InvalidAuthority,
    InvalidPublicKey(ed25519_dalek::SignatureError),
    InvalidSignature,
    InvalidSignatureEncoding,
    Serialization(serde_json::Error),
    Io(io::Error),
    Version { actual: u32 },
    Head,
    Authority,
    PublicKey,
    GateMismatch,
    Duplicate { gate: GateId },
    Missing { gate: GateId },
    Unexpected { gate: GateId },
    Failed { gate: GateId, reason: &'static str },
    Hash { gate: GateId },
    Report,
    ExistingEvidenceMismatch { gate: GateId },
}

impl fmt::Display for GateEvidenceError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidAuthority => {
                formatter.write_str("gate evidence authority is empty or not canonical")
            }
            Self::InvalidPublicKey(error) => {
                write!(formatter, "gate evidence public key is invalid: {error}")
            }
            Self::InvalidSignature => {
                formatter.write_str("gate evidence signature is not valid for its authority")
            }
            Self::InvalidSignatureEncoding => {
                formatter.write_str("gate evidence signature is not canonical lowercase hex")
            }
            Self::Serialization(error) => {
                write!(formatter, "gate evidence encoding failed: {error}")
            }
            Self::Io(error) => write!(formatter, "gate evidence storage failed: {error}"),
            Self::Version { actual } => {
                write!(formatter, "gate evidence version {actual} is unsupported")
            }
            Self::Head => formatter.write_str("gate evidence names a different release head"),
            Self::Authority => {
                formatter.write_str("gate evidence names a different signing authority")
            }
            Self::PublicKey => {
                formatter.write_str("gate evidence verifier differs from the manifest pin")
            }
            Self::GateMismatch => {
                formatter.write_str("gate evidence payload and document gate differ")
            }
            Self::Duplicate { gate } => write!(formatter, "release evidence repeats {gate}"),
            Self::Missing { gate } => write!(formatter, "release evidence omits {gate}"),
            Self::Unexpected { gate } => {
                write!(formatter, "release evidence includes non-M0 gate {gate}")
            }
            Self::Failed { gate, reason } => {
                write!(formatter, "release evidence for {gate} failed: {reason}")
            }
            Self::Hash { gate } => {
                write!(
                    formatter,
                    "persisted release evidence for {gate} has a different hash"
                )
            }
            Self::Report => {
                formatter.write_str("release report differs from its verified evidence set")
            }
            Self::ExistingEvidenceMismatch { gate } => write!(
                formatter,
                "existing immutable release evidence for {gate} has different content"
            ),
        }
    }
}

impl Error for GateEvidenceError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::InvalidPublicKey(error) => Some(error),
            Self::Serialization(error) => Some(error),
            Self::Io(error) => Some(error),
            Self::InvalidAuthority
            | Self::InvalidSignature
            | Self::InvalidSignatureEncoding
            | Self::Version { .. }
            | Self::Head
            | Self::Authority
            | Self::PublicKey
            | Self::GateMismatch
            | Self::Duplicate { .. }
            | Self::Missing { .. }
            | Self::Unexpected { .. }
            | Self::Failed { .. }
            | Self::Hash { .. }
            | Self::Report
            | Self::ExistingEvidenceMismatch { .. } => None,
        }
    }
}

impl From<serde_json::Error> for GateEvidenceError {
    #[inline]
    fn from(error: serde_json::Error) -> Self {
        Self::Serialization(error)
    }
}

impl From<io::Error> for GateEvidenceError {
    #[inline]
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}
