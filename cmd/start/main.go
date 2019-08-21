package main

import (
	"context"
	"log"
	"os"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/guregu/dynamo"
	"github.com/nlopes/slack"
	"github.com/tsub/serverless-daily-standup-bot/internal/setting"
	"github.com/tsub/serverless-daily-standup-bot/internal/standup"
)

type input struct {
	TargetChannelID string `json:"target_channel_id"`
}

var slackToken = os.Getenv("SLACK_TOKEN")

// Handler is our lambda handler invoked by the `lambda.Start` function call
func Handler(ctx context.Context, input input) error {
	if input.TargetChannelID == "" {
		log.Println("There is no target_channel_id")
		return nil
	}

	db := dynamo.New(session.New())

	s, err := setting.Get(db, input.TargetChannelID)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cl := slack.New(slackToken)

	var initialRequireUserIDs []string
	for _, userID := range s.UserIDs {
		resp, err := cl.GetUserInfoContext(ctx, userID)
		if err != nil {
			return err
		}

		_, err = standup.Get(db, resp.TZ, userID, false)
		if err != nil {
			// To skip "dynamo: no item found" error
			initialRequireUserIDs = append(initialRequireUserIDs, userID)
		}
	}

	if len(initialRequireUserIDs) == 0 {
		log.Println("Skip since it has already been executed today.")
		return nil
	}

	for _, userID := range initialRequireUserIDs {
		resp, err := cl.GetUserInfoContext(ctx, userID)
		if err != nil {
			return err
		}

		questions := make([]standup.Question, len(s.Questions))
		for i, text := range s.Questions {
			questions[i] = standup.Question{Text: text}
		}

		if err := standup.Initial(db, resp.TZ, userID, questions, s.TargetChannelID); err != nil {
			return err
		}
	}

	return nil
}

func main() {
	lambda.Start(Handler)
}
