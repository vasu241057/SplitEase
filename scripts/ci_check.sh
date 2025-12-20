#!/bin/bash
set -e # Exit on any error

echo "========================================"
echo "PHASE 3: CI/CD RELIABILITY CHECK"
echo "========================================"

echo "[1/3] Running Linter..."
npm run lint

echo "[2/3] Running Frontend Tests..."
npm run test

echo "[3/3] Running Backend Unit Tests..."
npm run test:backend

echo "========================================"
echo "✅ CI CHECKS PASSED. SYSTEM IS STABLE."
echo "========================================"
