//! Registers the codecs used to read and write durable records.
//!
//! Each [`DurableRecord`] has a [`RecordDeclaration`] with its stored name,
//! version envelope, identity algorithm versions, and migration policy.
//! Declarations are registered before reading or appending a shard log. The
//! process-wide registry rejects conflicting declarations for the same name,
//! preventing one codec from reading another codec's records.

use alloc::collections::BTreeMap;
use core::fmt;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DurabilityClass {
    ImmutableJournal,
    ImmutableArtifact,
    MutableCas,
    Derived,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MigrationPolicy {
    NeverRetireWhileUntrimmed,
    PureUpcast,
    MutableCas,
    Rebuild,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AlgorithmVersion {
    pub name: &'static str,
    pub version: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RecordDeclaration {
    pub name: &'static str,
    pub owning_module: &'static str,
    pub emitted_version: u32,
    pub supported_versions: &'static [u32],
    pub algorithm_versions: &'static [AlgorithmVersion],
    pub durability: DurabilityClass,
    pub migration: MigrationPolicy,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeclarationError {
    Invalid { name: String, message: String },
    Unregistered(String),
}

#[expect(
    clippy::use_debug,
    reason = "debug formatting quotes and escapes invalid record names"
)]
impl fmt::Display for DeclarationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Invalid { name, message } => {
                write!(
                    formatter,
                    "durable-record declaration {name:?} is invalid: {message}"
                )
            }
            Self::Unregistered(name) => write!(
                formatter,
                "durable-record declaration {name:?} is not interned in this process"
            ),
        }
    }
}

impl core::error::Error for DeclarationError {}

static DECLARATIONS: std::sync::RwLock<BTreeMap<&'static str, &'static RecordDeclaration>> =
    std::sync::RwLock::new(BTreeMap::new());

/// Registers a record declaration and retains one copy for the lifetime of the process.
///
/// Registering an identical declaration again returns the existing copy.
///
/// # Errors
///
/// Returns an error if the name already has a different declaration or a journal declaration
/// permits decoder retirement.
pub fn intern_declaration(
    declaration: RecordDeclaration,
) -> Result<&'static RecordDeclaration, DeclarationError> {
    if declaration.migration != MigrationPolicy::NeverRetireWhileUntrimmed
        && declaration.durability == DurabilityClass::ImmutableJournal
    {
        return Err(DeclarationError::Invalid {
            name: declaration.name.to_owned(),
            message: "journal records cannot retire decoders while untrimmed".to_owned(),
        });
    }
    let mut declarations = DECLARATIONS
        .write()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if let Some(existing) = declarations.get(declaration.name) {
        return if **existing == declaration {
            Ok(existing)
        } else {
            Err(DeclarationError::Invalid {
                name: declaration.name.to_owned(),
                message: "name is already registered with a different declaration".to_owned(),
            })
        };
    }
    let interned: &'static RecordDeclaration = Box::leak(Box::new(declaration));
    declarations.insert(interned.name, interned);
    drop(declarations);
    Ok(interned)
}

/// Whether `declaration` is interned in this process, byte for byte.
pub fn interned_declaration_matches(declaration: &RecordDeclaration) -> bool {
    DECLARATIONS
        .read()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .get(declaration.name)
        .is_some_and(|known| **known == *declaration)
}

pub trait DurableRecord: Sized {
    fn declaration() -> &'static RecordDeclaration;
    const MIGRATION_POLICY: MigrationPolicy;

    /// Encodes the record in its declared wire format.
    ///
    /// # Errors
    ///
    /// Returns an error when the record cannot be encoded under its declared format.
    fn encode(&self) -> Result<Vec<u8>, CompatError>;

    /// Decodes bytes into a supported wire record.
    ///
    /// # Errors
    ///
    /// Returns an error when the bytes are malformed or use an unsupported record format.
    fn decode(bytes: &[u8]) -> Result<Self, CompatError>;
}

/// Converts supported wire versions to one validated record type. Add a conversion here for
/// each new wire version.
pub trait VersionedRecord: DurableRecord {
    type Current;

    /// Converts a wire record to its validated current representation.
    ///
    /// # Errors
    ///
    /// Returns an error when the wire record cannot be converted to a valid current record.
    fn normalize(self) -> Result<Self::Current, CompatError>;
}

/// Immutable records retain old bytes and normalize them while reachable.
pub trait PureUpcastRecord: VersionedRecord {}

/// Journal history is immutable and its decoders cannot retire while the
/// corresponding sequence range remains replayable.
pub trait UntrimmedJournalRecord: VersionedRecord {}

