package setting

import (
	"fmt"
	"reflect"
	"testing"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/request"
	"github.com/aws/aws-sdk-go/service/dynamodb"
	"github.com/aws/aws-sdk-go/service/dynamodb/dynamodbiface"
	"github.com/guregu/dynamo"
)

type mockedDynamo struct {
	dynamodbiface.DynamoDBAPI
	Resp *Setting
}

func (m *mockedDynamo) GetItemWithContext(context aws.Context, input *dynamodb.GetItemInput, options ...request.Option) (*dynamodb.GetItemOutput, error) {
	item := map[string]*dynamodb.AttributeValue{
		"target_channel_id": &dynamodb.AttributeValue{S: &m.Resp.TargetChannelID},
		"questions":         &dynamodb.AttributeValue{SS: []*string{&m.Resp.Questions[0]}},
		"user_ids":          &dynamodb.AttributeValue{SS: []*string{&m.Resp.UserIDs[0]}},
	}

	return &dynamodb.GetItemOutput{
		Item: item,
	}, nil
}

func (m *mockedDynamo) PutItemWithContext(context aws.Context, input *dynamodb.PutItemInput, options ...request.Option) (*dynamodb.PutItemOutput, error) {
	if *input.Item["target_channel_id"].S != m.Resp.TargetChannelID {
		return nil,
			fmt.Errorf("Mismatch target_channel_id, input: %q, response: %q",
				*input.Item["target_channel_id"].S,
				m.Resp.TargetChannelID)
	}

	for _, responseQuestion := range m.Resp.Questions {
		for _, inputQuestion := range input.Item["questions"].SS {
			if *inputQuestion != responseQuestion {
				return nil,
					fmt.Errorf("Mismatch questions, input: %q, response: %q",
						*inputQuestion,
						responseQuestion)
			}
		}
	}

	for _, responseUserID := range m.Resp.UserIDs {
		for _, inputUserID := range input.Item["user_ids"].SS {
			if *inputUserID != responseUserID {
				return nil,
					fmt.Errorf("Mismatch user_ids, input: %q, response: %q",
						*inputUserID,
						responseUserID)
			}
		}
	}

	return &dynamodb.PutItemOutput{}, nil
}

func TestGetSuccess(t *testing.T) {
	want := &Setting{
		TargetChannelID: "channelID",
		Questions:       []string{"q1"},
		UserIDs:         []string{"user1"},
	}

	mockedClient := &mockedDynamo{Resp: want}
	db := dynamo.NewFromIface(mockedClient)

	got, err := Get(db, want.TargetChannelID)
	if err != nil {
		t.Fatalf("%q", err)
	}

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Want %q, got %q", want, got)
	}
}

func TestInitialSuccess(t *testing.T) {
	want := &Setting{
		TargetChannelID: "channelID",
		Questions:       []string{"q1"},
		UserIDs:         []string{"user1"},
	}

	mockedClient := &mockedDynamo{Resp: want}
	db := dynamo.NewFromIface(mockedClient)

	err := Initial(db, want.TargetChannelID, want.Questions, want.UserIDs)
	if err != nil {
		t.Fatalf("%q", err)
	}
}
