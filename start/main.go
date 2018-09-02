package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/guregu/dynamo"
)

type input struct {
	TargetChannelID string `json:"target_channel_id"`
}

type Setting struct {
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
}

var settingsTable = os.Getenv("SETTINGS_TABLE")
var standupsTable = os.Getenv("STANDUPS_TABLE")

func getSetting(db *dynamo.DB, targetChannelID string) (*Setting, error) {
	table := db.Table(settingsTable)

	var s Setting
	if err := table.Get("target_channel_id", targetChannelID).One(&s); err != nil {
		return nil, err
	}

	return &s, nil
}

func putStandup(db *dynamo.DB, userID string, questions []string) error {
	table := db.Table(standupsTable)

	s := standup{
		UserID:             userID,
		Date:               time.Now().Format("2006-01-02"),
		Questions:          questions,
		Answers:            []string{},
		SentQuestionsCount: 0,
	}
	if err := table.Put(s).Run(); err != nil {
		return err
	}

	return nil
}

// Handler is our lambda handler invoked by the `lambda.Start` function call
func Handler(ctx context.Context, e events.CloudWatchEvent) (Setting, error) {
	var input input

	if err := json.Unmarshal(e.Detail, &input); err != nil {
		return Setting{}, err
	}

	if input.TargetChannelID == "" {
		log.Println("There is no target_channel_id")
		return Setting{}, nil
	}

	db := dynamo.New(session.New())

	s, err := getSetting(db, input.TargetChannelID)
	if err != nil {
		return Setting{}, err
	}

	for _, userID := range s.UserIDs {
		if err := putStandup(db, userID, s.Questions); err != nil {
			return Setting{}, err
		}
	}

	return *s, nil
}

func main() {
	lambda.Start(Handler)
}
