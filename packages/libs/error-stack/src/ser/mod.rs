//! Serialization logic for report
//!
//! This implements the following serialization logic (rendered in json)
//!
//! ```json
//! {
//!   "frames": [
//!     {
//!       "type": "attachment",
//!       "letter": "A"
//!     },
//!     {
//!       "type": "attachment",
//!       "letter": "B"
//!     },
//!     {
//!       "type": "context",
//!       "letter": "C"
//!     }
//!   ],
//!   "sources": [
//!     {
//!       "frames": [
//!         {
//!           "type": "attachment",
//!           "letter": "E"
//!         },
//!         {
//!           "type": "attachment",
//!           "letter": "G"
//!         },
//!         {
//!           "type": "context",
//!           "letter": "H"
//!         }
//!       ],
//!       "sources": []
//!     },
//!     {
//!       "frames": [
//!         {
//!           "type": "context",
//!           "letter": "F"
//!         }
//!       ],
//!       "sources": []
//!     }
//!   ],
//! }
//! ```

mod hook;
