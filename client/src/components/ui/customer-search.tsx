import React, { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { Search, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Customer } from "@shared/schema";

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

function debounce<T extends (...args: any[]) => void>(func: T, wait: number) {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
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
  size = "md"
}: CustomerSearchProps) {
  const [searchTerm, setSearchTerm] = useState(value);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch customers with search
  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers", searchTerm],
    queryFn: async () => {
      setIsSearching(true);
      try {
        const params = new URLSearchParams();
        if (searchTerm.trim()) {
          params.append("search", searchTerm.trim());
        }
        const data = await apiRequest("GET", `/api/customers?${params.toString()}`);
        return data || [];
      } finally {
        setIsSearching(false);
      }
    },
    staleTime: 30000, // Cache for 30 seconds
    enabled: true,
  });

  // Debounced search to avoid too many API calls
  const debouncedSetSearchTerm = debounce((term: string) => {
    setSearchTerm(term);
  }, 300);

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchTerm(newValue);
    debouncedSetSearchTerm(newValue);
    setShowDropdown(true);
    setHighlightedIndex(-1);
    
    // Clear selection if input is cleared
    if (!newValue.trim()) {
      setSelectedCustomer(null);
      onCustomerSelect(null);
    }
  };

  // Handle customer selection
  const handleCustomerSelect = (customer: Customer) => {
    setSelectedCustomer(customer);
    setSearchTerm(showCode ? `${customer.customer_code} - ${customer.customer_name}` : customer.customer_name);
    setShowDropdown(false);
    setHighlightedIndex(-1);
    onCustomerSelect(customer);
  };

  // Handle clear selection
  const handleClear = () => {
    setSelectedCustomer(null);
    setSearchTerm("");
    setShowDropdown(false);
    onCustomerSelect(null);
    inputRef.current?.focus();
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || customers.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex(prev => (prev < customers.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : customers.length - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < customers.length) {
          handleCustomerSelect(customers[highlightedIndex]);
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
    if (searchTerm.trim() || customers.length > 0) {
      setShowDropdown(true);
    }
  };

  // Handle blur with delay to allow clicks
  const handleBlur = () => {
    setTimeout(() => {
      setShowDropdown(false);
      setHighlightedIndex(-1);
    }, 150);
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
        <Label htmlFor="customer-search" className="mb-2 block">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </Label>
      )}
      
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            ref={inputRef}
            id="customer-search"
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
              allowClear && selectedCustomer && "pr-10",
              sizeClasses[size]
            )}
          />
          
          {allowClear && selectedCustomer && (
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
            ) : customers.length > 0 ? (
              <div className="py-1">
                {customers.map((customer, index) => (
                  <div
                    key={customer.id}
                    className={cn(
                      "flex items-center px-3 py-2 cursor-pointer transition-colors",
                      highlightedIndex === index
                        ? "bg-blue-100 text-blue-900"
                        : "hover:bg-gray-50",
                      selectedCustomer?.id === customer.id && "bg-blue-50"
                    )}
                    onClick={() => handleCustomerSelect(customer)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    <User className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {showCode && (
                          <span className="font-mono text-xs text-gray-600 bg-gray-100 px-1 rounded">
                            {customer.customer_code}
                          </span>
                        )}
                        <span className="font-medium truncate">
                          {customer.customer_name}
                        </span>
                      </div>
                      {customer.address && (
                        <div className="text-xs text-gray-500 truncate mt-1">
                          {customer.address}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : searchTerm.trim() ? (
              <div className="flex items-center justify-center py-4 text-gray-500">
                <User className="h-4 w-4 mr-2" />
                No customers found
              </div>
            ) : (
              <div className="flex items-center justify-center py-4 text-gray-500">
                <Search className="h-4 w-4 mr-2" />
                Start typing to search customers
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selected customer info */}
      {selectedCustomer && (
        <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-blue-600" />
              <span className="font-medium text-blue-900">
                {selectedCustomer.customer_name}
              </span>
              {showCode && (
                <span className="font-mono text-xs text-blue-600 bg-blue-100 px-1 rounded">
                  {selectedCustomer.customer_code}
                </span>
              )}
            </div>
            {allowClear && (
              <button
                type="button"
                onClick={handleClear}
                className="text-blue-600 hover:text-blue-800"
                title="Clear selection"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {selectedCustomer.address && (
            <div className="text-blue-700 mt-1 text-xs">
              {selectedCustomer.address}
            </div>
          )}
        </div>
      )}
    </div>
  );
}