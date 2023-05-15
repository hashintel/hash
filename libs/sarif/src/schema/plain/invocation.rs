use alloc::{borrow::Cow, collections::BTreeMap, vec::Vec};

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

use crate::schema::{ArtifactLocation, ConfigurationOverride, Notification, PropertyBag};

/// The runtime environment of the analysis tool run.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "serde",
    derive(Serialize, Deserialize),
    serde(rename_all = "camelCase", deny_unknown_fields)
)]
pub struct Invocation<'s> {
    /// The command line used to invoke the tool.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub command_line: Option<Cow<'s, str>>,

    /// An array of strings, containing in order the command line arguments passed to the tool from
    /// the operating system.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub arguments: Vec<Cow<'s, str>>,

    /// The locations of any response files specified on the tool's command line.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub response_files: Vec<ArtifactLocation<'s>>,

    /// The Coordinated Universal Time (UTC) date and time at which the invocation started.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Option::is_none",)
    )]
    pub start_time_utc: Option<Cow<'s, str>>,

    /// The Coordinated Universal Time (UTC) date and time at which the invocation ended.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub end_time_utc: Option<Cow<'s, str>>,

    /// The process exit code.
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none",)
    )]
    pub exit_code: Option<i64>,

    /// An array of configurationOverride objects that describe rules related runtime overrides.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub rule_configuration_overrides: Vec<ConfigurationOverride<'s>>,

    /// An array of configurationOverride objects that describe notifications related runtime
    /// overrides.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub notification_configuration_overrides: Vec<ConfigurationOverride<'s>>,

    /// A list of runtime conditions detected by the tool during the analysis.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub tool_execution_notifications: Vec<Notification<'s>>,

    /// A list of conditions detected by the tool that are relevant to the tool's configuration.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "Vec::is_empty")
    )]
    pub tool_configuration_notifications: Vec<Notification<'s>>,

    /// The reason for the process exit.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub exit_code_description: Option<Cow<'s, str>>,

    /// The name of the signal that caused the process to exit.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub exit_signal_name: Option<Cow<'s, str>>,

    /// The numeric value of the signal that caused the process to exit.
    #[cfg_attr(
        feature = "serde",
        serde(default, skip_serializing_if = "Option::is_none",)
    )]
    pub exit_signal_number: Option<i64>,

    /// The reason given by the operating system that the process failed to start.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub process_start_failure_message: Option<Cow<'s, str>>,

    /// Specifies whether the tool's execution completed successfully.
    pub execution_successful: bool,

    /// The machine on which the invocation occurred.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub machine: Option<Cow<'s, str>>,

    /// The account under which the invocation occurred.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub account: Option<Cow<'s, str>>,

    /// The id of the process in which the invocation occurred.
    #[cfg_attr(
        feature = "serde",
        serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub process_id: Option<i64>,

    /// Specifies the location of an artifact.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub executable_location: Option<ArtifactLocation<'s>>,

    /// Specifies the location of an artifact.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub working_directory: Option<ArtifactLocation<'s>>,

    /// The environment variables associated with the analysis tool process, expressed as key/value
    /// pairs.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "BTreeMap::is_empty")
    )]
    pub environment_variables: BTreeMap<Cow<'s, str>, Cow<'s, str>>,

    /// Specifies the location of an artifact.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub stdin: Option<ArtifactLocation<'s>>,

    /// Specifies the location of an artifact.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub stdout: Option<ArtifactLocation<'s>>,

    /// Specifies the location of an artifact.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub stderr: Option<ArtifactLocation<'s>>,

    /// Specifies the location of an artifact.
    #[cfg_attr(
        feature = "serde",
        serde(
            borrow,
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::serde::optional"
        )
    )]
    pub stdout_stderr: Option<ArtifactLocation<'s>>,

    /// Key/value pairs that provide additional information about the object.
    #[cfg_attr(
        feature = "serde",
        serde(borrow, default, skip_serializing_if = "PropertyBag::is_empty")
    )]
    pub properties: PropertyBag<'s>,
}
