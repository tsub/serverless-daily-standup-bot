package main

import (
	"context"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/guregu/dynamo"
)

type Response struct {
	Finished bool    `json:"finished"`
	Setting  setting `json:"setting"`
}

type setting struct {
	TargetChannelID string   `dynamo:"target_channel_id"`
	Questions       []string `dynamo:"questions,set"`
	UserIDs         []string `dynamo:"user_ids,set"`
}
type standup struct {
	UserID             string   `dynamo:"user_id"`
	Date               string   `dynamo:"date"`
	Questions          []string `dynamo:"questions,set"`
	Answers            []string `dynamo:"answers,set"`
	SentQuestionsCount int      `dynamo:"sent_questions_count"`
	Finished           bool     `dynamo:"finished"`
}

var standupsTable = os.Getenv("STANDUPS_TABLE")

func getStandup(db *dynamo.DB, userID string) (*standup, error) {
	table := db.Table(standupsTable)
	today := time.Now().Format("2006-01-02")

	var s standup
	if err := table.Get("user_id", userID).Range("date", dynamo.Equal, today).One(&s); err != nil {
		return nil, err
	}

	return &s, nil
}

// Handler is our lambda handler invoked by the `lambda.Start` function call
func Handler(ctx context.Context, s setting) (Response, error) {
	db := dynamo.New(session.New())

	finishedCount := 0
	for _, userID := range s.UserIDs {
		su, err := getStandup(db, userID)
		if err != nil {
			return Response{}, err
		}

		if su.Finished {
			finishedCount++
		}
	}

	if finishedCount == len(s.UserIDs) {
		return Response{Finished: true}, nil
	}

	return Response{Finished: false, Setting: s}, nil
}

func main() {
	lambda.Start(Handler)
}
