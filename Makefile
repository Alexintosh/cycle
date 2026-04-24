SHELL := /bin/bash

.PHONY: help frontend backend dev install typecheck test docker-up docker-down

help:
	@echo "Available targets:"
	@echo "  make frontend   Run the React frontend"
	@echo "  make backend    Run the Elysia backend"
	@echo "  make dev        Run frontend and backend together"
	@echo "  make docker-up  Build and run the Docker Compose stack"
	@echo "  make docker-down Stop the Docker Compose stack"
	@echo "  make install    Install frontend and backend dependencies"
	@echo "  make typecheck  Run typecheck in frontend and backend"
	@echo "  make test       Run frontend and backend tests"

frontend:
	cd apps/frontend && bun run dev

backend:
	cd apps/backend && bun run dev

dev:
	@trap 'kill 0' INT TERM EXIT; \
	$(MAKE) backend & \
	$(MAKE) frontend & \
	wait

install:
	cd apps/backend && bun install
	cd apps/frontend && bun install

typecheck:
	cd apps/backend && bun run typecheck
	cd apps/frontend && bun run typecheck

test:
	cd apps/backend && bun test
	cd apps/frontend && bun test

docker-up:
	docker compose up --build

docker-down:
	docker compose down
