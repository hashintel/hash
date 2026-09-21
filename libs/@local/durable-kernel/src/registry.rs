//! Registers the codecs used to read and write durable records.
//!
//! Each [`DurableRecord`] has a [`RecordDeclaration`] with its stored name,
//! format version, ID algorithm versions, and rules for upgrading stored records.
//! Declarations are registered before reading or appending a shard log. The
//! process-wide registry rejects conflicting declarations for the same name,
//! including their declared codec identities. Applications must keep stored formats compatible
//! across builds.
//!
//! [`crate::domain`] supplies these declarations for application events and snapshots. Custom
//! records implement [`DurableRecord`] and register through [`intern_declaration`].

use alloc::collections::BTreeMap;
use std::sync::{PoisonError, RwLock};

use error_stack::Report;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{domain::PartitionKey, ids::EventId};

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
/// The stored name, supported versions, and compatibility rules for a record type.
///
/// A name identifies one declaration for the lifetime of the process. Registering different
/// codecs or version rules under an existing name fails.
pub struct RecordDeclaration {
    pub name: &'static str,
    /// Identifies the codec within this process. Use `TypeId::of::<RecordType>()`.
    pub codec: core::any::TypeId,
    pub owning_module: &'static str,
    pub emitted_version: u32,
    pub supported_versions: &'static [u32],
    pub algorithm_versions: &'static [AlgorithmVersion],
    pub durability: DurabilityClass,
    pub migration: MigrationPolicy,
}

