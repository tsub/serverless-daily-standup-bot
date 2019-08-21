package standup

import (
	"fmt"
	"testing"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/request"
	"github.com/aws/aws-sdk-go/service/dynamodb"
	"github.com/aws/aws-sdk-go/service/dynamodb/dynamodbiface"
	"github.com/guregu/dynamo"
)

type mockedDynamo struct {
	dynamodbiface.DynamoDBAPI
	Resp *Standup
}

func (m *mockedDynamo) PutItemWithContext(context aws.Context, input *dynamodb.PutItemInput, options ...request.Option) (*dynamodb.PutItemOutput, error) {
	for _, responseAnswer := range m.Resp.Answers {
		for _, inputAnswer := range input.Item["answers"].SS {
			if *inputAnswer != responseAnswer.Text {
				return nil,
					fmt.Errorf("Mismatch answers, input: %q, response: %q",
						*inputAnswer,
						responseAnswer)
			}
		}
	}

	return &dynamodb.PutItemOutput{}, nil
}

func TestAppendAnswerSuccess(t *testing.T) {
	want := &Standup{
		UserID: "user",
		Answers: []Answer{
			Answer{Text: "answer1"},
			Answer{Text: "answer2"},
		},
	}

	standup := &Standup{
		UserID: "user",
		Answers: []Answer{
			Answer{Text: "answer1"},
		},
	}

	mockedClient := &mockedDynamo{Resp: want}
	db := dynamo.NewFromIface(mockedClient)

	err := standup.AppendAnswer(db, Answer{Text: "answer2"})
	if err != nil {
		t.Fatalf("%q", err)
	}
}

func TestCancelSuccess(t *testing.T) {
	want := &Standup{
		UserID: "user",
		Answers: []Answer{
			Answer{Text: "none"},
			Answer{Text: "none"},
		},
	}

	standup := &Standup{
		UserID: "user",
		Answers: []Answer{
			Answer{Text: "answer1"},
		},
	}

	mockedClient := &mockedDynamo{Resp: want}
	db := dynamo.NewFromIface(mockedClient)

	err := standup.Cancel(db)
	if err != nil {
		t.Fatalf("%q", err)
	}
}

func TestGetSuccess(t *testing.T)     {}
func TestInitialSuccess(t *testing.T) {}
