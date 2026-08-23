import React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Package } from "lucide-react";
import type { RegularProduct, NonProduct } from "@shared/schema";
import EntityCombobox from "@/components/ui/entity-combobox";

type Product = RegularProduct | NonProduct;

interface ProductSearchProps {
  value?: string;
  onProductSelect: (product: Product | null) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  showCode?: boolean;
  allowClear?: boolean;
  autoFocus?: boolean;
  size?: "sm" | "md" | "lg";
  products?: Product[];
}

const getProductDescription = (product: Product): string =>
  product.description || product.name || "";

const getProductSearchText = (product: Product): string =>
  [product.productCode, product.description, product.name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

export default function ProductSearch({
  value = "",
  onProductSelect,
  placeholder = "Search product by code or name...",
  label,
  className,
  disabled = false,
  required = false,
  showCode = true,
  allowClear = true,
  autoFocus = false,
  size = "md",
  products: externalProducts,
}: ProductSearchProps) {
  const [searchTerm, setSearchTerm] = React.useState(value);
  const { data: fetchedProducts = { regularProducts: [], nonProducts: [] }, isLoading } =
    useQuery<{
      regularProducts: RegularProduct[];
      nonProducts: NonProduct[];
    }>({
      queryKey: ["products", searchTerm],
      queryFn: async () => {
        const params = new URLSearchParams();
        if (searchTerm.trim()) {
          params.append("search", searchTerm.trim());
        }
        return apiRequest("GET", `/api/products?${params.toString()}`);
      },
      staleTime: 30000,
      enabled: !externalProducts,
    });

  const products: Product[] = externalProducts || [
    ...(fetchedProducts.regularProducts || []),
    ...(fetchedProducts.nonProducts || []),
  ];

  return (
    <EntityCombobox<Product>
      value={value}
      items={products}
      isLoading={!externalProducts && isLoading}
      onSelect={onProductSelect}
      onSearchChange={setSearchTerm}
      getKey={(product) => product.id}
      getInputValue={getProductDescription}
      filterItems={(items, searchTerm) => {
        if (!searchTerm.trim()) return items;
        const term = searchTerm.toLowerCase();
        return items.filter((product) => getProductSearchText(product).includes(term));
      }}
      renderOption={(product) => (
        <>
          <Package className="mr-2 h-4 w-4 flex-shrink-0 text-gray-400" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {showCode && (
                <span className="flex-shrink-0 rounded bg-gray-100 px-1 font-mono text-xs text-gray-600">
                  {product.productCode}
                </span>
              )}
              <span className="truncate text-sm font-medium">{getProductDescription(product)}</span>
            </div>
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
      inputId="product-search"
      loadingText="Loading..."
      noResultsText="No products found"
      idleText="Start typing to search products"
      icon={<Package className="h-4 w-4 text-gray-400" />}
      dropdownClassName="min-w-[300px]"
    />
  );
}
