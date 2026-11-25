# SAFAQAT Unified Subscriber Dossier

## Account organization

Every subscriber must have one immutable internal account ID.
A human-readable membership number may be added using an
approved numbering format.

Supported roles:

- Supplier
- Merchant
- Consumer
- Courier

The administrative interface must present one unified dossier
per subscriber. Do not duplicate account records across modules.

## Dossier sections

- Personal information
- Verified contact information
- Account status and activation
- Identity verification status
- Private document references
- Addresses and geographic locations
- Business information
- Optional profile images and logos
- Vehicle information and licenses
- Authentication sessions and devices
- Products and offers, where applicable
- Orders and invoices
- Financial records, where applicable
- Ratings, complaints and disputes
- Notifications
- Administrative audit history

Only role-appropriate sections may be displayed.

## Persistence

Reuse the existing account schema and migrations.
Link related records using the immutable account ID.
Do not introduce a duplicate subscriber database.
Use pagination for large histories.

## Security

Enforce server-side authorization for every account operation.
Separate public profile information from private information.
Never expose private documents through public asset URLs.
Never store credentials or session tokens in dossier responses.
Never expose another subscriber's private records.
Require authorized administrative access and audit sensitive actions.
Use synthetic data for development and testing.

## Authentication and verification

Phone verification requires a trusted server-side receipt.
Google and email verification require configured providers.
Identity extraction and liveness require trusted results.
Never simulate successful verification.
Never activate an account using client-provided verification flags.

## Deployment gates

Cloud persistence, private document storage, external providers,
retention policies and production activation require validation
and explicit approval.

This document defines the target architecture.
It does not claim that cloud services or account APIs are active.

## Local history service

The subscriber history service provides bounded pages
of orders, invoices, account activity, reviews, support
cases and private archive metadata.

Each read requires a trusted administrative principal.
Archive and support sections require additional permissions.
Invoice history requires a trusted visibility policy.
Storage object keys and session credentials are excluded.

This service is not a public HTTP endpoint.
Production activation requires authenticated server wiring.
