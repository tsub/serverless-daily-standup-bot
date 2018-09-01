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

type slackEvent struct {
	Type      string `json:"type"`
	Token     string `json:"token"`
	Challenge string `json:"challenge"`
}

// Handler is our lambda handler invoked by the `lambda.Start` function call
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (resp Response, err error) {
	var event slackEvent

	if err := json.Unmarshal([]byte(request.Body), &event); err != nil {
		return Response{StatusCode: 400}, err
	}

	switch event.Type {
	case "url_verification":
		resp = Response{
			StatusCode:      200,
			IsBase64Encoded: false,
			Body:            event.Challenge,
			Headers: map[string]string{
				"Content-Type": "text/plain",
			},
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
