UNAME = ${shell uname}

build:
	env GOOS=linux go build -ldflags="-s -w" -o bin/webhook handlers/webhook/main.go
	env GOOS=linux go build -ldflags="-s -w" -o bin/start handlers/start/main.go
	env GOOS=linux go build -ldflags="-s -w" -o bin/send_questions handlers/send_questions/main.go

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
