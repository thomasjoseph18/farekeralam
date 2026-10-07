# Fare Keralam

Kerala fare estimates with transparent operating-cost calculations.

## Development

Requires Node.js and pnpm. Run `pnpm install`, then `pnpm dev`.
Run `pnpm build` for production output in `dist`.

## Backend

The Supabase backend calculates fuel, maintenance, tyres, insurance and tax,
depreciation, and driver earnings. Reviewed worksheets publish independently;
missing data uses labelled fallback rates and stale evidence stays marked stale.
Estimates are not official fare orders.

See [backend setup](supabase/README.md) for deployment, admin access, Gemini
research, and daily scheduling. Keep API keys in backend secrets, not Git.
Research findings require approval before publication.

The legacy app and its deployment workflows have been replaced. GitHub upload
does not deploy this website or the Supabase backend. Frontend hosting must
build and serve `dist` with SPA fallback. Live data setup remains necessary.
