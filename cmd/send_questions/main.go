package main

import (
	"context"
	"log"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/guregu/dynamo"
	"github.com/nlopes/slack"
	"github.com/tsub/serverless-daily-standup-bot/internal/standup"
)

var slackToken = os.Getenv("SLACK_TOKEN")
var botSlackToken = os.Getenv("SLACK_BOT_TOKEN")

// Handler is our lambda handler invoked by the `lambda.Start` function call
func Handler(ctx context.Context, e events.DynamoDBEvent) error {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	botcl := slack.New(botSlackToken)
	cl := slack.New(slackToken)

	for _, record := range e.Records {
		if record.Change.NewImage == nil {
			// Skip if item deleted
			continue
		}

		questions := record.Change.NewImage["questions"].List()
		answers := record.Change.NewImage["answers"].List()
		userID := record.Change.Keys["user_id"].String()

		if len(questions)-len(answers) > 0 {
			// Send a next question if haven't answered all questions yet
			q := questions[len(answers)].String()

			params := slack.NewPostMessageParameters()
			resp, _, err := botcl.PostMessageContext(
				ctx,
				userID,
				slack.MsgOptionText(q, false),
				slack.MsgOptionAsUser(true),
				slack.MsgOptionPostMessageParameters(params),
			)
			if err != nil {
				return err
			}

			log.Printf("postMessageResp: %s", resp)

			continue
		}

		if len(answers) != len(questions) {
			// Skip if unintended state
			log.Printf("unintended state in user: %s", userID)
			continue
		}

		// Send message summary if finished
		log.Printf("finished user: %s", userID)

		profile, err := cl.GetUserProfileContext(ctx, userID, false)
		if err != nil {
			return err
		}

		var fields []slack.AttachmentField
		for i := range questions {
			if answers[i].Map()["text"].String() == "none" {
				continue
			}

			fields = append(fields, (slack.AttachmentField{
				Title: questions[i].String(),
				Value: answers[i].Map()["text"].String(),
				Short: false,
			}))
		}

		if len(fields) == 0 {
			continue
		}

		attachment := slack.Attachment{
			AuthorName: profile.RealName,
			AuthorIcon: profile.Image32,
			Fields:     fields,
		}

		targetChannelID := record.Change.NewImage["target_channel_id"].String()

		db := dynamo.New(session.New())

		userInfoResp, err := cl.GetUserInfoContext(ctx, userID)
		if err != nil {
			return err
		}

		s, err := standup.Get(db, userInfoResp.TZ, userID, true)
		if err != nil {
			return err
		}

		if s.FinishedAt == "" {
			_, postMessageTimestamp, err := botcl.PostMessageContext(
				ctx,
				targetChannelID,
				slack.MsgOptionAttachments(attachment),
				slack.MsgOptionAsUser(true),
			)
			if err != nil {
				return err
			}

			if err = s.Finish(db, postMessageTimestamp); err != nil {
				return err
			}
		} else {
			_, _, _, err := botcl.UpdateMessageContext(
				ctx,
				targetChannelID,
				s.FinishedAt,
				slack.MsgOptionAttachments(attachment),
				slack.MsgOptionAsUser(true),
			)
			if err != nil {
				return err
			}
		}
	}

	return nil
}

func main() {
	lambda.Start(Handler)
}
