use alloc::{borrow::Cow, vec::Vec};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::{ExternalProperties, PropertyBag, Run, SchemaVersion};

/// Specifies the version of the file format and contains the output from one or more runs.
///
/// See [SARIF specification §3.13](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc10540916)
///
///
/// # Example
///
/// ```json
/// {
///   "version": "2.1.0",
///   "runs": [
///     {
///       ...             # A run object
///     },
///     ...
///     {
///       ...             # Another run object
///     }
///   ]
/// }
/// ```
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct SarifLog<'s> {
    /// The format version of the SARIF specification to which this log file conforms.
    ///
    /// See [SARIF specification §3.13.2](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc10540918)
    ///
    ///
    /// ## Note
    ///
    /// This will make it easier for parsers to handle multiple versions of the SARIF format if new
    /// versions are defined in the future.
    pub version: SchemaVersion,

    /// The absolute URI from which a JSON schema document describing the version of the SARIF
    /// format to which this log file conforms can be obtained.
    ///
    /// If the `$schema` property is present, the JSON schema obtained from that URI must describe
    /// the version of the SARIF format specified by the [`version`] property.
    ///
    /// If the `$schema` property is not explicitly set, a default based on the [`version`]
    /// property is used.
    ///
    /// See [SARIF specification §3.13.3](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc10540919)
    ///
    ///
    /// ## Note
    ///
    /// The purpose of the `$schema` property is to allow JSON schema validation tools to locate an
    /// appropriate schema against which to validate the log file. This is useful, for example, for
    /// tool authors who wish to ensure that logs produced by their tools conform to the SARIF
    /// format.
    ///
    /// ## Note
    ///
    /// The SARIF schema is available at <https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json>.
    ///
    /// [`version`]: [Self::version]
    #[cfg_attr(
        feature = "serde",
        serde(
            rename = "$schema",
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub schema: Option<Cow<'s, str>>,

    /// The set of runs contained in this log file.
    ///
    /// The value of `runs` must be an array with at least one element except in the following
    /// circumstances:
    ///
    ///   - If a SARIF producer finds no data with which to populate runs, then its value must be
    ///     an empty array.
    ///
    ///     ## Note
    ///
    ///     This would happen if, for example, the log file were the output of a query on a result
    ///     management system, and the query did not match any runs stored in the result management
    ///     system.
    ///
    ///  - If a SARIF producer tries to populate runs but fails, then its value must be `null`.
    ///
    ///    ## Note
    ///
    ///    This would happen if, for example, the log file were the output of a query on a result
    ///    management system, and the query was malformed.
    ///
    /// See [SARIF specification §3.13.4](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc10540920)
    #[cfg_attr(
        feature = "serde",
        serde(borrow, deserialize_with = "Option::deserialize")
    )]
    pub runs: Option<Vec<Run<'s>>>,

    /// References to external property files that share data between runs.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub inline_external_properties: Vec<ExternalProperties<'s>>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
