# SAFAQAT — Approved Project Specification

## Status and source of truth
This document records approved requirements for the Egyptian wholesale B2B marketplace صفقات (SAFAQAT). The supplied `design/approved-home-reference.png` is the visual reference for the landing screen. Do not replace the approved design with a generic template. Confirm ambiguous implementation details before committing to production behavior.

## Repository and delivery
- Existing GitHub repository: `safaqateg2026/SAFAQAT`. Do not create or migrate repositories.
- `main` is the stable branch. `develop` is for integration; implement features on dedicated feature branches and open PRs into `develop` after tests. Promote to `main` only after explicit owner approval.
- Use development → staging → production separation, with separate secrets and data. Never test payment or orders on production data.
- Target: mobile-first installable PWA, Arabic RTL, available nationwide Egypt; all merchandise sectors/categories supported.
- Hosting: Cloudflare is preferred per latest agreement; do not introduce Vercel or other providers without explicit approval. Verify actual hosting account/project configuration before deploying.
- Proposed stack: TypeScript, Next.js (only if Cloudflare adapter/build compatibility is validated), Tailwind CSS, PostgreSQL/Supabase with row-level security. Lock versions and test deployment builds; do not assume this stack has been deployed.
- No publication, environment mutation, secret handling, or GitHub edits without owner approval. Existing ChatGPT GitHub integration read works but write API returned 403. Do not claim deployment or commits until verified.

## Approved visual design
- Reference asset: `design/approved-home-reference.png` (portrait 1024 × 1536). Preserve the approved visual language, sharpness, colors and glow, with accessible readable typography and responsive layout.
- Dark purple cinematic warehouse with illuminated shelves, rich magenta neon, orange/gold shopping cart and cartons, prominent Arabic `صفقات`, English `SAFAQAT`, and tagline `كل الجملة في مكان واحد`.
- Main golden CTA `ابدأ الآن`; two role cards: `مشتري` (`صاحب محل / تاجر`) and `مورد` (`جملة / مصنع / موزع`).
- Promotional section `منظومة بصمة حضور وانصراف ذكية` and `اعرف التفاصيل`; treat as informational/coming-soon, NOT an implemented biometric system.
- `تحميل التطبيق` and `تثبيت صفقات على هاتفك`, marked free; implement genuine PWA install handling and platform-appropriate instructions, not a fake download button.
- User previously approved a cinematic blue/purple warehouse welcome layout, orange cart/boxes logo, trusted suppliers / wholesale prices / all sectors bullets, login/signup; reconcile these elements with the latest supplied image (latest image controls landing-screen appearance).
- Recreate interactive controls as semantic HTML/CSS; the reference image may be used as an approved visual asset, but do not make the entire interface a static screenshot with nonfunctional hit areas.
- Produce favicon and manifest icons from an approved logo asset; crop/derive only with owner approval if no standalone source asset exists.

## Roles and onboarding
- Supplier/wholesaler and retailer/buyer roles; separate permissions.
- Supplier must be verified before selling: valid ID front/back and face image; automated review goal ~1 hour, ambiguous cases to admin manual review. Do not promise automatic verification without implementing a real compliant service.
- Retailer signup: shop info + phone, no identity documents. Prices visible to logged-in users only.
- Verified suppliers display `مورد موثوق` badge.

## Commercial model
- Fixed 30 EGP platform commission per **completed supplier order**, paid by supplier only; retailer pays zero platform commission.
- Supplier prepaid wallet; minimum top-up 100 EGP. If available wallet balance <30 EGP, prevent new orders while leaving offers visible and existing orders active.
- Reserve 30 EGP per confirmed supplier order after buyer's 5-minute cancellation period. Track holds/releases/deductions/refunds with timestamp, order ID, and running balance; deduct fee only after verified order completion.
- Supplier withdrawals from available balance after holds and commissions.
- Retailer pays supplier via COD or electronic method as available; first PWA release must not collect real money until payment/legal/security readiness is approved.
- Sponsored listings: 20 EGP/day, 100 EGP/week, 350 EGP/month; clearly labeled `إعلان ممول`.

## Offers, cart and negotiation
- All product sectors and clear categories. Supplier chooses fixed wholesale pricing, quantity tiers, or structured offer negotiation; no direct chat.
- Minimum order configurable by amount, quantity, or none.
- Offer publication waits 10 minutes after final confirmation; during delay supplier may edit/cancel. After publication edits disabled; supplier can stop new orders; delete only if no orders.
- Unified cart across suppliers; checkout splits into distinct per-supplier orders. Supplier cannot buy from self.
- Requests filtered by supplier delivery coverage.

## Orders and fulfillment
- Retailer may cancel within 5 minutes of confirmation, with full refund if funds were captured. After window, no change-of-mind cancellation.
- Same-governorate delivery: 1–3 calendar days after order day. Outside-governorate SLA is NOT decided; must remain configurable/unpublished until approved.
- Supplier bears shipping cost (own fleet or future integrated shipping partner), and must fulfill confirmed orders even if inventory shortage requires sourcing at supplier expense; impossible cases go to dispute resolution.
- If late, notify both parties; retailer can request cancellation/refund for unjustified delay; no automatic cancellation.
- Retailer confirms receipt inside app, without driver OTP. If wrong/defective, retailer rejects with reason/evidence and full order funds remain held pending dispute; supplier pays correction, return and redelivery.
- After no response, remind; after 48h trigger review with proof of delivery, never auto-complete solely on timeout.
- All return/exchange requests require admin review. After retailer confirms `سليم ومطابق`, platform complaint window closes subject to mandatory legal rights.
- Separate buyer ratings and supplier performance metrics (fulfillment, punctuality, returns).

## Architecture, security and launch gates
- Model orders, per-supplier order splitting, payment events, wallet ledger, holds, disputes and idempotent state transitions before implementation; all monetary amounts in integer minor units with transactional DB writes.
- Implement RBAC/RLS, input validation, audit logs, safe file upload storage for ID images, rate limits, data retention, backup and restore tests. Never commit `.env`, credentials, or personal documents.
- Automated CI: lint, typecheck, unit tests, production build, integration checks; staging smoke tests for RTL, mobile, role switching, PWA manifest/install, and navigation.
- Branch protections and required checks should be enabled after verifying GitHub plan/availability; no direct unreviewed changes to `main`.
- First public release can be a clearly marked demo/preview, with no fake transactions or unimplemented feature claims. Production financial workflows require separate approval and legal/payment integration.

## Open decisions — do not invent
- Outside-governorate delivery SLA.
- Specific payment and wallet top-up providers, settlement/escrow legal architecture, identity verification provider and retention policy.
- Whether biometric attendance module is a real product scope or only promotional content on the approved screen.
- Final standalone logo asset and any domain name.
