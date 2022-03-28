import logging
import os
import sys

from runner import Runner


def get_logging_level(value):
    # TODO: Forward logging to rust-tracing
    #   see https://app.asana.com/0/1199548034582004/1201989297281277/f
    value = "to-be-fixed"

    value = value.lower()
    # TODO: Make this a `match` when upgrading to Python 3.10
    if value == "debug":
        return logging.DEBUG
    if value == "info":
        return logging.INFO
    if value == "warn":
        return logging.WARN
    if value == "error":
        return logging.ERROR
    return None


def logging_setup():
    # Use the same logging levels as Rust
    levels = os.getenv("RUST_LOG")
    level = None
    if levels is not None:
        kv_pairs = levels.split(",")
        for kv_pair in kv_pairs:
            pair = kv_pair.replace(" ", "").split("=")
            if len(pair) != 2:
                continue
            if pair[0] in ["hash_engine", "hash_engine_lib"]:
                possible_level = get_logging_level(pair[1])
                if possible_level is not None:
                    level = possible_level
                    break

    logging.basicConfig(level=level)


if __name__ == "__main__":
    logging_setup()

    script_path = sys.argv[3]
    sys.path.append(script_path)
    sys.path.append(script_path + "/fbs")

    experiment_id = sys.argv[1]
    worker_index = int(sys.argv[2])
    logging.info(
        "Running Python runner for experiment id %s and worker index %s",
        experiment_id,
        worker_index,
    )
    runner = Runner(experiment_id, worker_index)

    runner.run()
