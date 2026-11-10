"""Track the originating sale line for invoice-linked customer returns."""

from sqlalchemy import inspect, text


REVISION = "customer_return_sale_item_v1"


def upgrade(engine):
    with engine.begin() as connection:
        if not inspect(connection).has_table("customer_return"):
            return
        columns = {
            column["name"]
            for column in inspect(connection).get_columns("customer_return")
        }
        if "source_sale_item_id" not in columns:
            connection.execute(text(
                "ALTER TABLE customer_return ADD COLUMN source_sale_item_id INTEGER"
            ))
        if "is_manual" not in columns:
            connection.execute(text(
                "ALTER TABLE customer_return ADD COLUMN is_manual BOOLEAN NOT NULL DEFAULT 0"
            ))
        connection.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_customer_return_source_sale_item_id "
            "ON customer_return (source_sale_item_id)"
        ))
