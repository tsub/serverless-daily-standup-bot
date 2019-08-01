package main

import (
	"context"
	"encoding/json"
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
	"github.com/tsub/serverless-daily-standup-bot/internal/util"
)

// Response is of type APIGatewayProxyResponse since we're leveraging the
// AWS Lambda Proxy Request functionality (default behavior)
//
// https://serverless.com/framework/docs/providers/aws/events/apigateway/#lambda-proxy-integration
type Response events.APIGatewayProxyResponse

type Input struct {
	TargetChannelID string `json:"target_channel_id"`
}

var botSlackToken = os.Getenv("SLACK_BOT_TOKEN")
var startFunctionArn = os.Getenv("START_FUNCTION_ARN")
var resourcePrefix = os.Getenv("RESOURCE_PREFIX")

func initialSettings(payload slack.DialogCallback) (Response, error) {
	sess := session.New()
	db := dynamo.New(sess)
	cwe := cloudwatchevents.New(sess)

	targetChannelID := payload.Submission["target_channel_id"]
	questions := util.Map(strings.Split(payload.Submission["questions"], "\n"), strings.TrimSpace)
	userIDs := util.Map(strings.Split(payload.Submission["user_ids"], "\n"), strings.TrimSpace)
	scheduleExpression := strings.TrimSpace(payload.Submission["schedule_expression"])
	teamID := payload.Team.ID
	replyChannelID := payload.Channel.ID

	err := setting.Initial(db, targetChannelID, questions, userIDs)
	if err != nil {
		return Response{StatusCode: 500}, err
	}

	ruleName := fmt.Sprintf("%s-%s-%s", resourcePrefix, teamID, targetChannelID)

	putRuleInput := &cloudwatchevents.PutRuleInput{
		Name:               aws.String(ruleName),
		ScheduleExpression: aws.String(scheduleExpression),
	}
	_, err = cwe.PutRule(putRuleInput)
	if err != nil {
		return Response{StatusCode: 500}, err
	}

	input, err := json.Marshal(Input{TargetChannelID: targetChannelID})
	if err != nil {
		return Response{StatusCode: 500}, err
	}

	putTargetsInput := &cloudwatchevents.PutTargetsInput{
		Rule: aws.String(ruleName),
		Targets: []*cloudwatchevents.Target{
			&cloudwatchevents.Target{
				Id:    aws.String("1"),
				Arn:   aws.String(startFunctionArn),
				Input: aws.String(string(input[:])),
			},
		},
	}
	_, err = cwe.PutTargets(putTargetsInput)
	if err != nil {
		return Response{StatusCode: 500}, err
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cl := slack.New(botSlackToken)

	params := slack.NewPostMessageParameters()
	_, _, err = cl.PostMessageContext(
		ctx,
		replyChannelID,
		slack.MsgOptionText("Setting finished", false),
		slack.MsgOptionPostMessageParameters(params),
	)
	if err != nil {
		return Response{StatusCode: 500}, err
	}

	return Response{StatusCode: 200}, nil
}

func handlePayload(payload slack.DialogCallback) (resp Response, err error) {
	// for debug
	log.Printf("payload: %v", payload)

	switch payload.CallbackID {
	case "setting":
		resp, err = initialSettings(payload)
		if err != nil {
			return resp, err
		}
	default:
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

	var payload slack.DialogCallback
	err = json.Unmarshal([]byte(query.Get("payload")), &payload)

	return handlePayload(payload)
}

func main() {
	lambda.Start(Handler)
}
