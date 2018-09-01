package main

import (
	"context"
	"encoding/json"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
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

// Handler is our lambda handler invoked by the `lambda.Start` function call
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (resp Response, err error) {
	var envelope envelope

	if err := json.Unmarshal([]byte(request.Body), &envelope); err != nil {
		return Response{StatusCode: 400}, err
	}

	switch envelope.Type {
	case "url_verification":
		resp = Response{
			StatusCode:      200,
			IsBase64Encoded: false,
			Body:            envelope.Challenge,
			Headers: map[string]string{
				"Content-Type": "text/plain",
			},
		}
	case "event_callback":
		resp = Response{
			StatusCode: 200,
		}
	default:
		resp = Response{
			StatusCode: 200,
		}
	}

	return resp, nil
}

func main() {
	lambda.Start(Handler)
}
