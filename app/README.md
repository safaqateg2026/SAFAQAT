This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Cloudflare release

Development runs with `npm run dev` on a dedicated feature branch. Run the
following gates using the checked-in lockfile and use the same static export
for both staging and production:

```sh
npm ci
npm run lint
npx tsc --noEmit
npm run build
```

Upload only `app/out` to the approved Cloudflare Pages project. Use a
non-production branch name such as `staging` for a preview deployment, then
verify the HTTPS homepage, role navigation, Android/iOS guidance, manifest,
icons, and service worker. Record the preview URL and the source commit.

After owner approval of the tested artifact, upload the same export manually to
the project's configured production branch. Verify the canonical HTTPS URL
after promotion. Use the Cloudflare Pages deployment history to roll back if
necessary. Direct Upload keeps a Git push from publishing changes. Production
promotion does not require merging into Git `main`.

The export contains the public landing PWA only. It has no database bindings,
private stock data, credentials, identity forms, order processing, or payments.
The service worker serves a small offline notice when a network navigation
fails and does not pin application HTML or JavaScript to a stale release.
