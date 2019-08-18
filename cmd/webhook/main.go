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
	"github.com/tsub/serverless-daily-standup-bot/internal/standup"
	"github.com/tsub/slack"
)

// Response is of type APIGatewayProxyResponse since we're leveraging the
// AWS Lambda Proxy Request functionality (default behavior)
//
// https://serverless.com/framework/docs/providers/aws/events/apigateway/#lambda-proxy-integration
type Response events.APIGatewayProxyResponse

type envelope struct {
	APIAppID    string   `json:"api_app_id"`
	AuthedUsers []string `json:"authed_users"`
	Challenge   string   `json:"challenge"`
	Event       event    `json:"event"`
	EventID     string   `json:"event_id"`
	EventTime   int      `json:"event_time"`
	TeamID      string   `json:"team_id"`
	Token       string   `json:"token"`
	Type        string   `json:"type"`
}

type event struct {
	Channel         string  `json:"channel"`
	ChannelType     string  `json:"channel_type"`
	ClientMessageID string  `json:"client_msg_id"`
	EventTimestamp  string  `json:"event_ts"`
	Hidden          bool    `json:"hidden"`
	Message         message `json:"message"`
	PreviousMessage message `json:"previous_message"`
	Subtype         string  `json:"subtype"`
	Text            string  `json:"text"`
	Timestamp       string  `json:"ts"`
	Type            string  `json:"type"`
	User            string  `json:"user"`
}

type message struct {
	ClientMessageID string `json:"client_msg_id"`
	Edited          edited `json:"edited"`
	SourceTeam      string `json:"source_team"`
	Team            string `json:"team"`
	Text            string `json:"text"`
	Timestamp       string `json:"ts"`
	Type            string `json:"type"`
	User            string `json:"user"`
	UserTeam        string `json:"user_team"`
}

type edited struct {
	Timestamp string `json:"ts"`
	User      string `json:"user"`
}

var slackToken = os.Getenv("SLACK_TOKEN")
var botSlackToken = os.Getenv("SLACK_BOT_TOKEN")

// Handler is our lambda handler invoked by the `lambda.Start` function call
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (Response, error) {
	var envelope envelope

	log.Printf("raw request body: %s", request.Body)

	if err := json.Unmarshal([]byte(request.Body), &envelope); err != nil {
		return Response{StatusCode: 400}, err
	}

	jsonEnvelope, err := json.Marshal(envelope)
	if err != nil {
		return Response{StatusCode: 500}, err
	}
	log.Printf("envelope: %s", jsonEnvelope)

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
		if envelope.Event.Type != "message" {
			return Response{StatusCode: 200}, nil
		}

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		botcl := slack.New(botSlackToken)

		authTestResp, err := botcl.Auth().Test().Do(ctx)
		if err != nil {
			return Response{StatusCode: 500}, err
		}

		var user string
		var answer standup.Answer

		switch envelope.Event.Subtype {
		case "message_changed":
			user = envelope.Event.Message.User
			answer = standup.Answer{
				Text:     envelope.Event.Message.Text,
				PostedAt: envelope.Event.Message.Timestamp,
			}
		case "": // new message
			user = envelope.Event.User
			answer = standup.Answer{
				Text:     envelope.Event.Text,
				PostedAt: envelope.Event.Timestamp,
			}
		default:
			// unsupported subtype
			// see https://api.slack.com/events/message#message_subtypes
			log.Printf("unsupported subtype: %s", envelope.Event.Subtype)
			return Response{StatusCode: 200}, nil
		}

		// Skip self event
		if user == authTestResp.UserID {
			return Response{StatusCode: 200}, nil
		}

		cl := slack.New(slackToken)

		usersInfoResp, err := cl.Users().Info(user).Do(ctx)
		if err != nil {
			return Response{StatusCode: 500}, err
		}

		db := dynamo.New(session.New())

		s, err := standup.Get(db, usersInfoResp.TZ, user, true)
		if err != nil {
			return Response{StatusCode: 404}, err
		}

		if envelope.Event.Subtype != "message_changed" && len(s.Answers) >= len(s.Questions) {
			return Response{StatusCode: 200}, nil
		}

		if envelope.Event.Subtype != "message_changed" && answer.Text == "cancel" {
			if err := s.Cancel(db); err != nil {
				return Response{StatusCode: 400}, err
			}

			postMessageResp, err := botcl.Chat().PostMessage(user).Text("Stand-up canceled.").AsUser(true).Do(ctx)
			if err != nil {
				return Response{StatusCode: 500}, err
			}

			log.Println(postMessageResp)

			return Response{StatusCode: 200}, nil
		}

		if envelope.Event.Subtype == "message_changed" {
			if err := s.UpdateAnswer(db, answer); err != nil {
				return Response{StatusCode: 400}, err
			}
		} else {
			if err := s.AppendAnswer(db, answer); err != nil {
				return Response{StatusCode: 400}, err
			}
		}

		return Response{StatusCode: 200}, nil
	default:
		return Response{StatusCode: 200}, nil
	}
}

func main() {
	lambda.Start(Handler)
}
