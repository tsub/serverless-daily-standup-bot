build:
	env GOOS=linux go build -ldflags="-s -w" -o bin/hello hello/main.go
	env GOOS=linux go build -ldflags="-s -w" -o bin/world world/main.go
	env GOOS=linux go build -ldflags="-s -w" -o bin/webhook webhook/main.go
	env GOOS=linux go build -ldflags="-s -w" -o bin/start start/main.go
	env GOOS=linux go build -ldflags="-s -w" -o bin/send_questions send_questions/main.go
	env GOOS=linux go build -ldflags="-s -w" -o bin/is_all_user_finished is_all_user_finished/main.go

.PHONY: clean
clean:
	rm -rf ./bin

.PHONY: deploy
deploy: clean build
	npm install
	npm run deploy
