package main

import (
	"context"
	"log"
	"net/url"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/nlopes/slack"
)

// Response is of type APIGatewayProxyResponse since we're leveraging the
// AWS Lambda Proxy Request functionality (default behavior)
//
// https://serverless.com/framework/docs/providers/aws/events/apigateway/#lambda-proxy-integration
type Response events.APIGatewayProxyResponse

var botSlackToken = os.Getenv("SLACK_BOT_TOKEN")

func startSetting(query url.Values) (Response, error) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cl := slack.New(botSlackToken)

	dialog := slack.Dialog{
		CallbackId:     "setting",
		Title:          "Setting",
		NotifyOnCancel: true,
		Elements: []slack.DialogElement{
			slack.DialogTextElement{
				Type:  "textarea",
				Label: "Members",
				Name:  "user_ids",
				Placeholder: `
W012A3CDE
W034B4FGH`,
				Hint: "Please type user ID (not username)",
			},
			slack.DialogTextElement{
				Type:  "textarea",
				Label: "Questions",
				Name:  "questions",
				Placeholder: `
What did you do yesterday?
What will you do today?
Anything blocking your progress?`,
				Hint: "Please write multiple questions in multiple lines",
			},
			slack.DialogSelectElement{
				Type:        "select",
				Label:       "Target channel",
				Name:        "target_channel_id",
				DataSource:  "channels",
				Value:       query.Get("channel_id"),
				Placeholder: "Choose a channel",
			},
			slack.DialogTextElement{
				Type:        "text",
				Label:       "Execution schedule",
				Name:        "schedule_expression",
				Placeholder: "cron(0 1 ? * MON-FRI *)",
				Hint:        "https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html",
			},
		},
	}
	triggerID := query.Get("trigger_id")

	err := cl.OpenDialogContext(ctx, triggerID, dialog)
	if err != nil {
		return Response{StatusCode: 500}, err
	}

	return Response{StatusCode: 200}, nil
}

func handleQuery(query url.Values) (resp Response, err error) {
	// for debug
	log.Printf("query: %v", query)

	switch query.Get("text") {
	case "setting":
		resp, err = startSetting(query)
		if err != nil {
			return resp, err
		}
	default:
		// TODO: Show help
		resp = Response{StatusCode: 200}
	}

	return resp, nil
}

// Handler is our lambda handler invoked by the `lambda.Start` function call
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (Response, error) {
	query, err := url.ParseQuery(request.Body)
	if err != nil {
		return Response{StatusCode: 400}, nil
	}

	return handleQuery(query)
}

func main() {
	lambda.Start(Handler)
}