/// Upgrades mutable records to the current format. Writes must use compare-and-swap against the
/// version that was read.
pub trait MutableCasRecord: VersionedRecord + Send + Sync {
    /// Builds a wire record from the current representation.
    ///
    /// # Errors
    ///
    /// Returns an error when the current record cannot be represented in the emitted format.
    fn from_current(current: Self::Current) -> Result<Self, CompatError>;

    /// Converts a record to the format used for new writes.
    ///
    /// # Errors
    ///
    /// Returns an error when normalization or conversion to the emitted format fails.
    fn into_emitted(self) -> Result<Self, CompatError> {
        Self::from_current(self.normalize()?)
    }
}

/// Derived records may be discarded and rebuilt from authoritative state.
pub trait RebuildableRecord: DurableRecord {}

/// Checks that the record type has a matching registered declaration.
///
/// # Errors
///
/// Returns an error if the declaration is absent, differs from the registered declaration, or
/// disagrees with the type’s migration policy.
pub fn require_interned<T: DurableRecord>() -> Result<(), DeclarationError> {
    if T::MIGRATION_POLICY != T::declaration().migration {
        return Err(DeclarationError::Invalid {
            name: T::declaration().name.to_owned(),
            message: format!(
                "record type declares {:?} but registry declares {:?}",
                T::MIGRATION_POLICY,
                T::declaration().migration
            ),
        });
    }
    if interned_declaration_matches(T::declaration()) {
        Ok(())
    } else {
        Err(DeclarationError::Unregistered(
            T::declaration().name.to_owned(),
        ))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CompatError {
    UnsupportedVersion { name: &'static str, version: String },
    ExtraField { name: &'static str, path: String },
    Malformed { name: &'static str, message: String },
    Conflict { name: &'static str, message: String },
}

#[expect(
    clippy::use_debug,
    reason = "debug formatting quotes invalid version and field values"
)]
impl fmt::Display for CompatError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsupportedVersion { name, version } => {
                write!(formatter, "unsupported {name} version {version:?}")
            }
            Self::ExtraField { name, path } => {
                write!(formatter, "{name} contains undeclared field {path:?}")
            }
            Self::Malformed { name, message } => {
                write!(formatter, "malformed {name}: {message}")
            }
            Self::Conflict { name, message } => {
                write!(formatter, "conflicting {name}: {message}")
            }
        }
    }
}

impl core::error::Error for CompatError {}

/// Checks a JSON object against an explicit set of field names.
///
/// Call this for the envelope and each nested object before deserializing.
///
/// # Errors
///
/// Returns an error if the value is not an object or contains an undeclared field.
pub fn reject_unknown_fields(
    name: &'static str,
    path: &str,
    value: &Value,
    allowed: &[&str],
) -> Result<(), CompatError> {
    let object = value.as_object().ok_or_else(|| CompatError::Malformed {
        name,
        message: format!("{path} must be an object"),
    })?;
    for key in object.keys() {
        if !allowed.contains(&key.as_str()) {
            let path = if path.is_empty() {
                key.clone()
            } else {
                format!("{path}.{key}")
            };
            return Err(CompatError::ExtraField { name, path });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const fn declaration(name: &'static str) -> RecordDeclaration {
        RecordDeclaration {
            name,
            owning_module: "durable_kernel::registry::tests",
            emitted_version: 1,
            supported_versions: &[1],
            algorithm_versions: &[],
            durability: DurabilityClass::ImmutableJournal,
            migration: MigrationPolicy::NeverRetireWhileUntrimmed,
        }
    }

    #[test]
    fn interning_is_idempotent_and_refuses_conflicting_redeclaration() {
        let first = intern_declaration(declaration("kernel_registry_test_record"))
            .expect("fresh declaration should intern");
        let second = intern_declaration(declaration("kernel_registry_test_record"))
            .expect("identical declaration should re-intern");
        assert!(core::ptr::eq(first, second));

        let conflicting = RecordDeclaration {
            emitted_version: 2,
            supported_versions: &[1, 2],
            ..declaration("kernel_registry_test_record")
        };
        assert!(matches!(
            intern_declaration(conflicting),
            Err(DeclarationError::Invalid { .. })
        ));
    }

    #[test]
    fn journal_records_cannot_retire_decoders() {
        let retiring = RecordDeclaration {
            migration: MigrationPolicy::PureUpcast,
            ..declaration("kernel_registry_retiring_journal")
        };
        assert!(matches!(
            intern_declaration(retiring),
            Err(DeclarationError::Invalid { .. })
        ));
    }
}