#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[error(ignore)]
pub enum DeclarationError {
    #[display("journal {name:?} must retain its decoders, but declares {migration:?}")]
    InvalidJournalMigration {
        name: &'static str,
        migration: MigrationPolicy,
    },
    #[display("record name {:?} is already registered with a different declaration", requested.name)]
    ConflictingDeclaration {
        registered: RecordDeclaration,
        requested: RecordDeclaration,
    },
    #[display("record {name:?} declares migration policy {actual:?}, expected {expected:?}")]
    MigrationMismatch {
        name: &'static str,
        expected: MigrationPolicy,
        actual: MigrationPolicy,
    },
    #[display("record {name:?} is not registered")]
    Unregistered { name: &'static str },
}

static DECLARATIONS: RwLock<BTreeMap<&'static str, &'static RecordDeclaration>> =
    RwLock::new(BTreeMap::new());

/// Registers a record declaration and retains one copy for the lifetime of the process.
///
/// Registering an identical declaration again returns the existing copy.
///
/// # Errors
///
/// Returns an error if the name already has a different declaration or a journal declaration
/// allows removal of decoders for stored records.
pub fn intern_declaration(
    declaration: RecordDeclaration,
) -> Result<&'static RecordDeclaration, Report<DeclarationError>> {
    if declaration.migration != MigrationPolicy::NeverRetireWhileUntrimmed
        && declaration.durability == DurabilityClass::ImmutableJournal
    {
        return Err(Report::new(DeclarationError::InvalidJournalMigration {
            name: declaration.name,
            migration: declaration.migration,
        }));
    }
    let mut declarations = DECLARATIONS.write().unwrap_or_else(PoisonError::into_inner);
    if let Some(existing) = declarations.get(declaration.name) {
        return if **existing == declaration {
            Ok(existing)
        } else {
            Err(Report::new(DeclarationError::ConflictingDeclaration {
                registered: **existing,
                requested: declaration,
            }))
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
        .unwrap_or_else(PoisonError::into_inner)
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
    fn encode(&self) -> Result<Vec<u8>, Report<CompatError>>;

    /// Decodes bytes into a supported wire record.
    ///
    /// # Errors
    ///
    /// Returns an error when the bytes are malformed or use an unsupported record format.
    fn decode(bytes: &[u8]) -> Result<Self, Report<CompatError>>;
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
    fn normalize(self) -> Result<Self::Current, Report<CompatError>>;
}

/// Keeps stored bytes readable by converting supported versions to the current record type.
pub trait PureUpcastRecord: VersionedRecord {}

/// Keeps decoders for every record version that journal recovery can read.
pub trait UntrimmedJournalRecord: VersionedRecord {}

/// Upgrades mutable records to the current format. Writes must use compare-and-swap against the
/// version that was read.
pub trait MutableCasRecord: VersionedRecord + Send + Sync {
    /// Builds a wire record from the current representation.
    ///
    /// # Errors
    ///
    /// Returns an error when the current record cannot be represented in the emitted format.
    fn from_current(current: Self::Current) -> Result<Self, Report<CompatError>>;

    /// Converts a record to the format used for new writes.
    ///
    /// # Errors
    ///
    /// Returns an error when normalization or conversion to the emitted format fails.
    fn into_emitted(self) -> Result<Self, Report<CompatError>> {
        Self::from_current(self.normalize()?)
    }
}

/// Records that can be discarded and rebuilt from their source data.
pub trait RebuildableRecord: DurableRecord {}

/// Checks that the record type has a matching registered declaration.
///
/// # Errors
///
/// Returns an error if the declaration is absent, differs from the registered declaration, or
/// disagrees with the type’s migration policy.
pub fn require_interned<T: DurableRecord>() -> Result<(), Report<DeclarationError>> {
    let declaration = T::declaration();
    if T::MIGRATION_POLICY != declaration.migration {
        return Err(Report::new(DeclarationError::MigrationMismatch {
            name: declaration.name,
            expected: declaration.migration,
            actual: T::MIGRATION_POLICY,
        }));
    }
    let declarations = DECLARATIONS.read().unwrap_or_else(PoisonError::into_inner);
    match declarations.get(declaration.name) {
        Some(registered) if **registered == *declaration => Ok(()),
        Some(registered) => Err(Report::new(DeclarationError::ConflictingDeclaration {
            registered: **registered,
            requested: *declaration,
        })),
        None => Err(Report::new(DeclarationError::Unregistered {
            name: declaration.name,
        })),
    }
}

#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum CompatError {
    #[display("unsupported {name} version {version:?}")]
    UnsupportedVersion { name: &'static str, version: String },
    #[display("{name} contains undeclared field {path:?}")]
    ExtraField { name: &'static str, path: String },
    #[display("{name} field {path:?} must be an object")]
    ExpectedObject { name: &'static str, path: String },
    #[display("{name} is missing its version")]
    MissingVersion { name: &'static str },
    #[display("{name} version must be a string")]
    InvalidVersionType { name: &'static str },
    #[display("{name} could not be encoded")]
    Encode { name: &'static str },
    #[display("{name} could not be decoded")]
    Decode { name: &'static str },
    #[display("{name} is {actual_bytes} bytes; maximum is {max_bytes}")]
    TooLarge {
        name: &'static str,
        actual_bytes: usize,
        max_bytes: usize,
    },
    #[display("{name} record partition {actual} does not match the event's partition {expected}")]
    PartitionMismatch {
        name: &'static str,
        expected: PartitionKey,
        actual: PartitionKey,
    },
    #[display("{name} event ID mismatch: expected {expected}, found {actual}")]
    EventIdMismatch {
        name: &'static str,
        expected: EventId,
        actual: EventId,
    },
}

/// Checks a JSON object against an explicit set of field names.
///
/// Check the outer object and each nested object before deserializing.
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
    let object = value
        .as_object()
        .ok_or_else(|| CompatError::ExpectedObject {
            name,
            path: path.to_owned(),
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
    use error_stack::Report;

    use super::{
        CompatError, DeclarationError, DurabilityClass, DurableRecord, MigrationPolicy,
        RecordDeclaration, intern_declaration, require_interned,
    };

    const fn declaration(name: &'static str) -> RecordDeclaration {
        RecordDeclaration {
            name,
            codec: core::any::TypeId::of::<()>(),
            owning_module: "durable_kernel::registry::tests",
            emitted_version: 1,
            supported_versions: &[1],
            algorithm_versions: &[],
            durability: DurabilityClass::ImmutableJournal,
            migration: MigrationPolicy::NeverRetireWhileUntrimmed,
        }
    }

    struct TestRecord<const VERSION: u32>;

    impl<const VERSION: u32> DurableRecord for TestRecord<VERSION> {
        const MIGRATION_POLICY: MigrationPolicy = if VERSION == 0 {
            MigrationPolicy::PureUpcast
        } else {
            MigrationPolicy::NeverRetireWhileUntrimmed
        };

        fn declaration() -> &'static RecordDeclaration {
            const {
                &RecordDeclaration {
                    emitted_version: VERSION,
                    supported_versions: &[VERSION],
                    ..declaration("registry_require_declaration")
                }
            }
        }

        fn encode(&self) -> Result<Vec<u8>, Report<CompatError>> {
            Ok(Vec::new())
        }

        fn decode(_bytes: &[u8]) -> Result<Self, Report<CompatError>> {
            Ok(Self)
        }
    }

    #[test]
    fn require_registered_declaration() {
        let error = require_interned::<TestRecord<1>>()
            .expect_err("an unregistered record should be rejected");
        assert_eq!(
            error.current_context(),
            &DeclarationError::Unregistered {
                name: TestRecord::<1>::declaration().name,
            }
        );

        intern_declaration(*TestRecord::<1>::declaration()).expect("declaration should register");
        require_interned::<TestRecord<1>>()
            .expect("matching registered declaration should be accepted");

        let error = require_interned::<TestRecord<0>>()
            .expect_err("a mismatched migration policy should be rejected");
        assert_eq!(
            error.current_context(),
            &DeclarationError::MigrationMismatch {
                name: TestRecord::<0>::declaration().name,
                expected: MigrationPolicy::NeverRetireWhileUntrimmed,
                actual: MigrationPolicy::PureUpcast,
            }
        );

        let error = require_interned::<TestRecord<2>>()
            .expect_err("a conflicting declaration should be rejected");
        assert_eq!(
            error.current_context(),
            &DeclarationError::ConflictingDeclaration {
                registered: *TestRecord::<1>::declaration(),
                requested: *TestRecord::<2>::declaration(),
            }
        );
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
        let error = intern_declaration(conflicting)
            .expect_err("different versions should conflict with the registered declaration");
        assert_eq!(
            error.current_context(),
            &DeclarationError::ConflictingDeclaration {
                registered: *first,
                requested: conflicting,
            }
        );
    }

    #[test]
    fn journal_records_cannot_retire_decoders() {
        let retiring = RecordDeclaration {
            migration: MigrationPolicy::PureUpcast,
            ..declaration("kernel_registry_retiring_journal")
        };
        let error = intern_declaration(retiring)
            .expect_err("journal declarations should retain their decoders");
        assert_eq!(
            error.current_context(),
            &DeclarationError::InvalidJournalMigration {
                name: retiring.name,
                migration: MigrationPolicy::PureUpcast,
            }
        );
    }
}
