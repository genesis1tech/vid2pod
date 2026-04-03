#!/bin/bash
# Set S3 lifecycle rule on vid2pod-podcasts bucket
# Deletes all objects after 14 days as a safety net
# (App-level cleanup deletes 7 days after first download)

S3_ENDPOINT="${S3_ENDPOINT:-http://localhost:9000}"
S3_BUCKET="${S3_PODCAST_BUCKET:-vid2pod-podcasts}"

AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY:-minioadmin}" \
AWS_SECRET_ACCESS_KEY="${S3_SECRET_KEY:-minioadmin}" \
aws --endpoint-url "$S3_ENDPOINT" s3api put-bucket-lifecycle-configuration \
  --bucket "$S3_BUCKET" \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "expire-podcast-audio-14d",
        "Status": "Enabled",
        "Filter": {
          "Prefix": "processed/"
        },
        "Expiration": {
          "Days": 14
        }
      }
    ]
  }'

echo "Lifecycle rule set: objects in $S3_BUCKET/processed/ expire after 14 days"
