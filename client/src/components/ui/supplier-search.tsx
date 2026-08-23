import React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Building2 } from "lucide-react";
import EntityCombobox from "@/components/ui/entity-combobox";

interface Supplier {
  id: number;
  supplier_code: string;
  supplier_name: string;
  address?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
}

interface SupplierSearchProps {
  value?: string;
  onSupplierSelect: (supplier: Supplier | null) => void;
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

export default function SupplierSearch({
  value = "",
  onSupplierSelect,
  placeholder = "Search supplier by code or name...",
  label,
  className,
  disabled = false,
  required = false,
  showCode = true,
  allowClear = true,
  autoFocus = false,
  size = "md",
}: SupplierSearchProps) {
  const [searchTerm, setSearchTerm] = React.useState(value);
  const { data: suppliers = [], isLoading } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers", searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm.trim()) {
        params.append("search", searchTerm.trim());
      }
      const data = await apiRequest("GET", `/api/suppliers?${params.toString()}`);
      return data || [];
    },
  });

  return (
    <EntityCombobox<Supplier>
      value={value}
      items={suppliers}
      isLoading={isLoading}
      onSelect={onSupplierSelect}
      onSearchChange={setSearchTerm}
      getKey={(supplier) => supplier.id}
      getInputValue={(supplier) =>
        showCode
          ? `${supplier.supplier_code} - ${supplier.supplier_name}`
          : supplier.supplier_name
      }
      filterItems={(items) => items}
      renderOption={(supplier) => (
        <>
          <Building2 className="mr-2 h-4 w-4 flex-shrink-0 text-gray-400" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
              {showCode && (
                <span className="flex-shrink-0 rounded bg-gray-100 px-1 font-mono text-xs text-gray-600">
                  {supplier.supplier_code}
                </span>
              )}
              <span className="text-sm font-medium leading-tight">{supplier.supplier_name}</span>
            </div>
            {supplier.address && (
              <div className="mt-1 text-xs leading-tight text-gray-500">{supplier.address}</div>
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
      inputId="supplier-search"
      loadingText="Searching..."
      noResultsText="No suppliers found"
      idleText="Start typing to search suppliers"
      icon={<Building2 className="h-4 w-4 text-gray-400" />}
      dropdownClassName="min-w-[300px]"
    />
  );
}
