UNAME = ${shell uname}

.PHONY: build
build:
	env GOOS=linux go build -ldflags="-s -w" -o bin/webhook        cmd/webhook/main.go
	env GOOS=linux go build -ldflags="-s -w" -o bin/start          cmd/start/main.go
	env GOOS=linux go build -ldflags="-s -w" -o bin/send_questions cmd/send_questions/main.go
	env GOOS=linux go build -ldflags="-s -w" -o bin/slash          cmd/slash/main.go
	env GOOS=linux go build -ldflags="-s -w" -o bin/interactive    cmd/interactive/main.go

.PHONY: test
test:
	go test ./...

.PHONY: watch
watch:
	realize start

.PHONY: clean
clean:
	rm -rf ./bin
	rm -rf ./.serverless

.PHONY: deploy
deploy: clean build
	npm install
	npm run deploy

.PHONY: deploy-prod
deploy-prod: clean build
	npm install
	npm run deploy -- -s prod

.PHONY: start-api
start-api: clean build
	npm install
	npm run sam-export --skip-pull-image
	unzip -u -d .serverless .serverless/daily-standup-bot.zip

	if [ $(UNAME) = Linux ]; then\
		sed -i 's/Dynamodb/DynamoDB/' template.yaml;\
		sed -i 's/daily-standup-bot.zip//' template.yaml;\
	elif [ $(UNAME) = Darwin ]; then\
		sed -i '' 's/Dynamodb/DynamoDB/' template.yaml;\
		sed -i '' 's/daily-standup-bot.zip//' template.yaml;\
	fi

	docker pull lambci/lambda:go1.x
	sam local start-api --skip-pull-image
