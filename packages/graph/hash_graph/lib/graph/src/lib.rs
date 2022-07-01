//! The entity-graph query-layer for the HASH datastore

#![feature(lint_reasons, once_cell)]
#![cfg_attr(all(doc, nightly), feature(doc_auto_cfg))]
#![cfg_attr(not(miri), doc(test(attr(deny(warnings, clippy::all)))))]
#![warn(
    clippy::pedantic,
    clippy::nursery,
    // Encountering a lot of false positives appearing on things like `derive` macros. We should revisit
    // periodically in case the bug gets fixed
    // clippy::allow_attributes_without_reason,
    clippy::as_underscore,
    clippy::clone_on_ref_ptr,
    clippy::create_dir,
    clippy::dbg_macro,
    clippy::default_union_representation,
    clippy::deref_by_slicing,
    clippy::empty_structs_with_brackets,
    clippy::filetype_is_file,
    clippy::get_unwrap,
    clippy::print_stdout,
    clippy::print_stderr,
    clippy::rc_buffer,
    clippy::rc_mutex,
    clippy::same_name_method,
    clippy::str_to_string,
    clippy::string_add,
    clippy::string_slice,
    clippy::string_to_string,
    clippy::try_err,
    clippy::undocumented_unsafe_blocks,
    clippy::unnecessary_self_imports,
    clippy::unwrap_used,
    clippy::use_debug,
    clippy::verbose_file_reads
)]
#![allow(
    clippy::module_name_repetitions,
    reason = "This encourages importing `as` which breaks IDEs"
)]

pub mod datastore;
pub mod types;
