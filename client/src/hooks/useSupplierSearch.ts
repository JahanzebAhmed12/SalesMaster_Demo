import { useState } from "react";

interface Supplier {
  id: number;
  supplier_code: string;
  supplier_name: string;
  address?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
}

export function useSupplierSearch() {
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierId, setSupplierId] = useState<number | null>(null);

  const handleSupplierSelect = (supplier: Supplier | null) => {
    setSelectedSupplier(supplier);
    setSupplierId(supplier?.id || null);
  };

  return {
    selectedSupplier,
    supplierId,
    handleSupplierSelect,
  };
}
