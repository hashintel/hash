pub mod status_payloads {
    #![expect(dead_code)]
    #![expect(warnings)]
    #![expect(clippy::all)]
    #![expect(rustdoc::all)]
    include!(concat!(env!("OUT_DIR"), "/status_payloads.rs"));
}
