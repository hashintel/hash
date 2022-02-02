// https://core.hash.ai/@hash/interconnected-call-center/3.2.1
mod interconnected_call_center {
    use crate::run_test;

    // optimization experiment is not implemented
    run_test!(interconnected_call_center, experiment: optimize_number_of_centers, #[ignore]);
    // optimization experiment is not implemented
    run_test!(interconnected_call_center, experiment: optimize_transfer_capacity, #[ignore]);
    // Bug: https://app.asana.com/0/1201707629991362/1201756436717252/f
    run_test!(interconnected_call_center, experiment: call_time_linspace, #[ignore]);
    // Bug: https://app.asana.com/0/1201707629991362/1201756436717252/f
    run_test!(interconnected_call_center, experiment: call_time_arange, #[ignore]);
}
