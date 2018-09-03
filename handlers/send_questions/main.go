package main

import (
	"context"
	"log"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/lestrrat-go/slack/objects"
	"github.com/tsub/slack"
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
		questions := record.Change.NewImage["questions"].List()
		answers := record.Change.NewImage["answers"].List()
		userID := record.Change.Keys["user_id"].String()

		if len(questions)-len(answers) > 0 {
			q := questions[len(answers)].String()

			resp, err := botcl.Chat().PostMessage(userID).AsUser(true).Text(q).Do(ctx)
			if err != nil {
				return err
			}

			log.Println(resp)
		}

		if len(answers) == len(questions) {
			profile, err := cl.UsersProfile().Get().User(userID).Do(ctx)
			if err != nil {
				return err
			}

			var fields objects.AttachmentFieldList
			for i := range questions {
				fields.Append(&objects.AttachmentField{
					Title: questions[i].String(),
					Value: answers[i].String(),
					Short: false,
				})
			}

			attachment := &objects.Attachment{
				AuthorName: profile.RealName,
				AuthorIcon: profile.Image32,
				Fields:     fields,
			}

			targetChannelID := record.Change.NewImage["target_channel_id"].String()
			resp, err := botcl.Chat().PostMessage(targetChannelID).AsUser(true).Attachment(attachment).Do(ctx)
			if err != nil {
				return err
			}

			log.Println(resp)
		}
	}

	return nil
}

func main() {
	lambda.Start(Handler)
}
