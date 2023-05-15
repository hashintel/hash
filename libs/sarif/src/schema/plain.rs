//! Temporary module containing POD types for the SARIF schema.

mod artifact;
mod artifact_change;
mod artifact_content;
mod artifact_location;
mod attachment;
mod code_flow;
mod configuration_override;
mod conversion;
mod edge;
mod edge_traversal;
mod exception;
mod external_properties;
mod external_property_file_reference;
mod external_property_file_references;
mod fix;
mod graph;
mod graph_traversal;
mod invocation;
mod level;
mod location;
mod location_relationship;
mod logical_location;
mod message;
mod multiformat_message_string;
mod node;
mod notification;
mod physical_location;
mod property_bag;
mod rectangle;
mod region;
mod replacement;
mod reporting_configuration;
mod reporting_descriptor;
mod reporting_descriptor_reference;
mod reporting_descriptor_relationship;
mod result;
mod result_provenance;
mod run;
mod run_automation_details;
mod special_location;
mod stack;
mod stack_frame;
mod suppression;
mod thread_flow;
mod thread_flow_location;
mod tool;
mod tool_component;
mod tool_component_reference;
mod translation_metadata;
mod version_control_details;
mod web_request;
mod web_response;

pub use self::{
    artifact::{Artifact, ArtifactRole},
    artifact_change::ArtifactChange,
    artifact_content::ArtifactContent,
    artifact_location::ArtifactLocation,
    attachment::Attachment,
    code_flow::CodeFlow,
    configuration_override::ConfigurationOverride,
    conversion::Conversion,
    edge::Edge,
    edge_traversal::EdgeTraversal,
    exception::Exception,
    external_properties::ExternalProperties,
    external_property_file_reference::ExternalPropertyFileReference,
    external_property_file_references::ExternalPropertyFileReferences,
    fix::Fix,
    graph::Graph,
    graph_traversal::GraphTraversal,
    invocation::Invocation,
    level::Level,
    logical_location::LogicalLocation,
    message::Message,
    multiformat_message_string::MultiformatMessageString,
    node::Node,
    notification::Notification,
    property_bag::PropertyBag,
    rectangle::Rectangle,
    region::Region,
    replacement::Replacement,
    reporting_configuration::ReportingConfiguration,
    reporting_descriptor::ReportingDescriptor,
    reporting_descriptor_reference::ReportingDescriptorReference,
    reporting_descriptor_relationship::ReportingDescriptorRelationship,
    result::{Result, ResultKind},
    result_provenance::ResultProvenance,
    run::Run,
    run_automation_details::RunAutomationDetails,
    special_location::SpecialLocation,
    stack::Stack,
    stack_frame::StackFrame,
    suppression::{Suppression, SuppressionKind, SuppressionStatus},
    thread_flow::ThreadFlow,
    thread_flow_location::ThreadFlowLocation,
    tool::Tool,
    tool_component::ToolComponent,
    tool_component_reference::ToolComponentReference,
    translation_metadata::TranslationMetadata,
    version_control_details::VersionControlDetails,
    web_request::WebRequest,
    web_response::WebResponse,
};
