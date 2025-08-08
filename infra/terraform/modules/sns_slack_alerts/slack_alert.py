"""
Lambda function to transform SNS alerts to Slack-formatted messages

Transforms CloudWatch alarms from SNS into rich Slack attachments with:
- Color-coded alerts (danger/warning/good)
- Structured fields with 2-column layout for compact info
- Emoji indicators for quick visual status
- Unix timestamp for relative time display

Slack API References:
- Message Attachments: https://api.slack.com/reference/messaging/attachments
- Message Formatting: https://api.slack.com/reference/surfaces/formatting
- CloudWatch Alarm Format: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html

Field Layout:
- short: true  → Two columns side by side (Status | Severity)
- short: false → Full width (Reason spans entire message)

Colors:
- "danger" = Red (ALARM state)
- "good" = Green (OK state)
- "warning" = Yellow (INSUFFICIENT_DATA, etc.)
"""
import json
import urllib3
import os
from datetime import datetime, timezone
from typing import Dict, Any


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Transform CloudWatch alarm from SNS and send to Slack

    Args:
        event: SNS event containing CloudWatch alarm
        context: Lambda context (unused)

    Returns:
        Response dict with status code and message
    """
    webhook_url = os.environ['SLACK_WEBHOOK_URL']
    severity = os.environ.get('ALERT_SEVERITY', 'unknown')

    http = urllib3.PoolManager()

    try:
        # Parse SNS message
        sns_message = json.loads(event['Records'][0]['Sns']['Message'])

        # Extract alarm details
        raw_alarm_name = sns_message.get('AlarmName', 'Unknown Alarm')
        alarm_name = humanize_alarm_name(raw_alarm_name)
        new_state = sns_message.get('NewStateValue', 'UNKNOWN')
        old_state = sns_message.get('OldStateValue', 'UNKNOWN')
        reason = sns_message.get('NewStateReason', 'No reason provided')
        region = sns_message.get('Region', 'unknown')
        timestamp = sns_message.get('StateChangeTime', datetime.now(timezone.utc).isoformat())

        # Create Slack message based on severity and state
        if new_state == 'ALARM':
            if severity == 'critical':
                color = "danger"
                emoji = "🚨"
                title = f"{emoji} CRITICAL ALERT: {alarm_name}"
            elif severity == 'warning':
                color = "warning"
                emoji = "⚠️"
                title = f"{emoji} WARNING: {alarm_name}"
            else:
                color = "#36a64f"
                emoji = "ℹ️"
                title = f"{emoji} INFO: {alarm_name}"
        elif new_state == 'OK':
            color = "good"
            emoji = "✅"
            title = f"{emoji} RESOLVED: {alarm_name}"
        else:
            color = "warning"
            emoji = "❓"
            title = f"{emoji} {new_state}: {alarm_name}"

        # Add @channel mention for critical alerts
        text = ""
        if severity == 'critical' and new_state == 'ALARM':
            text = "<!channel>"

        # Build Slack attachment
        slack_message = {
            "text": text,
            "attachments": [{
                "color": color,
                "title": title,
                "fields": [
                    {
                        "title": "Status",
                        "value": f"{old_state} → {new_state}",
                        "short": True
                    },
                    {
                        "title": "Severity",
                        "value": severity.upper(),
                        "short": True
                    },
                    {
                        "title": "Region",
                        "value": region,
                        "short": True
                    },
                    {
                        "title": "Time",
                        "value": format_timestamp(timestamp),
                        "short": True
                    },
                    {
                        "title": "Reason",
                        "value": reason,
                        "short": False
                    }
                ],
                "ts": int(datetime.now(timezone.utc).timestamp())
            }]
        }

        # Send to Slack
        response = http.request(
            'POST',
            webhook_url,
            body=json.dumps(slack_message),
            headers={'Content-Type': 'application/json'}
        )

        print(f"Sent to Slack: HTTP {response.status}")
        if response.status != 200:
            print(f"Slack response: {response.data.decode()}")

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': f'Alert sent to Slack: {response.status}',
                'alarm': alarm_name,
                'state': new_state,
                'severity': severity
            })
        }

    except Exception as e:
        print(f"Error processing alert: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e),
                'event': event
            })
        }


def humanize_alarm_name(alarm_name: str) -> str:
    """
    Convert technical alarm names to human-readable format

    Args:
        alarm_name: Raw CloudWatch alarm name

    Returns:
        Human-readable alarm description
    """
    # Common patterns and their human names
    patterns = {
        r'.*grafana.*service.*down': 'Grafana Service Down',
        r'.*rds.*connection.*fail': 'Database Connection Failed',
        r'.*ecs.*high.*cpu': 'ECS High CPU Usage',
        r'.*alb.*response.*time': 'Application Response Time High',
        r'.*memory.*usage.*high': 'Memory Usage High',
        r'.*disk.*space.*low': 'Disk Space Low'
    }

    import re
    alarm_lower = alarm_name.lower()

    for pattern, human_name in patterns.items():
        if re.match(pattern, alarm_lower):
            return human_name

    # Fallback: clean up the technical name
    # Remove prefix and convert to title case
    cleaned = alarm_name
    # Remove common prefixes
    prefixes_to_remove = ['h-prod-', 'h-staging-', 'h-dev-']
    for prefix in prefixes_to_remove:
        if cleaned.startswith(prefix):
            cleaned = cleaned[len(prefix):]

    # Replace dashes with spaces and title case
    cleaned = cleaned.replace('-', ' ').title()
    return cleaned


def format_timestamp(timestamp_str: str) -> str:
    """
    Format ISO timestamp to human readable format

    Args:
        timestamp_str: ISO format timestamp string

    Returns:
        Formatted timestamp string
    """
    try:
        # Handle different timestamp formats CloudWatch might send
        cleaned = timestamp_str.replace('Z', '+00:00').replace('+0000', '+00:00')
        dt = datetime.fromisoformat(cleaned)
        return dt.strftime('%Y-%m-%d %H:%M:%S UTC')
    except (ValueError, AttributeError) as e:
        print(f"Timestamp parsing failed for '{timestamp_str}': {e}")
        return timestamp_str
