-- Catalog references and product labels are snapshots from the catalog service.
CREATE TABLE commerce_order (
    id TEXT PRIMARY KEY NOT NULL,
    buyer_id TEXT NOT NULL REFERENCES subscriber(id),
    seller_id TEXT NOT NULL REFERENCES subscriber(id),
    state TEXT NOT NULL CHECK (state IN ('pending', 'cancelled', 'completed')),
    created_at INTEGER NOT NULL,
    CHECK (buyer_id <> seller_id)
) STRICT;

CREATE TABLE completed_order_total (
    order_id TEXT PRIMARY KEY NOT NULL REFERENCES commerce_order(id),
    buyer_id TEXT NOT NULL REFERENCES subscriber(id),
    seller_id TEXT NOT NULL REFERENCES subscriber(id),
    currency TEXT NOT NULL CHECK (currency = 'EGP'),
    total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
    completed_at INTEGER NOT NULL
) STRICT;

CREATE INDEX completed_order_purchases ON completed_order_total(buyer_id, completed_at);
CREATE INDEX completed_order_sales ON completed_order_total(seller_id, completed_at);

CREATE TABLE order_invoice (
    id TEXT PRIMARY KEY NOT NULL,
    order_id TEXT NOT NULL UNIQUE REFERENCES completed_order_total(order_id)
) STRICT;

CREATE TABLE order_invoice_line (
    invoice_id TEXT NOT NULL REFERENCES order_invoice(id),
    line_number INTEGER NOT NULL CHECK (line_number > 0),
    product_id TEXT NOT NULL CHECK (length(trim(product_id)) > 0),
    product_name TEXT NOT NULL CHECK (length(trim(product_name)) > 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_minor INTEGER NOT NULL CHECK (unit_minor >= 0),
    line_minor INTEGER NOT NULL CHECK (line_minor = unit_minor * quantity),
    PRIMARY KEY (invoice_id, line_number)
) STRICT;

CREATE TRIGGER completed_order_total_consistent
BEFORE INSERT ON completed_order_total
WHEN NOT EXISTS (
    SELECT 1 FROM commerce_order WHERE id = NEW.order_id AND state = 'completed'
      AND buyer_id = NEW.buyer_id AND seller_id = NEW.seller_id AND created_at <= NEW.completed_at
)
BEGIN
    SELECT RAISE(ABORT, 'completion must match the order');
END;

CREATE TRIGGER completed_order_total_immutable
BEFORE UPDATE ON completed_order_total
BEGIN
    SELECT RAISE(ABORT, 'completion records are immutable');
END;

CREATE TRIGGER completed_order_total_preserved
BEFORE DELETE ON completed_order_total
BEGIN
    SELECT RAISE(ABORT, 'completion records must be retained');
END;

CREATE TRIGGER completed_order_immutable
BEFORE UPDATE ON commerce_order
WHEN OLD.state IN ('cancelled', 'completed')
BEGIN
    SELECT RAISE(ABORT, 'terminal order is immutable');
END;
