"""Add shared invoice numbers to return/discount documents."""

from sqlalchemy import inspect, text


REVISION = "invoice_document_numbers_v1"


def upgrade(engine, sequence_table):
    """Add nullable document-number fields without rewriting existing records."""
    with engine.begin() as connection:
        inspector = inspect(connection)
        for table_name in ("customer_return", "customer_discount"):
            if not inspector.has_table(table_name):
                continue
            columns = {column["name"] for column in inspector.get_columns(table_name)}
            if "document_invoice_number" not in columns:
                connection.execute(text(
                    f"ALTER TABLE {table_name} "
                    "ADD COLUMN document_invoice_number VARCHAR(50)"
                ))
        sequence_table.create(bind=connection, checkfirst=True)
        sequence_columns = {
            column["name"] for column in inspect(connection).get_columns(sequence_table.name)
        }
        if "last_number" not in sequence_columns:
            connection.execute(text(
                f"ALTER TABLE {sequence_table.name} ADD COLUMN last_number INTEGER NOT NULL DEFAULT 0"
            ))
