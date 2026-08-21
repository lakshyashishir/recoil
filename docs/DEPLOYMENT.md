# Deploy Recoil

Recoil needs a long-running server. A scan returns `202 Accepted`, continues collecting evidence in the Node process, then stores the completed case. A static bucket or edge function alone is therefore not a compatible runtime.

The production build serves the Vite frontend and `/api` from the same origin. This keeps case links portable and avoids a separate CORS deployment.

## Required secrets

Configure these in the hosting platform's secret manager, never in the image or repository:

- `HYDRA_DB_API_KEY`
- `HYDRADB_DATABASE_ID`
- `GITHUB_TOKEN`
- `OPENAI_API_KEY` only when `RECOIL_ADVISORY_AGENT=on`

Keep `HYDRADB_COLLECTION_ID=recoil`. For a judge recording, also set `RECOIL_ADVISORY_AGENT=on` if the optional exact-symbol pass should run.

## Current public deployment

The Hack Hydra deployment uses the production `Dockerfile` and runs as a private ECR image on a single App Runner instance in `ap-south-1`:

- App Runner serves the frontend and API from one HTTPS origin;
- Secrets Manager provides the HydraDB, GitHub, and optional OpenAI credentials;
- the `recoil-workspace` CloudFormation stack provides the versioned S3 object and least-privilege runtime roles;
- App Runner is constrained to one instance so two monitors cannot race to update the shared workspace;
- CloudFront is optional and is not required when the generated App Runner hostname is acceptable.

Public endpoint: [nacmbw5dea.ap-south-1.awsapprunner.com](https://nacmbw5dea.ap-south-1.awsapprunner.com)

## App Runner from this repository

The included `apprunner.yaml` installs the locked dependencies, builds the frontend, starts the combined server on port 8787, and applies conservative public-demo limits.

1. Create an App Runner service from the private GitHub repository.
2. Choose **Use a configuration file** so App Runner reads `apprunner.yaml`.
3. Add the required secrets as runtime environment variables or secret references.
4. Set a health check to HTTP `/api/health`.
5. Open the App Runner URL and run one repository scan before adding CloudFront.

The current deployment should run as one instance because it intentionally exposes one tenant. HydraDB is
the durable temporal evidence record. The operational watchlist, recent cases, monitor state, and
notifications are mirrored to one private S3 object when `RECOIL_WORKSPACE_S3_BUCKET` is set. The local
workspace file remains the fast process-local copy. At startup Recoil restores the S3 snapshot before it
accepts traffic, and every later workspace update is written locally and queued to S3.

Production startup fails closed when a configured S3 workspace cannot be read. This prevents a transient
restore failure from replacing the durable object with an empty local workspace. Set
`RECOIL_WORKSPACE_ALLOW_LOCAL_FALLBACK=1` only during an intentional recovery session. On `SIGTERM` or
`SIGINT`, Recoil stops accepting traffic, gives active investigations a bounded drain window, writes the
final workspace snapshot, and waits for the queued S3 write to finish. Configure the drain window with
`RECOIL_SHUTDOWN_DRAIN_MS` when the hosting platform uses a different termination grace period.

Create the private versioned bucket and least-privilege App Runner instance role:

```bash
aws cloudformation deploy \
  --template-file infra/workspace-store.yml \
  --stack-name recoil-workspace \
  --capabilities CAPABILITY_IAM
```

Use the stack outputs to configure the App Runner service:

- attach `AppRunnerInstanceRoleArn` as the service instance role;
- set `RECOIL_WORKSPACE_S3_BUCKET` to `WorkspaceBucketName`;
- set `RECOIL_WORKSPACE_S3_KEY=recoil/workspace.json`;
- set `AWS_REGION` to the bucket region.

Do not scale this single-workspace build horizontally. Each instance would otherwise run its own monitor and
could race to update the same object.

The included App Runner configuration sets `RECOIL_WATCH_INTERVAL_MS=21600000`, so active watches are checked
every six hours. Change it to `0` for a manual-only deployment. Every interval performs real public
collection and can consume GitHub, OSV, OpenAI, and HydraDB quota. `RECOIL_NOTIFICATION_WEBHOOK_URL`
is optional and receives `recoil.notification/v1` JSON for a new reachable exposure or verdict change.

## CloudFront

CloudFront should use the App Runner hostname as a custom HTTPS origin. The included template uses:

- AWS managed `CachingOptimized` for frontend files
- AWS managed `CachingDisabled` for `/api/*`
- all viewer headers except the viewer `Host` header for API requests
- all HTTP methods on `/api/*`

Deploy after replacing the parameter with the App Runner hostname:

```bash
aws cloudformation deploy \
  --template-file infra/cloudfront.yml \
  --stack-name recoil-cloudfront \
  --parameter-overrides OriginDomain=YOUR_SERVICE.REGION.awsapprunner.com
```

Then read the `DemoUrl` stack output. Query-string case links such as `/?case=CASE_ID#graph` work without special error rewrites because the Node origin serves the SPA fallback.

## Container alternative

The same artifact runs on any long-lived container platform:

```bash
docker build -t recoil .
docker run --rm -p 8787:8787 --env-file .env recoil
```

Verify before sharing:

```bash
curl -fsS http://127.0.0.1:8787/api/health
```

The response must report `workspaceStorage.mode` as `s3`, `durable` as `true`, and `status` as `ready`
before the public URL is shared. The health endpoint returns `503` if durable workspace writes enter a
failed state, allowing the platform health check to remove an unhealthy instance.

## Release checklist

1. Run the network doctor against the configured services:

   ```bash
   npm run doctor -- --network
   ```

2. Run one repository-only scan on a public repository.
3. Confirm the workspace health reports durable S3 storage as ready.
4. Confirm the issue draft opens on GitHub and the receipt downloads.
5. Confirm both theme modes and a direct `?case=` link in a private browser window.

The public root opens the latest retained case when the workspace already contains scans. It shows the
repository onboarding screen only for an empty workspace. Run a real scan once after the first
deployment, then verify that a private browser opens directly into the populated dashboard.

## Why not Vercel for this build

The current engine returns `202 Accepted`, continues collection in the Node process, and runs a scheduled
watch loop. A normal Vercel function can stop after its response and does not own a durable in-process timer.
Moving Recoil there would require a queue, resumable jobs, and an external scheduler. App Runner keeps the
current execution model without splitting scans across short-lived functions.
