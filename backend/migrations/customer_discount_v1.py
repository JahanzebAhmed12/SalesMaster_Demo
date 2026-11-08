"""Idempotent startup migration for customer discount adjustments."""


REVISION = "customer_discount_v1"


def upgrade(engine, customer_discount_table, customer_discount_audit_table):
    """Create the additive discount tables without modifying existing records."""
    with engine.begin() as connection:
        customer_discount_table.create(bind=connection, checkfirst=True)
        customer_discount_audit_table.create(bind=connection, checkfirst=True)
