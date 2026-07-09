import React, { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { Search, Package, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RegularProduct, NonProduct } from "@shared/schema";

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
  products: externalProducts
}: ProductSearchProps) {
  const [searchTerm, setSearchTerm] = useState(value);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: fetchedProducts = { regularProducts: [], nonProducts: [] }, isLoading } = useQuery<{ regularProducts: RegularProduct[]; nonProducts: NonProduct[] }>({
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

  const allProducts: Product[] = externalProducts || [
    ...(fetchedProducts.regularProducts || []),
    ...(fetchedProducts.nonProducts || [])
  ];

  const filteredProducts = searchTerm.trim()
    ? allProducts.filter(p => {
        const term = searchTerm.toLowerCase();
        return (
          p.productCode?.toLowerCase().startsWith(term) ||
          p.description?.toLowerCase().startsWith(term) ||
          p.name?.toLowerCase().startsWith(term)
        );
      })
    : allProducts;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchTerm(newValue);
    setShowDropdown(true);
    setHighlightedIndex(-1);
    if (!newValue.trim()) {
      setSelectedProduct(null);
      onProductSelect(null);
    }
  };

  const handleProductSelect = (product: Product) => {
    setSelectedProduct(product);
    setSearchTerm(`${product.description}`);
    setShowDropdown(false);
    setHighlightedIndex(-1);
    onProductSelect(product);
  };

  const handleClear = () => {
    setSelectedProduct(null);
    setSearchTerm("");
    setShowDropdown(false);
    onProductSelect(null);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || filteredProducts.length === 0) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex(prev => (prev < filteredProducts.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : filteredProducts.length - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredProducts.length) {
          handleProductSelect(filteredProducts[highlightedIndex]);
        }
        break;
      case "Escape":
        setShowDropdown(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  const handleFocus = () => {
    if (searchTerm.trim() || filteredProducts.length > 0) {
      setShowDropdown(true);
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
      setShowDropdown(false);
      setHighlightedIndex(-1);
    }, 200);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (value !== searchTerm && !selectedProduct) {
      setSearchTerm(value);
    }
  }, [value]);

  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll('[data-index]');
      const item = items[highlightedIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  const sizeClasses = {
    sm: "h-8 text-sm",
    md: "h-10",
    lg: "h-12 text-lg"
  };

  const dropdownSizeClasses = {
    sm: "text-sm",
    md: "",
    lg: "text-lg"
  };

  return (
    <div className={cn("relative", className)}>
      {label && (
        <Label htmlFor="product-search" className="mb-2 block">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </Label>
      )}
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            ref={inputRef}
            id="product-search"
            type="text"
            placeholder={placeholder}
            value={searchTerm}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            disabled={disabled}
            autoFocus={autoFocus}
            autoComplete="off"
            className={cn(
              "pl-10",
              allowClear && selectedProduct && "pr-10",
              sizeClasses[size]
            )}
          />
          {allowClear && selectedProduct && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {showDropdown && (
          <div
            ref={dropdownRef}
            className={cn(
              "absolute z-50 w-full min-w-[300px] mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto",
              dropdownSizeClasses[size]
            )}
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-3">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span className="ml-2 text-gray-500">Loading...</span>
              </div>
            ) : filteredProducts.length > 0 ? (
              <div className="py-1">
                  {filteredProducts.map((product, index) => (
                  <div
                    key={product.id}
                    data-index={index}
                    className={cn(
                      "flex items-center px-3 py-2 cursor-pointer transition-colors",
                      highlightedIndex === index
                        ? "bg-blue-100 text-blue-900"
                        : "hover:bg-gray-50",
                      selectedProduct?.id === product.id && "bg-blue-50"
                    )}
                    onClick={() => handleProductSelect(product)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    <Package className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {showCode && (
                          <span className="font-mono text-xs text-gray-600 bg-gray-100 px-1 rounded flex-shrink-0">
                            {product.productCode}
                          </span>
                        )}
                        <span className="font-medium text-sm leading-tight truncate">
                          {product.description}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : searchTerm.trim() ? (
              <div className="flex items-center justify-center py-4 text-gray-500">
                <Package className="h-4 w-4 mr-2" />
                No products found
              </div>
            ) : (
              <div className="flex items-center justify-center py-4 text-gray-500">
                <Search className="h-4 w-4 mr-2" />
                Start typing to search products
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
