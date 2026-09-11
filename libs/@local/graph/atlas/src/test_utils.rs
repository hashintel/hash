//! Feature-only scenarios for integration tests of private Atlas machinery.
//!
//! Enable `test-utils` to exercise transfers with an independently configured S3 client. Each
//! scenario owns its local fixture and leaves remote cleanup to the test's bucket owner.

pub use crate::file::generation::test_utils::{generation_corrupt_artifact, generation_round_trip};
