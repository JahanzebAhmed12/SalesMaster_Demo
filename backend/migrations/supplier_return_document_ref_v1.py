"""Add document_ref_number to supplier_return for multi-line return grouping."""

from sqlalchemy import inspect, text


REVISION = "supplier_return_document_ref_v1"


def upgrade(engine):
    with engine.begin() as connection:
        if not inspect(connection).has_table("supplier_return"):
            return
        columns = {
            column["name"]
            for column in inspect(connection).get_columns("supplier_return")
        }
        if "document_ref_number" not in columns:
            connection.execute(text(
                "ALTER TABLE supplier_return ADD COLUMN document_ref_number VARCHAR(50)"
            ))
        connection.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_supplier_return_document_ref_number "
            "ON supplier_return (document_ref_number)"
        ))
