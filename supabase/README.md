# Fare Keralam backend

The frontend preserves the existing app and uses URL-based pages. The Hono edge function stores fare profiles, sourced official tariffs and daily cost snapshots using the existing Supabase key-value table. No live prices are seeded or invented. The model starts with explicitly labelled prototype rates.

## Activate the backend

1. Deploy `supabase/functions/server/index.tsx` as the existing `make-server-0510dbc7` function through Make settings. Its bundle must include `shared/fare-model.ts`. If deploying with Supabase CLI, use the function directory and the corresponding function name consistently; the frontend URL uses `make-server-0510dbc7`.
2. Set `ADMIN_EMAILS` to a comma-separated allowlist of administrator emails. Create these users in Supabase Authentication and confirm their emails. Sign in at `/admin`; public sign-up does not grant administration. Tokens stay in memory and must be renewed by signing in again when they expire. The function uses Supabase's existing URL, anon key and service-role environment variables. Never expose the service-role key to the frontend.
3. Set `COST_DATA_API_URL` to a trusted HTTPS feed conforming to the contract below. Set `COST_DATA_API_KEY` if the provider requires a bearer token. This is an integration contract, not a preconnected commercial fuel-price service. A provider adapter is required if an API returns only litre prices instead of allocated per-kilometre costs.
4. Set `COST_REFRESH_SECRET` to a long random secret. Deploy the function again after configuration. Configure Edge Function JWT verification to accept the Supabase anon gateway key for public and scheduled calls; admin authorization is additionally enforced inside the function.
5. In Supabase Vault create `fare_cost_api_base` containing `https://hkzqrokepzvbvsdgnpsa.supabase.co/functions/v1/make-server-0510dbc7`, `fare_cost_anon_key` containing the project's public anon key, and `fare_cost_refresh_secret` containing the same refresh secret. Do not place these values in committed SQL.
6. Run `schedule-cost-updates.sql` in Supabase SQL Editor as postgres. It schedules refresh at 00:30 UTC / 06:00 IST, even when nobody visits the website. This SQL is not automatically applied by the frontend build. Enable pg_cron, pg_net and Vault for your project first if needed.
7. Check the job in `cron.job_run_details` and the HTTP result in `net._http_response`. A successful cron SQL execution only confirms dispatch; verify the HTTP response is 200 and the cost observation date advanced. Invoke `select public.refresh_fare_costs();` for a manual dispatch.

## Cost feed contract

### Gemini research alternative

`GEMINI_API_KEY` is used only server-side. `GEMINI_MODEL` optionally overrides the default `gemini-2.5-flash`; use a model with Google Search grounding and confirm availability/quota for your Google project. This integration uses `generateContent` with `google_search`, preserves grounding links and search suggestions, and rejects incomplete or ungrounded responses. It does not claim unlimited free API usage. A secret being saved does not verify model access or deploy the function.

After redeployment, sign in at `/admin`, save an exact location, and enter documented fuel efficiency and bus passenger allocation. Publish a sourced maintenance/other baseline for that exact location. Run Gemini research manually or explicitly enable scheduled research. The existing daily SQL endpoint runs Gemini when no `COST_DATA_API_URL` is configured; a configured direct feed takes priority. Daily research is limited to one attempt per 24 hours, including failed attempts, to limit accidental quota use. Separate Edge Function instances can still race; set hard quotas/budgets in Google Cloud for a production spend ceiling.

Findings enter a pending review queue; they do not silently change fares. Inspect source date, actual price, city, evidence and efficiency, then approve or reject the fuel findings. Approval computes fuel cost as `price / kmPerLitre / fareUnits`, keeps maintenance and other baseline components unchanged, records baseline provenance and original research dates, and stores the published snapshot. Missing fuel types, undocumented efficiency, mismatched location, obsolete reports and ungrounded sources block publication. Maintenance findings are summaries for manual review only—general web service prices cannot be converted into a daily per-km cost without a documented allocation methodology.

