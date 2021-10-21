#!/bin/bash
yarn ws:hash-backend build
yarn ws:hash-backend codegen
yarn ws:hash-backend dev
