import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import PageLayout from "@/components/common/page-layout";
import { Plus, MoreHorizontal, ChevronDown, ChevronUp } from "lucide-react";
import { useLocation } from "wouter";
import type { Customer } from "@shared/schema";
import React from "react";

const salesSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  vehicleDetails: z.string().optional(),
  gateNumber: z.string().optional(),
});

type SalesFormData = z.infer<typeof salesSchema>;

function debounce<T extends (...args: any[]) => void>(func: T, wait: number) {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export default function SalesEntry() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [showMoreFields, setShowMoreFields] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerOptions, setCustomerOptions] = useState<Customer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const form = useForm<SalesFormData>({
    resolver: zodResolver(salesSchema),
    defaultValues: {
      customerId: "",
      vehicleDetails: "",
      gateNumber: "",
    },
  });

  // Debounced fetch for customers
  const fetchCustomers = debounce(async (search: string) => {
    setIsSearching(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      const data = await apiRequest("GET", `/api/customers?${params.toString()}`);
      setCustomerOptions(data || []);
    } catch (e) {
      setCustomerOptions([]);
    }
    setIsSearching(false);
  }, 300);

  useEffect(() => {
    fetchCustomers(customerSearch);
    setShowDropdown(!!customerSearch);
    setHighlightedIndex(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerSearch]);

  // Initial fetch
  useEffect(() => {
    fetchCustomers("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || customerOptions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < customerOptions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : customerOptions.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < customerOptions.length) {
        const customer = customerOptions[highlightedIndex];
        form.setValue("customerId", customer.id.toString());
        setCustomerSearch(`${customer.customer_code} - ${customer.customer_name}`);
        setShowDropdown(false);
      }
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  // Close dropdown on blur (with delay to allow click)
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setTimeout(() => setShowDropdown(false), 100);
  };

  const onSubmit = (data: SalesFormData) => {
    const queryParams = new URLSearchParams();
    queryParams.append("customerId", data.customerId);
    if (data.vehicleDetails) queryParams.append("vehicleDetails", data.vehicleDetails);
    if (data.gateNumber) queryParams.append("gateNumber", data.gateNumber);
    setLocation(`/data-entry/sales-invoice?${queryParams.toString()}`);
  };

  return (
    <PageLayout title="Sales Entry" breadcrumb="Sales Entry">
      <div className="space-y-6">
        {/* Form Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus size={20} />
              New Sale Entry
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="customerId">Customer</Label>
                  <div className="relative">
                    <Input
                      id="customerId"
                      ref={inputRef}
                      placeholder="Type customer code or name..."
                      value={customerSearch}
                      onChange={e => {
                        setCustomerSearch(e.target.value);
                        form.setValue("customerId", "");
                        setShowDropdown(true);
                      }}
                      onFocus={() => setShowDropdown(!!customerSearch)}
                      onBlur={handleBlur}
                      onKeyDown={handleKeyDown}
                      autoComplete="off"
                      className="pr-10"
                    />
                    {showDropdown && (
                      <div ref={dropdownRef} className="absolute z-10 bg-white border rounded w-full mt-1 max-h-48 overflow-y-auto shadow">
                        {isSearching ? (
                          <div className="p-2 text-gray-500">Searching...</div>
                        ) : customerOptions.length > 0 ? (
                          customerOptions.map((customer, idx) => (
                            <div
                              key={customer.id}
                              className={`p-2 cursor-pointer flex items-center ${highlightedIndex === idx ? "bg-blue-100" : form.watch("customerId") === customer.id.toString() ? "bg-blue-50" : ""}`}
                              onMouseDown={() => {
                                form.setValue("customerId", customer.id.toString());
                                setCustomerSearch(`${customer.customer_code} - ${customer.customer_name}`);
                                setShowDropdown(false);
                              }}
                              onMouseEnter={() => setHighlightedIndex(idx)}
                            >
                              <span className="font-mono text-xs text-gray-600">{customer.customer_code}</span>
                              <span className="ml-2">{customer.customer_name}</span>
                            </div>
                          ))
                        ) : (
                          <div className="p-2 text-gray-500">No customers found</div>
                        )}
                      </div>
                    )}
                  </div>
                  {form.formState.errors.customerId && (
                    <p className="text-sm text-red-500 mt-1">
                      {form.formState.errors.customerId.message}
                    </p>
                  )}
                </div>
                <div></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div></div> {/* Empty div to align layout */}
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowMoreFields(!showMoreFields)}
                    className="flex items-center gap-2"
                  >
                    <MoreHorizontal size={16} />
                    More
                    {showMoreFields ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </Button>
                </div>
              </div>
              {showMoreFields && (
                <div className="border-t pt-4 mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="vehicleDetails">Vehicle Details</Label>
                      <Input
                        id="vehicleDetails"
                        {...form.register("vehicleDetails")}
                        placeholder="Enter vehicle details"
                      />
                    </div>
                    <div>
                      <Label htmlFor="gateNumber">Gate Number</Label>
                      <Input
                        id="gateNumber"
                        {...form.register("gateNumber")}
                        placeholder="Enter gate number"
                      />
                    </div>
                  </div>
                </div>
              )}
              <Button 
                type="submit" 
                className="w-full md:w-auto"
              >
                Create Sale Entry
              </Button>
            </form>
          </CardContent>
        </Card>
        {/* Sales List is removed from here as per the new workflow */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">Sales data will be displayed on the Sales Invoice page after creation.</div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