Google Search grounding is evidence retrieval, not independent verification. Search results may be outdated or omit local prices; even grounded text can be inaccurate, so human review remains required. The public website labels approved Gemini data as reviewed research, not a direct verified fuel-price feed. Google search suggestions are displayed in a sandboxed iframe. Review the applicable [Google grounding documentation and usage requirements](https://ai.google.dev/gemini-api/docs/google-search) before production use.

Backend routes live in `supabase/functions/server/service.ts`, with `index.tsx` serving the imported application. Deploy the entire function bundle, including `research.ts` and referenced shared modules. Gemini calls can take up to 55 seconds; client research and scheduled requests use longer timeouts. Your hosting platform must permit that duration. No live Gemini call was made during implementation.

Research endpoints (all administrator protected): `GET /admin/research`, `PUT /admin/research/settings`, `POST /admin/research/run`, `POST /admin/research/review`. Review requires `{reportId, action: "approve" | "reject", confirmEvidence: true}` for approval. Scheduler HTTP 200 with `research_completed` confirms research, not publication. Check the admin pending report and publication separately.

Return JSON with `observedAt` (ISO timestamp within the last 48 hours), `location`, and `vehicles` containing every key: `auto`, `cab`, `maxicab`, `contract`, `bus`. Each vehicle needs finite nonnegative `fuelPerKm`, `maintenancePerKm`, `otherPerKm` (maximum 1000), plus a nonempty `sourceUrls` array of HTTPS evidence links. Optional `fuelPrices` is an array of `{name, price, unit, sourceUrl}` for the public fuel-price panel.

All component rates must be allocated per fare unit: per hired vehicle for contract transport, and per passenger for bus estimates. Fuel cost should be computed from sourced fuel price and documented efficiency. Maintenance and other costs should use documented invoices or cost indices and an allocation methodology; do not guess daily changes. An adapter must enforce the chosen location, source provenance, currency, energy type, and methodology. HTTPS links and numeric validation alone do not verify the truth of a feed.

The admin can publish sourced snapshots manually while a provider is being integrated. Manual publication is not automatic detection. Both modes retain historical snapshots, one latest observation per UTC day. Older snapshots are rejected. Failed refreshes keep the last valid data and the UI marks observations older than 24 hours as stale. Visitor-triggered refreshes run at most daily with an hourly failure retry; the SQL scheduler supplies unattended updates.

## Fare model

### Six-component worksheets

Gemini now researches all six components and returns dated, cited amounts with units and vehicle context under `costFindings`. It searches fuel/efficiency evidence, service quotations and intervals, tyre set prices and replacement mileage, insurance quotations and Kerala vehicle-class taxes, purchase/resale quotes, and driver wage/earnings benchmarks. Missing evidence stays missing. A grounded source is not a guarantee of suitability: inspect model, location, commercial classification, date, quantities, tax inclusion and policy coverage before using an amount.

The admin six-component worksheet computes these **vehicle-level** amounts, then divides every component by the documented fare-unit allocation (1 for hired transport, passenger allocation for buses):

| Component | Calculation | Required evidence |
| --- | --- | --- |
| Fuel | ₹/litre ÷ km/litre | Current local price and separate documented efficiency source |
| Maintenance | Service cost ÷ service interval km | Applicable service quote/invoice and OEM schedule; exclude separately counted tyres |
| Tyres | Complete tyre-set cost ÷ replacement interval km | Set quantity/price and documented replacement assumption |
| Insurance & tax | (Annual premium + annual vehicle tax) ÷ annual km | Actual applicable policy/quote, Kerala tax classification, documented mileage |
| Depreciation | (Purchase price − residual value) ÷ useful-life km | Purchase and comparable residual evidence, reviewed lifespan assumption |
| Driver earnings | Monthly earnings target ÷ monthly km | Wage/earnings benchmark or operator target and documented monthly mileage |

Driver earnings are a reviewed policy target, not a claim about actual income. A wage minimum is not interchangeable with take-home income. Depreciation is an explicit straight-line allocation assumption, not a market forecast. Every component needs a source URL, effective date and an allocation note. Annual and lifetime inputs are not falsely treated as changing daily. Fuel evidence must be within 48 hours; durable source dates remain visible. Zero is accepted only as an explicitly reviewed amount, not as a substitute for missing evidence.

`GET /admin/cost-bases` loads worksheets. `POST /admin/cost-bases` accepts `{vehicleId, basis}`; inputs are validated and computed on the backend. Each complete vehicle worksheet publishes independently, retaining other published vehicles for the same exact location with their original observation dates. Missing categories use labelled fallback rates; changing location starts a separate snapshot. The snapshot preserves six-component `breakdown` and the reviewed `basis`. "Other" is the sum of tyres, insurance/tax, depreciation and driver earnings, not a seventh charge. Estimates include journey-level `operatingBreakdown`, already included in the operating subtotal. Freshness is evaluated per vehicle: publishing another category cannot refresh old evidence. Legacy/demo chart percentages remain labelled illustrative.

Fuel-only Gemini approval updates the fuel component and its evidence in an existing six-component basis, retaining the other five components. Changes to passenger allocation require recalculating the full worksheet. Maintenance and other grounded amounts must be reviewed and entered in the worksheet before publication. No all-six live data was seeded during implementation, and no billable Gemini call was made.

`estimate = round(base + distance × (distanceRate + operatingRate))`.

Verified fuel, maintenance and other components replace—not add to—the fallback operating rate. Base and distance rates must exclude those operating components to avoid double counting. If no verified snapshot exists, the fallback is labelled. Admin-configured rates are recommendations, not official government tariffs. This formula is a transparent configurable model, not a claim of statutory or economically validated pricing.

Official records contain `vehicleId`, `minimumFare`, `includedKm`, `perKm`, `effectiveFrom` (YYYY-MM-DD), and `sourceUrl`. Only simple minimum-plus-distance tariffs are supported. Do not enter stage-based tariffs, surcharges, night charges or occupancy rules as approximate linear official records. Official comparison uses active records only and never changes in response to the cost feed.

## Endpoints

- `GET /fares`: current model and sourced official records.
- `GET /costs`: cached verified snapshot and freshness state.
- `GET /costs/history`: most recent 30 daily snapshots.
- `POST /estimates`: `{vehicleId, distance}`; accepts distances greater than zero up to 2000 km.
- `GET /admin/status`: authorized admin integration status.
- `PUT /admin/fares`: validated `{profiles, official}`.
- `PUT /admin/costs`: validated snapshot.
- `POST /admin/refresh`: authorized provider refresh.
- `POST /costs/refresh`: scheduler call with anon gateway authorization and `X-Refresh-Secret`.

All paths are appended to the API base above. Public reads and calculations are unauthenticated at application level; administrative writes require a confirmed Supabase user on `ADMIN_EMAILS`. The autogenerated key-value helper is unchanged. No personal journey data is persisted. Before production launch, configure platform rate limiting, monitoring/alerts, provider licensing, and a reviewed pricing methodology. This app is not intended to collect sensitive personal information.

## Verification

Run `pnpm exec tsc --noEmit` and `pnpm build` for the frontend. Check the edge-function bundle with Deno when available. Deployment, authentication, the data provider and cron execution require separate live verification in the connected Supabase project; a frontend build does not verify them.

The current autogenerated `kv_store.tsx` has an existing strict Deno typing error because `Deno.env.get("SUPABASE_URL")` can return undefined. This generated file was not edited. Added backend code was typechecked with a typed in-memory storage substitute; public API routes were exercised against that substitute, including changed-cost estimates, rejected inputs and unauthorized writes. These checks do not verify live database access or successful administrator login.
