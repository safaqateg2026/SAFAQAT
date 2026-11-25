CREATE VIEW marketplace_visible_retailer AS
SELECT
  p.subscriber_id,
  p.updated_at
FROM retailer_marketplace_presence AS p
JOIN subscriber AS s ON s.id = p.subscriber_id
WHERE p.visible = 1
  AND s.role = 'retailer'
  AND s.state = 'active'
  AND EXISTS (
    SELECT 1
    FROM retailer_payment_method AS m
    WHERE m.subscriber_id = p.subscriber_id
  );

CREATE VIEW marketplace_available_courier AS
SELECT
  p.subscriber_id,
  p.latitude,
  p.longitude,
  p.updated_at,
  p.expires_at
FROM courier_marketplace_presence AS p
JOIN subscriber AS s ON s.id = p.subscriber_id
WHERE p.available = 1
  AND s.role = 'courier'
  AND s.state = 'active'
  AND p.expires_at > unixepoch();
