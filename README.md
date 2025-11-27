# Health Probe - Data Pipeline Monitor

A Deno-based health monitoring system for the Umami → BigQuery data pipeline. The system continuously injects probe data into Umami and verifies it appears in BigQuery, sending intelligent Slack alerts when issues are detected.

## Features

- **Automated Health Checks**: Runs probes every 5 minutes
- **Smart Alerting**: 
  - Immediate alert on first failure
  - Repeat alerts every 30 minutes if unresolved
  - Interactive "Jobber med saken" button to acknowledge issues
  - Auto-escalate to `#produksjonshendelser` after 60 minutes if unacknowledged
- **Recovery Notifications**: Automatically sends recovery alerts when pipeline is restored
- **Structured Logging**: JSON-formatted logs for easy parsing and monitoring

## Architecture

```mermaid
flowchart LR
A[Smoke Test Service]
B[Umami-proxy<br>umami.nav.no/api/send]
C[Umami<br>🔒]
D[(postgres<br>🔒)]
E[(BigQuery<br>v1🔒 or v2)]
F@{shape: cloud, label: Slack<br>#researchops-intern}
G[Metabase]

A -->|HTTP Request<br>every minute?| B
B .-> C
C .-> D
D .->|Datastream<br>🔒| E
E .->|SQL Query<br>response| G
A -->|Check ❌ or ✅| E
A -->|Notify if unhealthy ❌| F
```

1. **Inject**: Send probe data with UUID to Umami
2. **Verify**: Query BigQuery to confirm probe data arrived
3. **Alert**: Send Slack notifications if probe not found
4. **Escalate**: Escalate to production channel if unacknowledged

## Configuration

### Environment Variables

Create a `.env` file (see `.env.example`):

```bash
# Umami Configuration
UMAMI_BASE_URL=https://your-umami-instance.com
UMAMI_API_KEY=your-umami-api-key

# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
SLACK_SIGNING_SECRET=your-slack-signing-secret

# BigQuery Configuration (Workload Identity on NAIS)
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GCP_SERVICE_ACCOUNT=your-service-account@your-project.iam.gserviceaccount.com
```

### Application Settings

Edit `config.json` to adjust timing and channels:

```json
{
  "probe": {
    "interval": "5 minutes",        // How often to run probes
    "initialDelay": "2 minutes",    // Wait time before first check
    "checkInterval": "1 minute",    // Interval between checks
    "maxWaitTime": "15 minutes"     // Max time to wait for probe
  },
  "alerting": {
    "repeatInterval": "30 minutes", // Repeat alert frequency
    "escalationDelay": "60 minutes", // Time before escalation
    "primaryChannel": "#researchops-alerts",
    "escalationChannel": "#produksjonshendelser"
  }
}
```

## Development

### Prerequisites

- [Deno](https://deno.land/) v1.40+

### Install Dependencies

Dependencies are automatically downloaded when you run the application.

### Run Locally

```bash
# Copy example env file
cp .env.example .env

# Edit .env with your credentials
nano .env

# Run the application
deno task start

# Or run in development mode with watch
deno task dev
```

### Type Check

```bash
deno task check
```

## Deployment (NAIS)

### Prerequisites

- NAIS cluster access
- Workload Identity configured for BigQuery access
- Slack app with bot token

### Deploy

1. Update `config.json` with production values
2. Ensure secrets are configured in NAIS:
   - `UMAMI_API_KEY`
   - `SLACK_BOT_TOKEN`
3. Deploy using NAIS deploy pipeline

### NAIS Configuration

The application uses:
- **Workload Identity** for BigQuery authentication (no service account keys needed)
- **Environment variables** for secrets
- **Health checks** via NAIS standard endpoints

## Project Structure

```
health-probe/
├── deno.json                    # Deno configuration & dependencies
├── config.json                  # Application settings
├── .env.example                 # Environment variables template
└── src/
    ├── main.ts                  # Application entry point
    ├── config/
    │   ├── types.ts             # TypeScript interfaces
    │   └── loader.ts            # Configuration loader
    ├── probe/
    │   └── injector.ts          # Umami probe injection
    ├── verifier/
    │   └── bigquery.ts          # BigQuery verification
    ├── alerting/
    │   └── slack.ts             # Slack integration
    ├── scheduler/
    │   └── scheduler.ts         # Probe scheduling logic
    ├── state/
    │   └── store.ts             # State management
    └── utils/
        ├── time.ts              # Time parsing utilities
        └── logger.ts            # Logging utilities
```

## How It Works

### Probe Cycle

1. **Inject Probe**: Generate UUID and send to Umami API
2. **Wait**: Sleep for 2 minutes (let data flow through pipeline)
3. **Verify**: Check BigQuery every 1 minute for up to 15 minutes
4. **Alert**: If probe not found, send Slack alert
5. **Repeat**: Run next probe in 5 minutes

### Alerting Flow

```
Failure Detected
    ↓
Send Initial Alert (#researchops-alerts)
    ↓
Wait 30 minutes
    ↓
Still failing? → Update Alert
    ↓
60 minutes passed & not acknowledged?
    ↓
Escalate to #produksjonshendelser
    ↓
Pipeline recovered? → Send Recovery Alert
```

### State Management

The application maintains in-memory state to:
- Track current failing probe
- Prevent duplicate alerts
- Manage acknowledgment status
- Control escalation timing

## Monitoring

### Logs

All logs are JSON-formatted with timestamps:

```json
{
  "timestamp": "2024-11-25T10:30:00.000Z",
  "level": "info",
  "message": "Probe injected successfully",
  "data": { "probeId": "550e8400-e29b-41d4-a716-446655440000" }
}
```

### Metrics

Key metrics to monitor:
- Probe success/failure rate
- Time to detect failures
- Alert frequency
- Recovery time

## Troubleshooting

### Common Issues

**BigQuery authentication fails**
- Verify Workload Identity is configured correctly
- Check `GCP_SERVICE_ACCOUNT` environment variable
- Ensure service account has BigQuery read permissions

**Umami probe injection fails**
- Verify `UMAMI_BASE_URL` and `UMAMI_API_KEY`
- Check Umami API endpoint is accessible
- Verify `websiteId` in config.json

**Slack alerts not sending**
- Verify `SLACK_BOT_TOKEN` is valid
- Check bot has permission to post in channels
- Verify channel names in config.json (include #)

## License

MIT
