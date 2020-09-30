#!/usr/bin/env bash
# rm -rf src/flats/*
rm -rf src/flats/*
./node_modules/.bin/truffle-flattener contracts/IR.sol > flats/IR_flat.sol