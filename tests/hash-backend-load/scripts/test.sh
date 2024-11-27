#!/usr/bin/env bash

for file in scenarios/*.yml;
    do artillery run --config artillery.yml "$file" --environment functional;
done
