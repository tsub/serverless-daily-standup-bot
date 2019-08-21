package main

import (
	"context"
	"encoding/json"
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
	jsonEvent, err := json.Marshal(e)
	if err != nil {
		return err
	}
	log.Printf("event: %s", jsonEvent)

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

		if len(questions)-len(answers) > 0 {
			// Send a next question if haven't answered all questions yet
			nextQuestionIndex := len(answers)

			if _, ok := questions[nextQuestionIndex].Map()["posted_at"]; ok {
				// Skip if already send a next question
				continue
			}

			question := standup.Question{
				Text: questions[nextQuestionIndex].Map()["text"].String(),
			}

			_, postMessageTimestamp, err := botcl.PostMessageContext(
				ctx,
				userID,
				slack.MsgOptionText(question.Text, false),
				slack.MsgOptionAsUser(true),
			)
			if err != nil {
				return err
			}

			if err = s.SentQuestion(db, nextQuestionIndex, postMessageTimestamp); err != nil {
				return err
			}

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
				Title: questions[i].Map()["text"].String(),
				Value: answers[i].Map()["text"].String(),
				Short: false,
			}))
		}

		if len(fields) == 0 {
			// Skip if unintended state
			log.Printf("unintended state in user: %s", userID)
			continue
		}

		attachment := slack.Attachment{
			AuthorName: profile.RealName,
			AuthorIcon: profile.Image32,
			Fields:     fields,
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
