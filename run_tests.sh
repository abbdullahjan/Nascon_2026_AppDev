#!/bin/sh
set -e
cd "$(dirname "$0")/backend" && sh run_tests.sh
