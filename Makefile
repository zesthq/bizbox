ifneq (,$(wildcard .env))
include .env
export
endif

APP     ?= bizbox
DB      ?= bizbox-db
ORG     ?=
REGION  ?= syd
VOLUME  ?= paperclip_data
VOL_GB  ?= 10

.PHONY: fly-check-app fly-check-org fly-setup fly-db fly-volume fly-secrets bootstrap deploy admin-invite logs ssh status secrets

fly-check-org:
	@if [ -z "$(strip $(ORG))" ]; then \
		echo "ORG is required for Fly bootstrap."; \
		echo "Set ORG in your environment or .env file, or run make with ORG=<your-fly-org>."; \
		exit 1; \
	fi

fly-check-app:
	@if ! fly status --app $(APP) >/dev/null 2>&1; then \
		echo "Fly app '$(APP)' was not found for the current Fly account/org."; \
		echo "Run 'make bootstrap' for first-time setup, or set APP=<your-app> if you already created a different app."; \
		exit 1; \
	fi

## First-time setup (run once, in order)
fly-setup: fly-check-org
	@if fly status --app $(APP) >/dev/null 2>&1; then \
		echo "Fly app '$(APP)' already exists; skipping app creation."; \
	else \
		fly apps create $(APP) --org $(ORG) --yes; \
	fi

fly-db: fly-check-org
	@if fly status --app $(DB) >/dev/null 2>&1; then \
		echo "Fly Postgres app '$(DB)' already exists; skipping database creation."; \
	else \
		fly postgres create --name $(DB) --org $(ORG) --region $(REGION) --initial-cluster-size 1 --vm-cpu-kind shared --vm-cpus 1 --vm-memory 1024 --volume-size 1; \
	fi
	@if fly secrets list --app $(APP) 2>/dev/null | grep -q '^DATABASE_URL'; then \
		echo "DATABASE_URL is already set on '$(APP)'; skipping Postgres attach."; \
	else \
		fly postgres attach $(DB) --app $(APP) --yes; \
	fi

fly-volume:
	@if fly volumes list --app $(APP) 2>/dev/null | grep -q '$(VOLUME)'; then \
		echo "Fly volume '$(VOLUME)' already exists on '$(APP)'; skipping volume creation."; \
	else \
		fly volumes create $(VOLUME) --app $(APP) --region $(REGION) --size $(VOL_GB) --yes; \
	fi

fly-secrets:
	@if fly secrets list --app $(APP) 2>/dev/null | grep -q '^BETTER_AUTH_SECRET'; then \
		echo "BETTER_AUTH_SECRET is already set on '$(APP)'; preserving existing auth secret."; \
		fly secrets set PAPERCLIP_PUBLIC_URL="https://$(APP).fly.dev" --app $(APP); \
	else \
		fly secrets set \
			BETTER_AUTH_SECRET="$$(openssl rand -hex 32)" \
			PAPERCLIP_PUBLIC_URL="https://$(APP).fly.dev" \
			--app $(APP); \
	fi

## Full bootstrap (run once after cloning on a fresh Fly account)
bootstrap: fly-setup fly-db fly-volume fly-secrets

## Deploy
deploy: fly-check-app
	fly deploy --app $(APP)

## Generate the first instance admin invite URL
admin-invite: fly-check-app
	fly ssh console --app $(APP) --command "sh -lc 'cd /app && pnpm paperclipai auth bootstrap-ceo'"

## Ops helpers
logs:
	fly logs --app $(APP)

ssh:
	fly ssh console --app $(APP)

status:
	fly status --app $(APP)

secrets:
	fly secrets list --app $(APP)
