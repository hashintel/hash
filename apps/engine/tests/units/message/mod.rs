mod js {
    use crate::run_test;

    run_test!(helper, JavaScript);
    run_test!(no_recipient, JavaScript);
    run_test!(one_recipient, JavaScript);
    run_test!(multiple_recipients, JavaScript);

    run_test!(all_types, JavaScript);
    run_test!(nested_types, JavaScript);
    // see https://app.asana.com/0/1199548034582004/1200329934588478/f
    run_test!(mapbox, JavaScript, #[ignore = "unimplemented: MapBox is currently not available"]);

    run_test!(create_agent, JavaScript);
    run_test!(remove_agent, JavaScript);
    run_test!(remove_self, JavaScript);
    run_test!(stop_simulation, JavaScript);
}

mod py {
    use crate::run_test;

    run_test!(helper, Python);
    run_test!(no_recipient, Python);
    run_test!(one_recipient, Python);
    run_test!(multiple_recipients, Python);

    // Bug: https://app.asana.com/0/1199548034582004/1202011714603646/f
    run_test!(nested_types, Python, #[ignore = "bug: Python and arrow-rs have different expectations about FixedSizeLists"]);
    // Bug: https://app.asana.com/0/1199548034582004/1202011714603646/f
    run_test!(all_types, Python, #[ignore = "bug: Python and arrow-rs have different expectations about FixedSizeLists"]);
    // see https://app.asana.com/0/1199548034582004/1200329934588478/f
    run_test!(mapbox, Python, #[ignore = "unimplemented: MapBox is currently not available"]);

    run_test!(create_agent, Python);
    run_test!(remove_agent, Python);
    run_test!(remove_self, Python);
    run_test!(stop_simulation, Python);
}
