package main

import (
	"context"
	"log"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/guregu/dynamo"
	"github.com/tsub/daily-standup-bot/lib/setting"
	"github.com/tsub/daily-standup-bot/lib/standup"
)

type input struct {
	TargetChannelID string `json:"target_channel_id"`
}

// Handler is our lambda handler invoked by the `lambda.Start` function call
func Handler(ctx context.Context, input input) (setting.Setting, error) {
	if input.TargetChannelID == "" {
		log.Println("There is no target_channel_id")
		return setting.Setting{}, nil
	}

	db := dynamo.New(session.New())

	s, err := setting.Get(db, input.TargetChannelID)
	if err != nil {
		return setting.Setting{}, err
	}

	log.Println(s.Questions)

	for _, userID := range s.UserIDs {
		if err := standup.Initial(db, userID, s.Questions); err != nil {
			return setting.Setting{}, err
		}
	}

	return *s, nil
}

func main() {
	lambda.Start(Handler)
}
