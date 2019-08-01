package main

import (
	"context"
	"fmt"
	"log"
	"net/url"
	"os"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/cloudwatchevents"
	"github.com/guregu/dynamo"
	"github.com/nlopes/slack"
	"github.com/tsub/serverless-daily-standup-bot/internal/setting"
)

// Response is of type APIGatewayProxyResponse since we're leveraging the
// AWS Lambda Proxy Request functionality (default behavior)
//
// https://serverless.com/framework/docs/providers/aws/events/apigateway/#lambda-proxy-integration
type Response events.APIGatewayProxyResponse

var botSlackToken = os.Getenv("SLACK_BOT_TOKEN")
var resourcePrefix = os.Getenv("RESOURCE_PREFIX")

func startSetting(query url.Values) (Response, error) {
	sess := session.New()
	db := dynamo.New(sess)
	cwe := cloudwatchevents.New(sess)

	var userIDs string
	var questions string
	// Don't handle error to skip "dynamo: no item found" error
	s, _ := setting.Get(db, query.Get("channel_id"))
	if s != nil {
		userIDs = strings.Join(s.UserIDs, "\n")
		questions = strings.Join(s.Questions, "\n")
	}

	var scheduleExpression string
	ruleName := fmt.Sprintf("%s-%s-%s", resourcePrefix, query.Get("team_id"), query.Get("channel_id"))
	describeRuleInput := &cloudwatchevents.DescribeRuleInput{
		Name: aws.String(ruleName),
	}
	// Don't handle error to skip if you haven't set rule yet
	resp, _ := cwe.DescribeRule(describeRuleInput)
	if resp.ScheduleExpression != nil {
		scheduleExpression = *resp.ScheduleExpression
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cl := slack.New(botSlackToken)

	dialog := slack.Dialog{
		CallbackID: "setting",
		Title:      "Setting",
		Elements: []slack.DialogElement{
			slack.TextInputElement{
				Value: userIDs,
				Hint:  "Please type user ID (not username)",
				DialogInput: slack.DialogInput{
					Type:  "textarea",
					Label: "Members",
					Name:  "user_ids",
					Placeholder: `
W012A3CDE
W034B4FGH`,
				},
			},
			slack.TextInputElement{
				Value: questions,
				Hint:  "Please write multiple questions in multiple lines",
				DialogInput: slack.DialogInput{
					Type:  "textarea",
					Label: "Questions",
					Name:  "questions",
					Placeholder: `
What did you do yesterday?
What will you do today?
Anything blocking your progress?`,
				}},
			slack.DialogInputSelect{
				Value:      query.Get("channel_id"),
				DataSource: "channels",
				DialogInput: slack.DialogInput{
					Type:        "select",
					Label:       "Target channel",
					Name:        "target_channel_id",
					Placeholder: "Choose a channel",
				},
			},
			slack.TextInputElement{
				Value: scheduleExpression,
				Hint:  "https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html",
				DialogInput: slack.DialogInput{
					Type:        "text",
					Label:       "Execution schedule",
					Name:        "schedule_expression",
					Placeholder: "cron(0 1 ? * MON-FRI *)",
				},
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
