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

type setting struct {
	TargetChannelID string   `dynamo:"target_channel_id"`
	Questions       []string `dynamo:"questions,set"`
	UserIDs         []string `dynamo:"user_ids,set"`
}

type standup struct {
	UserID    string   `dynamo:"user_id"`
	Date      string   `dynamo:"date"`
	Questions []string `dynamo:"questions,set"`
	Answers   []string `dynamo:"answers,set"`
}

var settingsTable = os.Getenv("SETTINGS_TABLE")
var standupsTable = os.Getenv("STANDUPS_TABLE")

func getSetting(db *dynamo.DB, targetChannelID string) (*setting, error) {
	table := db.Table(settingsTable)

	var s setting
	if err := table.Get("target_channel_id", targetChannelID).One(&s); err != nil {
		return nil, err
	}

	return &s, nil
}

func putStandup(db *dynamo.DB, userID string, questions []string) error {
	table := db.Table(standupsTable)

	s := standup{
		UserID:    userID,
		Date:      time.Now().Format("2006-01-02"),
		Questions: questions,
		Answers:   []string{},
	}
	if err := table.Put(s).Run(); err != nil {
		return err
	}

	return nil
}

// Handler is our lambda handler invoked by the `lambda.Start` function call
func Handler(ctx context.Context, e events.CloudWatchEvent) error {
	var input input

	if err := json.Unmarshal(e.Detail, &input); err != nil {
		return err
	}

	if input.TargetChannelID == "" {
		log.Println("There is no target_channel_id")
		return nil
	}

	db := dynamo.New(session.New())

	setting, err := getSetting(db, input.TargetChannelID)
	if err != nil {
		return err
	}

	for _, userID := range setting.UserIDs {
		if err := putStandup(db, userID, setting.Questions); err != nil {
			return err
		}
	}

	return nil
}

func main() {
	lambda.Start(Handler)
}
