import { useState } from "react";
import type { Customer } from "@shared/schema";

export function useCustomerSearch(initialCustomer?: Customer | null) {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(initialCustomer || null);

  const handleCustomerSelect = (customer: Customer | null) => {
    setSelectedCustomer(customer);
  };

  const clearCustomer = () => {
    setSelectedCustomer(null);
  };

  return {
    selectedCustomer,
    handleCustomerSelect,
    clearCustomer,
    customerId: selectedCustomer?.id?.toString() || "",
    customerName: selectedCustomer?.customer_name || "",
    customerCode: selectedCustomer?.customer_code || "",
    customerAddress: selectedCustomer?.address || "",
    customerOthers: selectedCustomer?.others || "",
  };
}