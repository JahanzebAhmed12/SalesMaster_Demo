import React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Search, User } from "lucide-react";
import type { Customer } from "@shared/schema";
import EntityCombobox from "@/components/ui/entity-combobox";

interface CustomerSearchProps {
  value?: string;
  onCustomerSelect: (customer: Customer | null) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  showCode?: boolean;
  allowClear?: boolean;
  autoFocus?: boolean;
  size?: "sm" | "md" | "lg";
}

export default function CustomerSearch({
  value = "",
  onCustomerSelect,
  placeholder = "Search customer by code or name...",
  label,
  className,
  disabled = false,
  required = false,
  showCode = true,
  allowClear = true,
  autoFocus = false,
  size = "md",
}: CustomerSearchProps) {
  const [searchTerm, setSearchTerm] = React.useState(value);
  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers", searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm.trim()) {
        params.append("search", searchTerm.trim());
      }
      const data = await apiRequest("GET", `/api/customers?${params.toString()}`);
      return data || [];
    },
    staleTime: 30000,
  });

  return (
    <EntityCombobox<Customer>
      value={value}
      items={customers}
      isLoading={isLoading}
      onSelect={onCustomerSelect}
      onSearchChange={setSearchTerm}
      getKey={(customer) => customer.id}
      getInputValue={(customer) =>
        showCode
          ? `${customer.customer_code} - ${customer.customer_name}`
          : customer.customer_name
      }
      filterItems={(items) => items}
      renderOption={(customer) => (
        <>
          <User className="mr-2 h-4 w-4 flex-shrink-0 text-gray-400" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {showCode && (
                <span className="rounded bg-gray-100 px-1 font-mono text-xs text-gray-600">
                  {customer.customer_code}
                </span>
              )}
              <span className="truncate font-medium">{customer.customer_name}</span>
            </div>
            {customer.address && (
              <div className="mt-1 truncate text-xs text-gray-500">{customer.address}</div>
            )}
          </div>
        </>
      )}
      placeholder={placeholder}
      label={label}
      className={className}
      disabled={disabled}
      required={required}
      allowClear={allowClear}
      autoFocus={autoFocus}
      size={size}
      inputId="customer-search"
      loadingText="Searching..."
      noResultsText="No customers found"
      idleText="Start typing to search customers"
      icon={<Search className="h-4 w-4 text-gray-400" />}
    />
  );
}
