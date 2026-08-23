import React, { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EntityOptionRenderState {
  highlighted: boolean;
  selected: boolean;
  disabled: boolean;
}

export interface EntityComboboxProps<T> {
  value?: string;
  items: T[];
  isLoading?: boolean;
  onSelect: (item: T | null) => void;
  onSearchChange?: (value: string) => void;
  getKey: (item: T) => string | number;
  getInputValue: (item: T) => string;
  renderOption: (item: T, state: EntityOptionRenderState) => React.ReactNode;
  filterItems?: (items: T[], searchTerm: string) => T[];
  isOptionDisabled?: (item: T) => boolean;
  placeholder?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  allowClear?: boolean;
  autoFocus?: boolean;
  size?: "sm" | "md" | "lg";
  inputId?: string;
  loadingText?: string;
  noResultsText?: string;
  idleText?: string;
  icon?: React.ReactNode;
  dropdownClassName?: string;
  blurDelay?: number;
}

export default function EntityCombobox<T>({
  value = "",
  items,
  isLoading = false,
  onSelect,
  onSearchChange,
  getKey,
  getInputValue,
  renderOption,
  filterItems = (options, searchTerm) => {
    if (!searchTerm.trim()) return options;
    const term = searchTerm.toLowerCase();
    return options.filter((item) => getInputValue(item).toLowerCase().includes(term));
  },
  isOptionDisabled = () => false,
  placeholder = "Search...",
  label,
  className,
  disabled = false,
  required = false,
  allowClear = true,
  autoFocus = false,
  size = "md",
  inputId = "entity-search",
  loadingText = "Searching...",
  noResultsText = "No results found",
  idleText = "Start typing to search",
  icon = <Search className="h-4 w-4 text-gray-400" />,
  dropdownClassName,
  blurDelay = 200,
}: EntityComboboxProps<T>) {
  const [searchTerm, setSearchTerm] = useState(value);
  const [selectedItem, setSelectedItem] = useState<T | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const lastExternalValueRef = useRef(value);

  const filteredItems = useMemo(
    () => filterItems(items, searchTerm),
    [filterItems, items, searchTerm],
  );

  const sizeClasses = {
    sm: "h-8 text-sm",
    md: "h-10",
    lg: "h-12 text-lg",
  };

  const dropdownSizeClasses = {
    sm: "text-sm",
    md: "",
    lg: "text-lg",
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    setSearchTerm(nextValue);
    onSearchChange?.(nextValue);
    setShowDropdown(true);
    setHighlightedIndex(-1);

    if (!nextValue.trim()) {
      setSelectedItem(null);
      onSelect(null);
    }
  };

  const handleSelect = (item: T) => {
    if (isOptionDisabled(item)) return;
    setSelectedItem(item);
    setSearchTerm(getInputValue(item));
    setShowDropdown(false);
    setHighlightedIndex(-1);
    onSelect(item);
  };

  const handleClear = () => {
    setSelectedItem(null);
    setSearchTerm("");
    onSearchChange?.("");
    setShowDropdown(false);
    setHighlightedIndex(-1);
    onSelect(null);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || filteredItems.length === 0) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setHighlightedIndex((previous) =>
          previous < filteredItems.length - 1 ? previous + 1 : 0,
        );
        break;
      case "ArrowUp":
        event.preventDefault();
        setHighlightedIndex((previous) =>
          previous > 0 ? previous - 1 : filteredItems.length - 1,
        );
        break;
      case "Enter":
        event.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredItems.length) {
          handleSelect(filteredItems[highlightedIndex]);
        }
        break;
      case "Escape":
        setShowDropdown(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  const handleFocus = () => {
    if (searchTerm.trim() || filteredItems.length > 0) {
      setShowDropdown(true);
    }
  };

  const handleBlur = () => {
    window.setTimeout(() => {
      setShowDropdown(false);
      setHighlightedIndex(-1);
    }, blurDelay);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        inputRef.current &&
        !inputRef.current.contains(target)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (value !== lastExternalValueRef.current) {
      lastExternalValueRef.current = value;
      if (!selectedItem) {
        setSearchTerm(value);
      }
    }
  }, [selectedItem, value]);

  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownRef.current) {
      const option = dropdownRef.current.querySelectorAll("[data-index]")[highlightedIndex] as
        | HTMLElement
        | undefined;
      option?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex]);

  return (
    <div className={cn("relative", className)}>
      {label && (
        <Label htmlFor={inputId} className="mb-2 block">
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </Label>
      )}

      <div className="relative">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2">
            {icon}
          </span>
          <Input
            ref={inputRef}
            id={inputId}
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
            className={cn("pl-10", allowClear && selectedItem && "pr-10", sizeClasses[size])}
          />
          {allowClear && selectedItem && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-3 top-1/2 z-10 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {showDropdown && (
          <div
            ref={dropdownRef}
            className={cn(
              "absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg",
              dropdownSizeClasses[size],
              dropdownClassName,
            )}
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-3">
                <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-blue-600" />
                <span className="ml-2 text-gray-500">{loadingText}</span>
              </div>
            ) : filteredItems.length > 0 ? (
              <div className="py-1">
                {filteredItems.map((item, index) => {
                  const disabledOption = isOptionDisabled(item);
                  return (
                    <div
                      key={getKey(item)}
                      data-index={index}
                      aria-disabled={disabledOption}
                      className={cn(
                        "flex items-center px-3 py-2 transition-colors",
                        disabledOption
                          ? "cursor-not-allowed opacity-50"
                          : "cursor-pointer",
                        highlightedIndex === index && !disabledOption
                          ? "bg-blue-100 text-blue-900"
                          : !disabledOption && "hover:bg-gray-50",
                        selectedItem && getKey(selectedItem) === getKey(item) && "bg-blue-50",
                      )}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                    >
                      {renderOption(item, {
                        highlighted: highlightedIndex === index,
                        selected: selectedItem != null && getKey(selectedItem) === getKey(item),
                        disabled: disabledOption,
                      })}
                    </div>
                  );
                })}
              </div>
            ) : searchTerm.trim() ? (
              <div className="flex items-center justify-center py-4 text-gray-500">
                {icon}
                <span className="ml-2">{noResultsText}</span>
              </div>
            ) : (
              <div className="flex items-center justify-center py-4 text-gray-500">
                {icon}
                <span className="ml-2">{idleText}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
