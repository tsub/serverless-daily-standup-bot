package main

import (
	"context"
	"log"
	"os"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/guregu/dynamo"
	"github.com/lestrrat-go/slack/objects"
	"github.com/tsub/daily-standup-bot/lib/setting"
	"github.com/tsub/daily-standup-bot/lib/standup"
	"github.com/tsub/slack"
)

var slackToken = os.Getenv("SLACK_TOKEN")
var botSlackToken = os.Getenv("SLACK_BOT_TOKEN")

// Handler is our lambda handler invoked by the `lambda.Start` function call
func Handler(ctx context.Context, s setting.Setting) (setting.Setting, error) {
	db := dynamo.New(session.New())

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	botcl := slack.New(botSlackToken)
	cl := slack.New(slackToken)

	for _, userID := range s.UserIDs {
		su, err := standup.Get(db, userID)
		if err != nil {
			return setting.Setting{}, err
		}

		if su.SentQuestionsCount == len(su.Answers) && len(su.Answers) != len(su.Questions) {
			q := su.Questions[su.SentQuestionsCount]

			resp, err := botcl.Chat().PostMessage(userID).AsUser(true).Text(q).Do(ctx)
			if err != nil {
				return setting.Setting{}, err
			}

			log.Println(resp)

			su.IncrementSentQuestionsCount(db)
		}

		if len(su.Answers) == len(su.Questions) && !su.Finished {
			profile, err := cl.UsersProfile().Get().User(su.UserID).Do(ctx)
			if err != nil {
				return setting.Setting{}, err
			}

			var fields objects.AttachmentFieldList
			for i := range su.Questions {
				fields.Append(&objects.AttachmentField{
					Title: su.Questions[i],
					Value: su.Answers[i],
					Short: false,
				})
			}

			attachment := &objects.Attachment{
				AuthorName: profile.RealName,
				AuthorIcon: profile.Image32,
				Fields:     fields,
			}

			resp, err := botcl.Chat().PostMessage(s.TargetChannelID).AsUser(true).Attachment(attachment).Do(ctx)
			if err != nil {
				return setting.Setting{}, err
			}

			log.Println(resp)

			su.Finish(db)
		}
	}

	return s, nil
}

func main() {
	lambda.Start(Handler)
}
