package main

import (
	"context"
	"log"
	"os"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/guregu/dynamo"
	"github.com/nlopes/slack"
	"github.com/tsub/serverless-daily-standup-bot/lib/setting"
	"github.com/tsub/serverless-daily-standup-bot/lib/standup"
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

	for _, userID := range s.UserIDs {
		resp, err := cl.GetUserInfoContext(ctx, userID)
		if err != nil {
			return err
		}

		_, err = standup.Get(db, resp.TZ, userID, false)
		if err != nil {
			// To skip "dynamo: no item found" error
			continue
		}

		log.Println("Skip since it has already been executed today.")
		return nil
	}

	for _, userID := range s.UserIDs {
		resp, err := cl.GetUserInfoContext(ctx, userID)
		if err != nil {
			return err
		}

		if err := standup.Initial(db, resp.TZ, userID, s.Questions, s.TargetChannelID); err != nil {
			return err
		}
	}

	return nil
}

func main() {
	lambda.Start(Handler)
}
