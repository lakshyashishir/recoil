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

## App Runner from this repository

The included `apprunner.yaml` installs the locked dependencies, builds the frontend, starts the combined server on port 8787, and applies conservative public-demo limits.

1. Create an App Runner service from the private GitHub repository.
2. Choose **Use a configuration file** so App Runner reads `apprunner.yaml`.
3. Add the required secrets as runtime environment variables or secret references.
4. Set a health check to HTTP `/api/health`.
5. Open the App Runner URL and run one repository scan before adding CloudFront.

The application cache and workspace paths are local to the instance. HydraDB remains the durable temporal record. A restarted or scaled instance may start with an empty local recent-case list, but new investigations remain valid.

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

## Demo checklist

1. Run `npm run doctor -- --recording --network` against the deployed environment.
2. Open the verified three-way case once so it is warm in GitHub and HydraDB caches.
3. Run one repository-only scan on an unfamiliar public repository.
4. Confirm the issue draft opens on GitHub and the receipt downloads.
5. Confirm both theme modes and a direct `?case=` link in a private browser window.
