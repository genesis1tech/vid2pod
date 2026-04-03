#!/bin/sh
# Push DB schema then start the server
echo "Pushing database schema..."
npx drizzle-kit push --config drizzle.config.ts 2>&1 || echo "Schema push failed, continuing..."
echo "Starting server..."
exec node dist/index.js
