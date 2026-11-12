"""Add document grouping and purchase-line tracking for supplier returns."""

from sqlalchemy import inspect, text


REVISION = "supplier_return_documents_v1"


def upgrade(engine):
    with engine.begin() as connection:
        inspector = inspect(connection)
        if not inspector.has_table("supplier_return"):
            return
        columns = {
            column["name"]
            for column in inspector.get_columns("supplier_return")
        }
        if "document_ref_number" not in columns:
            connection.execute(text(
                "ALTER TABLE supplier_return ADD COLUMN document_ref_number VARCHAR(50)"
            ))
        if "source_purchase_invoice_item_id" not in columns:
            connection.execute(text(
                "ALTER TABLE supplier_return ADD COLUMN source_purchase_invoice_item_id INTEGER"
            ))
        if "is_manual" not in columns:
            connection.execute(text(
                "ALTER TABLE supplier_return ADD COLUMN is_manual BOOLEAN NOT NULL DEFAULT 0"
            ))
        connection.execute(text(
            "UPDATE supplier_return "
            "SET document_ref_number = ref_number "
            "WHERE document_ref_number IS NULL"
        ))
        connection.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_supplier_return_document_ref_number "
            "ON supplier_return (document_ref_number)"
        ))
        connection.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_supplier_return_source_purchase_invoice_item_id "
            "ON supplier_return (source_purchase_invoice_item_id)"
        ))
