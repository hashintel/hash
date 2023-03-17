#![allow(dead_code)]

pub mod status_payloads {
    include!(concat!(env!("OUT_DIR"), "/status_payloads.rs"));
}
