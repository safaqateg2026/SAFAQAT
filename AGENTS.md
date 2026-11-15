# Instructions for coding agents — SAFAQAT

Read `PROJECT_SPEC.md` and `design/approved-home-reference.png` before proposing code. Treat the approved image as the landing-screen visual authority and `PROJECT_SPEC.md` as business-rules authority. Do not improvise unspecified policies.

Work only in the existing repository `safaqateg2026/SAFAQAT`. Keep `main` untouched until explicit user approval. Start from `develop`, create a focused feature branch, and present a proposed change plan before writing. Never merge, deploy, change settings, provision paid resources, or connect services without explicit approval. If write access is denied (403), report it; do not circumvent permissions.

First milestone: responsive, visually faithful Arabic RTL landing page with genuine clickable navigation and installable PWA scaffolding. Keep unimplemented functions labeled demo/coming soon. Provide screenshots and build/test results, compare with the reference, and request approval before promotion.

Maintain separation of UI, business logic, persistence, and deployment configuration. Use strict types, locked dependencies, validation, tests, migrations, and auditability. Protect credentials and private documents. Do not enable real orders, payments, withdrawals or identity processing until backend controls, testing and explicit approval exist.

Do not create a new repository or switch hosting vendors. Cloudflare deployment requires compatibility validation first. Summarize exactly what changed, tests run, open issues, and next approval needed.
