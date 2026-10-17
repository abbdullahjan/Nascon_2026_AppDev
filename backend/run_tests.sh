#!/usr/bin/env bash
# run_tests.sh — Run all backend unit tests and output coverage
# Usage: bash run_tests.sh

set -e

echo "============================================"
echo " NaSCon '26 Backend — Unit Test Runner"
echo "============================================"

cd "$(dirname "$0")"

# Set test salt so HMAC tests use the Appendix A vector
export DAY1_SALT=demo-salt
export JWT_SECRET=test-secret
export JWT_EXPIRES_IN=2h
export NODE_ENV=test

# Install deps if node_modules missing
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm ci --only=production
  npm install --save-dev jest supertest
fi

# Run Jest with coverage
npx jest --runInBand --forceExit --coverage \
  --coverageReporters=json-summary,text \
  --collectCoverageFrom="src/**/*.js"

echo ""
echo "Tests complete."
