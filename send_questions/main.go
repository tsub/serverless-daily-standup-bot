package main

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/guregu/dynamo"
	"github.com/lestrrat-go/slack"
)

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

var standupsTable = os.Getenv("STANDUPS_TABLE")
var slackToken = os.Getenv("SLACK_TOKEN")

func getStandup(db *dynamo.DB, userID string) (*standup, error) {
	table := db.Table(standupsTable)
	today := time.Now().Format("2006-01-02")

	var s standup
	if err := table.Get("user_id", userID).Range("date", dynamo.Equal, today).One(&s); err != nil {
		return nil, err
	}

	return &s, nil
}

func (s *standup) incrementSentQuestionsCount(db *dynamo.DB) error {
	table := db.Table(standupsTable)

	s.SentQuestionsCount++
	if err := table.Put(s).Run(); err != nil {
		return err
	}

	return nil
}

// Handler is our lambda handler invoked by the `lambda.Start` function call
func Handler(ctx context.Context, s Setting) (Setting, error) {
	db := dynamo.New(session.New())

	for _, userID := range s.UserIDs {
		su, err := getStandup(db, userID)
		if err != nil {
			return Setting{}, err
		}

		if su.SentQuestionsCount == len(su.Answers) && len(su.Answers) != len(su.Questions) {
			q := su.Questions[su.SentQuestionsCount]

			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()

			cl := slack.New(slackToken)

			resp, err := cl.Chat().PostMessage(userID).AsUser(true).Text(q).Do(ctx)
			if err != nil {
				return Setting{}, err
			}

			log.Println(resp)

			su.incrementSentQuestionsCount(db)
		}
	}

	return s, nil
}

func main() {
	lambda.Start(Handler)
}
