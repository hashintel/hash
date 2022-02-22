mod js {
    use crate::run_test;

    run_test!(helper, JavaScript);
    run_test!(no_recipient, JavaScript);
    run_test!(one_recipient, JavaScript);
    run_test!(multiple_recipients, JavaScript);

    run_test!(all_types, JavaScript);
    run_test!(nested_types, JavaScript);
    // TODO: Make mapbox work
    //   see https://app.asana.com/0/1199548034582004/1200329934588478/f
    run_test!(mapbox, JavaScript, #[ignore]);

    run_test!(create_agent, JavaScript);
    run_test!(remove_agent, JavaScript);
    run_test!(remove_self, JavaScript);
    run_test!(stop_simulation, JavaScript);
}

mod py {
    use crate::run_test;

    run_test!(helper, Python, #[ignore]);
    run_test!(no_recipient, Python, #[ignore]);
    run_test!(one_recipient, Python, #[ignore]);
    run_test!(multiple_recipients, Python, #[ignore]);

    run_test!(nested_types, Python, #[ignore]);
    run_test!(all_types, Python, #[ignore]);
    run_test!(mapbox, Python, #[ignore]);

    run_test!(create_agent, Python, #[ignore]);
    run_test!(remove_agent, Python, #[ignore]);
    run_test!(remove_self, Python, #[ignore]);
    run_test!(stop_simulation, Python, #[ignore]);
}
