import React, { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { Search, Building2, X } from "lucide-react";
import { cn } from "@/lib/utils";

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
  size = "md"
}: SupplierSearchProps) {
  const [searchTerm, setSearchTerm] = useState(value);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch suppliers with search
  const { data: suppliers = [], isLoading } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers", searchTerm],
    queryFn: async () => {
      setIsSearching(true);
      try {
        const params = new URLSearchParams();
        if (searchTerm.trim()) {
          params.append("search", searchTerm.trim());
        }
        const data = await apiRequest("GET", `/api/suppliers?${params.toString()}`);
        return data || [];
      } finally {
        setIsSearching(false);
      }
    },
    staleTime: 30000, // Cache for 30 seconds
    enabled: true,
  });

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchTerm(newValue);
    setShowDropdown(true);
    setHighlightedIndex(-1);
    
    // Clear selection if input is cleared
    if (!newValue.trim()) {
      setSelectedSupplier(null);
      onSupplierSelect(null);
    }
  };

  // Handle supplier selection
  const handleSupplierSelect = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setSearchTerm(showCode ? `${supplier.supplier_code} - ${supplier.supplier_name}` : supplier.supplier_name);
    setShowDropdown(false);
    setHighlightedIndex(-1);
    onSupplierSelect(supplier);
  };

  // Handle clear selection
  const handleClear = () => {
    setSelectedSupplier(null);
    setSearchTerm("");
    setShowDropdown(false);
    onSupplierSelect(null);
    inputRef.current?.focus();
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || suppliers.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex(prev => (prev < suppliers.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : suppliers.length - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < suppliers.length) {
          handleSupplierSelect(suppliers[highlightedIndex]);
        }
        break;
      case "Escape":
        setShowDropdown(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  // Handle focus
  const handleFocus = () => {
    if (searchTerm.trim() || suppliers.length > 0) {
      setShowDropdown(true);
    }
  };

  // Handle blur with delay to allow clicks
  const handleBlur = () => {
    setTimeout(() => {
      setShowDropdown(false);
      setHighlightedIndex(-1);
    }, 200); // Increased delay to allow mouse clicks
  };

  // Click outside to close dropdown
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

  // Update search term when value prop changes
  useEffect(() => {
    if (value !== searchTerm) {
      setSearchTerm(value);
    }
  }, [value]);

  // Size classes
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
        <Label htmlFor="supplier-search" className="mb-2 block">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </Label>
      )}
      
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            ref={inputRef}
            id="supplier-search"
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
              allowClear && selectedSupplier && "pr-10",
              sizeClasses[size]
            )}
          />
          
          {allowClear && selectedSupplier && (
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

        {/* Dropdown */}
        {showDropdown && (
          <div
            ref={dropdownRef}
            className={cn(
              "absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto",
              dropdownSizeClasses[size]
            )}
          >
            {isSearching || isLoading ? (
              <div className="flex items-center justify-center py-3">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span className="ml-2 text-gray-500">Searching...</span>
              </div>
            ) : suppliers.length > 0 ? (
              <div className="py-1">
                {suppliers.map((supplier, index) => (
                  <div
                    key={supplier.id}
                    className={cn(
                      "flex items-center px-3 py-2 cursor-pointer transition-colors",
                      highlightedIndex === index
                        ? "bg-blue-100 text-blue-900"
                        : "hover:bg-gray-50",
                      selectedSupplier?.id === supplier.id && "bg-blue-50"
                    )}
                    onClick={() => handleSupplierSelect(supplier)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    <Building2 className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {showCode && (
                          <span className="font-mono text-xs text-gray-600 bg-gray-100 px-1 rounded">
                            {supplier.supplier_code}
                          </span>
                        )}
                        <span className="font-medium truncate">
                          {supplier.supplier_name}
                        </span>
                      </div>
                      {supplier.address && (
                        <div className="text-xs text-gray-500 truncate mt-1">
                          {supplier.address}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : searchTerm.trim() ? (
              <div className="flex items-center justify-center py-4 text-gray-500">
                <Building2 className="h-4 w-4 mr-2" />
                No suppliers found
              </div>
            ) : (
              <div className="flex items-center justify-center py-4 text-gray-500">
                <Search className="h-4 w-4 mr-2" />
                Start typing to search suppliers
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
