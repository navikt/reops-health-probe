# Health Probe - Data Pipeline Monitor

A Deno-based health monitoring system that continuously injects probe data into a pipeline and verifies it arrives at the expected destination, sending Slack alerts when issues are detected.

## How it works

```mermaid
flowchart LR
A[Health Probe]
B[Pipeline Ingress]
C[(Expected Destination)]
D@{shape: cloud, label: Slack}

A -->|1. Inject probe with UUID| B
B -.->|pipeline processes data| C
A -->|2. Verify probe arrived| C
A -->|3. Alert if not found| D
```

Each probe: injects a uniquely identifiable event, waits for the pipeline to process it, then queries the destination to confirm it arrived. Alerts via Slack if the probe is not found within the timeout.

## Configuration

### Environment Variables

Create a `.env` file (see `.env.example`):

```bash
# Innblikk Configuration
INGRESS_URL=https://your-innblikk-proxy.nav.no
WEBSITE_ID=your-website-id

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
   - `WEBSITE_ID`
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

**Innblikk probe injection fails**
- Verify `INGRESS_URL` and `WEBSITE_ID`
- Check Innblikk proxy endpoint is accessible
- Verify `WEBSITE_ID` env var

**Slack alerts not sending**
- Verify `SLACK_BOT_TOKEN` is valid
- Check bot has permission to post in channels
- Verify channel names in config.json (include #)

## License

MIT
