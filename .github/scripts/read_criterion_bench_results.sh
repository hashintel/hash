#!/usr/bin/env bash

REPOSITORY_ROOT="$(git rev-parse --show-toplevel)"

BASE=base
NEW=new

while [[ $# -gt 0 ]]; do
    case "$1" in
        -b|--base)
            BASE=$2
            shift 2
            ;;
        -n|--new)
            NEW=$2
            shift 2
            ;;
        *)
            # shellcheck disable=SC2016
            echo 'Unknown option: `$1`'
            echo "usage: $0 [-b|--base <base>] [-n|--new <new>]"
            exit 1
            ;;
    esac
done

function convert_nanos() {
  if [[ $1 -lt 10000 ]]; then
    echo "$1 ns"
  elif [[ $1 -lt 10000000 ]]; then
    echo "$(( $1 / 1000 )) µs"
  elif [[ $1 -lt 10000000000 ]]; then
    echo "$(( $1 / 1000000 )) ms"
  else
    echo "$(( $1 / 10000000000 )) s"
  fi
}

last_group_id=""

# Usage: compare <new> [old]
function compare() {
    group_id=$(jq -r '.group_id' "$1/benchmark.json")
    if [[ $group_id != "$last_group_id" ]]; then
        last_group_id=$group_id
        echo "### $group_id"
        echo
    fi

    function_id=$(jq -r '.function_id' "$1/benchmark.json")
    value_str=$(jq -r '.value_str' "$1/benchmark.json")

    new_mean=$(jq -r '.mean.point_estimate' "$1/estimates.json")
    new_stderr=$(jq -r '.mean.standard_error' "$1/estimates.json")
    new_mean=${new_mean%.*}
    new_stderr=${new_stderr%.*}
    if [[ -n $2 ]]; then
        old_mean=$(jq -r '.mean.point_estimate' "$2/estimates.json")
        old_stderr=$(jq -r '.mean.standard_error' "$2/estimates.json")
        old_mean=${old_mean%.*}
        old_stderr=${old_stderr%.*}
        echo "$function_id $value_str"
        echo "$(convert_nanos $old_mean) ± $(convert_nanos "$old_stderr") -> $(convert_nanos $new_mean) ± $(convert_nanos $new_stderr)"

        is_regression=$(bc <<< "$new_mean > $old_mean")
        percent=$(bc <<< "scale=2; 100 * ($new_mean - $old_mean) / $old_mean")
        echo "Change: $percent%"
    fi


}

for group in "$REPOSITORY_ROOT/target/criterion/"*; do
    if [[ -d "$group" ]]; then
        group_used=false
        for func in "$group"/*; do
            if [[ -d "$func" ]]; then
                for value in "$func"/*; do
                    if [[ -d "$value" ]]; then
                        if [[ -d "$value/$NEW" ]]; then
                            if [[ -d "$value/$BASE" ]]; then
                                compare "$value/$NEW" "$value/$BASE"
                            else
                                compare "$value/$NEW"
                            fi
                            group_used=true
                        fi
                    fi
                done
            fi
        done
        if [[ $group_used == true ]]; then
            echo
        fi
    fi
done
