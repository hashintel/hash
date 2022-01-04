use std::sync::Arc;

use futures::FutureExt;
use tokio::time::Duration;

use super::{Error, Result};
use crate::{
    datastore::prelude::{SharedStore, Store},
    experiment::controller::comms::{sim_status::SimStatusSend, simulation::SimCtlRecv},
    hash_types::worker::RunnerError,
    output::SimulationOutputPersistenceRepr,
    proto::SimulationShortId,
    simulation::{
        agent_control::AgentControl, comms::Comms, controller::sim_control::SimControl,
        engine::Engine, package::run::Packages, status::SimStatus,
    },
    SimRunConfig,
};

enum LoopControl {
    Continue,
    Stop,
}

// TODO: Sort out error into/from to avoid so many explicit err conversions using to_string
pub async fn sim_run<P: SimulationOutputPersistenceRepr>(
    config: Arc<SimRunConfig>,
    shared_store: Arc<SharedStore>,
    comms: Comms,
    packages: Packages,
    mut sim_from_exp: SimCtlRecv,
    mut sims_to_exp: SimStatusSend,
    mut persistence_service: P,
) -> Result<SimulationShortId> {
    // TODO: This is (sometimes?) 0, why?
    let sim_run_id = config.sim.id;
    let max_num_steps = config.sim.max_num_steps;
    log::info!(
        "Beginning simulation run with id {} for a maximum of {} steps",
        &sim_run_id,
        max_num_steps,
    );

    let uninitialized_store = Store::new_uninitialized(shared_store, &config);

    let mut engine = Engine::new(packages, uninitialized_store, comms, config.clone())
        .await
        .map_err(|sim_err| Error::from(sim_err.to_string()))?;

    // We also store the initial state in the persistence service
    let initial_output = engine
        .run_output_packages()
        .await
        .map_err(|e| Error::from(e.to_string()))?;
    persistence_service.add_step_output(initial_output).await?;
    let now = std::time::Instant::now();
    let mut steps_taken = 0;
    let mut early_stop = false;
    let mut stop_msg = None;
    'sim_main: loop {
        // Behaviors expect context.step() to give the current step rather than steps_taken
        let current_step = steps_taken + 1;
        log::trace!("Current step: {}", current_step);
        if current_step >= max_num_steps {
            break;
        }

        if let LoopControl::Stop = maybe_handle_sim_ctl_msg(&mut sim_from_exp).await? {
            // The experiment controller has signalled to stop
            break;
        }

        // Take a step in the simulation
        let step_result = match engine.next(current_step).await {
            Ok(step_result) => step_result,
            Err(error) => {
                log::error!("Got error within the engine step process: {:?}", error);
                // Try to persist before exiting
                let persistence_result = Some(persistence_service.finalize(&config).await?);
                let runner_error = RunnerError {
                    message: Some(format!("{:?}", error)),
                    code: None,
                    line_number: None,
                    file_name: None,
                    details: None,
                    is_warning: false,
                    is_internal: true, // The error is from within the engine step process.
                };
                sims_to_exp
                    .send(
                        SimStatus::error(
                            sim_run_id,
                            steps_taken as isize,
                            runner_error,
                            persistence_result,
                        )
                        .map_err(|err| Error::from(format!("{:?}", err)))?,
                    )
                    .await
                    .map_err(|exp_controller_err| {
                        Error::from(format!(
                            "Experiment controller error: {:?}",
                            exp_controller_err
                        ))
                    })?;
                return Err(Error::from(format!("Simulation error: {:?}", error)));
            }
        };

        // Persist the output
        persistence_service
            .add_step_output(step_result.output)
            .await?;
        if let AgentControl::Stop(msg) = step_result.agent_control {
            early_stop = true;
            stop_msg = Some(msg);
            // Break before `send`, because stop messages (like other messages) are handled at the
            // start of a step, before running behaviors, so the stop message was already sent on
            // the previous step.
            break 'sim_main;
        }

        // TODO: should the SimStatus be current_step here or steps_taken (it is after .next())
        sims_to_exp
            .send(SimStatus::running(config.sim.id, steps_taken as isize))
            .await
            .map_err(|exp_controller_err| {
                Error::from(format!(
                    "Experiment controller error: {:?}",
                    exp_controller_err
                ))
            })?;

        steps_taken += 1;
    }
    let main_loop_dur = now.elapsed().as_millis();

    // Tell the experiment controller that the sim is stopping
    sims_to_exp
        .send(SimStatus::stop_signal(sim_run_id))
        .await
        .map_err(|exp_controller_err| {
            Error::from(format!(
                "Experiment controller error: {:?}",
                exp_controller_err
            ))
        })?;

    let now = std::time::Instant::now();
    let persistence_result = persistence_service.finalize(&config).await?;
    sims_to_exp
        .send(
            SimStatus::ended(
                sim_run_id,
                steps_taken as isize,
                early_stop,
                stop_msg,
                persistence_result,
            )
            .map_err(|sim_err| Error::from(format!("Simulation error: {:?}", sim_err)))?,
        )
        .await
        .map_err(|exp_controller_err| {
            Error::from(format!(
                "Experiment controller error: {:?}",
                exp_controller_err
            ))
        })?;
    let persistence_dur = now.elapsed().as_millis();

    log::info!(
        "Finished simulation run. Main loop took {} ms. Persistence took: {} ms",
        main_loop_dur,
        persistence_dur
    );

    // Allow experiment main loop to receive statuses.
    tokio::time::sleep(Duration::from_secs(1)).await;
    Ok(config.sim.id)
}

async fn maybe_handle_sim_ctl_msg(sim_from_exp: &mut SimCtlRecv) -> Result<LoopControl> {
    if let Some(Some(control)) = sim_from_exp.recv().now_or_never() {
        match control {
            SimControl::Pause => loop {
                if let Some(control) = sim_from_exp.recv().await {
                    match control {
                        SimControl::Pause => {
                            log::warn!("Pausing when already paused");
                        }
                        SimControl::Resume => {
                            break;
                        }
                        SimControl::Stop => return Ok(LoopControl::Stop),
                    }
                } else {
                    log::warn!("Experiment runner exited while paused.");
                    return Ok(LoopControl::Stop);
                }
            },
            SimControl::Resume => {
                log::warn!("Resuming when not paused");
            }
            SimControl::Stop => return Ok(LoopControl::Stop),
        }
    }
    Ok(LoopControl::Continue)
}
