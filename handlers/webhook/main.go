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
	"github.com/tsub/serverless-daily-standup-bot/lib/standup"
	"github.com/tsub/slack"
)

// Response is of type APIGatewayProxyResponse since we're leveraging the
// AWS Lambda Proxy Request functionality (default behavior)
//
// https://serverless.com/framework/docs/providers/aws/events/apigateway/#lambda-proxy-integration
type Response events.APIGatewayProxyResponse

type envelope struct {
	Type        string   `json:"type"`
	APIAppID    string   `json:"api_app_id"`
	Token       string   `json:"token"`
	Challenge   string   `json:"challenge"`
	TeamID      string   `json:"team_id"`
	Event       event    `json:"event"`
	EventID     string   `json:"event_id"`
	EventTime   int      `json:"event_time"`
	AuthedUsers []string `json:"authed_users"`
}

type event struct {
	Type            string `json:"type"`
	User            string `json:"user"`
	Text            string `json:"text"`
	ClientMessageID string `json:"client_msg_id"`
	Timestamp       string `json:"ts"`
	Channel         string `json:"channel"`
	EventTimestamp  string `json:"event_ts"`
	ChannelType     string `json:"channel_type"`
}

var slackToken = os.Getenv("SLACK_TOKEN")
var botSlackToken = os.Getenv("SLACK_BOT_TOKEN")

// Handler is our lambda handler invoked by the `lambda.Start` function call
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (Response, error) {
	var envelope envelope

	if err := json.Unmarshal([]byte(request.Body), &envelope); err != nil {
		return Response{StatusCode: 400}, err
	}

	switch envelope.Type {
	case "url_verification":
		return Response{
			StatusCode:      200,
			IsBase64Encoded: false,
			Body:            envelope.Challenge,
			Headers: map[string]string{
				"Content-Type": "text/plain",
			},
		}, nil
	case "event_callback":
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		botcl := slack.New(botSlackToken)

		authTestResp, err := botcl.Auth().Test().Do(ctx)
		if err != nil {
			return Response{StatusCode: 500}, err
		}

		// Skip self event
		if envelope.Event.User == authTestResp.UserID {
			return Response{StatusCode: 200}, nil
		}

		// for debug
		log.Println(envelope)

		cl := slack.New(slackToken)

		usersInfoResp, err := cl.Users().Info(envelope.Event.User).Do(ctx)
		if err != nil {
			return Response{StatusCode: 500}, err
		}

		db := dynamo.New(session.New())

		s, err := standup.Get(db, usersInfoResp.TZ, envelope.Event.User, true)
		if err != nil {
			return Response{StatusCode: 404}, err
		}

		if len(s.Answers) >= len(s.Questions) {
			return Response{StatusCode: 200}, nil
		}

		if envelope.Event.Text == "cancel" {
			if err := s.Cancel(db); err != nil {
				return Response{StatusCode: 400}, err
			}

			postMessageResp, err := botcl.Chat().PostMessage(envelope.Event.User).Text("Stand-up canceled.").AsUser(true).Do(ctx)
			if err != nil {
				return Response{StatusCode: 500}, err
			}

			log.Println(postMessageResp)

			return Response{StatusCode: 200}, nil
		}

		if err := s.AppendAnswer(db, envelope.Event.Text); err != nil {
			return Response{StatusCode: 400}, err
		}

		return Response{StatusCode: 200}, nil
	default:
		return Response{StatusCode: 200}, nil
	}
}

func main() {
	lambda.Start(Handler)
}
