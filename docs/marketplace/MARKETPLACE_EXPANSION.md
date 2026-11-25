# SAFAQAT Marketplace Expansion

## Design

- Preserve the approved SAFAQAT visual identity.
- Preserve the approved map design.
- Maintain Arabic RTL and English LTR support.
- Maintain responsive mobile and desktop layouts.
- Do not replace approved assets.

## Delivery marketplace

- Suppliers, retailers and consumers can request delivery.
- Vehicle categories: rider, car, truck and bicycle.
- Display available nearby vehicles by selected category.
- Display distance and sort nearest first.
- Allow selection of pickup and destination.
- Eligible nearby couriers may accept or decline requests.
- Assign each request atomically to one accepting courier.
- Prevent duplicate assignments.
- Keep delivery prices and commissions unresolved.
- Do not invent prices or financial rules.
- Require explicit courier availability and location permission.
- Protect precise personal locations before assignment.

## Consumer retail marketplace

- Consumers can access nearby retailers.
- Upper half of mobile screen: approved SAFAQAT map.
- Lower half: scrollable full-width retailer rows.
- Each row includes retailer logo, name, distance,
  record-based reputation and accepted payment methods.
- Sort retailers nearest first.
- Prefer road-route distances when available.
- Clearly identify approximate straight-line distances.
- Never represent approximate distances as road distances.

## Retailer reputation

- Reputation must be derived from verified records.
- Retailers cannot edit their own reputation.
- New retailers must not receive fabricated ratings.
- Final reputation calculation remains unresolved.

## Payment methods

- Retailers select supported payment methods.
- Supported options: cash, wallet, InstaPay and Fawry.
- Consumers choose only methods accepted by the retailer.
- Payment method selection is not payment confirmation.
- No payment processing integration without approval.

## Location privacy

- Retailers cannot browse consumer locations.
- When a retailer delivers an order, the consumer
  explicitly shares the delivery location.
- Access is restricted to the authorized delivery task.
- Revoke location access when the order is completed
  or cancelled.
- Do not retain precise delivery locations in
  retailer-accessible order history.
- Prevent location disclosure through public APIs.
- Third-party courier location sharing requires
  final workflow approval.

## Consumer purchase history

- Preserve retailer name and logo snapshot.
- Preserve final order total and currency.
- Preserve selected payment method beside the total.
- Preserve order status and transaction reference.
- History must be restricted to the account owner.
- Never treat selected payment method as proof of payment.

## Release safeguards

- Keep real registration disabled until providers,
  approved policies and security checks are ready.
- Use synthetic records for development and testing.
- Do not introduce paid services.
- Do not modify the main branch.
- Do not expose private identity documents.
- Do not activate unfinished marketplace workflows.
