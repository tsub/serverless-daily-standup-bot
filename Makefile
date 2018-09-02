build:
	env GOOS=linux go build -ldflags="-s -w" -o bin/webhook handlers/webhook/main.go
	env GOOS=linux go build -ldflags="-s -w" -o bin/start handlers/start/main.go
	env GOOS=linux go build -ldflags="-s -w" -o bin/send_questions handlers/send_questions/main.go
	env GOOS=linux go build -ldflags="-s -w" -o bin/is_all_user_finished handlers/is_all_user_finished/main.go

.PHONY: clean
clean:
	rm -rf ./bin

.PHONY: deploy
deploy: clean build
	npm install
	npm run deploy

.PHONY: deploy-prod
deploy-prod: clean build
	npm install
	npm run deploy -- -s prod
