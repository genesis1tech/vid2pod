#!/bin/bash
set -e

echo "Starting Vid2Pod development environment..."

docker compose up -d postgres redis minio

echo "Waiting for services..."
sleep 3

echo "Installing dependencies..."
npm install

echo "Creating MinIO bucket..."
docker compose exec minio mc alias set local http://localhost:9000 minioadmin minioadmin 2>/dev/null || true
docker compose exec minio mc mb local/vid2pod-media 2>/dev/null || true

echo ""
echo "Run these in separate terminals:"
echo "  npm run dev          # Start API server"
echo "  npm run dev:worker   # Start processing worker"
echo "  npm run dev:ui       # Start frontend dev server"
echo ""
echo "Or run everything with Docker:"
echo "  docker compose up"
