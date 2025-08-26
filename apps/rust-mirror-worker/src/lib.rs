use worker::*;

#[worker::event(scheduled)]
async fn scheduled(event: ScheduledEvent, env: Env, context: ScheduleContext) {
    console_error_panic_hook::set_once();

    let bucket = env
        .bucket("RUST_MIRROR_BUCKET")
        .expect("RUST_MIRROR_BUCKET not found");

    let list = bucket
        .list()
        .limit(1000)
        .execute()
        .await
        .expect("Failed to list bucket");

    console_log!("List: {:#?}", list);

    console_log!("Scheduled event: {:#?}", event);
    console_log!("Schedule context: {:#?}", context);
    console_log!("Env: {:#?}", env);
}
