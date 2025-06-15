#!/bin/bash

echo "Stopping and removing containers..."
docker compose down

echo "Removing volume 'backend_postgres_data'..."
docker volume rm backend_postgres_data

echo "Rebuilding images with no cache..."
docker compose build --no-cache

echo "Starting containers..."
docker compose up
