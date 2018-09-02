package main

import (
	"context"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/guregu/dynamo"
	"github.com/tsub/daily-standup-bot/lib/setting"
	"github.com/tsub/daily-standup-bot/lib/standup"
)

type Response struct {
	Finished bool            `json:"finished"`
	Setting  setting.Setting `json:"setting"`
}

// Handler is our lambda handler invoked by the `lambda.Start` function call
func Handler(ctx context.Context, s setting.Setting) (Response, error) {
	db := dynamo.New(session.New())

	finishedCount := 0
	for _, userID := range s.UserIDs {
		su, err := standup.Get(db, userID)
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
