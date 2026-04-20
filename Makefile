APP     = bizbox
DB      = bizbox-db
REGION  = syd
VOLUME  = paperclip_data
VOL_GB  = 10

.PHONY: fly-setup fly-db fly-volume fly-secrets deploy logs ssh status

## First-time setup (run once, in order)
fly-setup:
	fly apps create $(APP)

fly-db:
	fly postgres create --name $(DB) --region $(REGION)
	fly postgres attach $(DB) --app $(APP)

fly-volume:
	fly volumes create $(VOLUME) --region $(REGION) --size $(VOL_GB)

fly-secrets:
	fly secrets set \
		BETTER_AUTH_SECRET="$$(openssl rand -hex 32)" \
		PAPERCLIP_PUBLIC_URL="https://$(APP).fly.dev" \
		--app $(APP)

## Full bootstrap (run once after cloning on a fresh Fly account)
bootstrap: fly-setup fly-db fly-volume fly-secrets

## Deploy
deploy:
	fly deploy --app $(APP)

## Ops helpers
logs:
	fly logs --app $(APP)

ssh:
	fly ssh console --app $(APP)

status:
	fly status --app $(APP)

secrets:
	fly secrets list --app $(APP)
