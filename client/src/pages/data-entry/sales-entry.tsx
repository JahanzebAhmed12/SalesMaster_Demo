import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import PageLayout from "@/components/common/page-layout";
import BusinessDateDisplay from "@/components/common/business-date-display";
import CustomerSearch from "@/components/ui/customer-search";
import { useCustomerSearch } from "@/hooks/useCustomerSearch";
import { Plus, Clock, Trash2 } from "lucide-react";
import { useLocation } from "wouter";
import type { Customer } from "@shared/schema";
import React from "react";

const salesSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
});

type SalesFormData = z.infer<typeof salesSchema>;

interface HeldInvoice {
  holdId: string;
  customerId: string;
  notes: string;
  saleItems: any[];
  holdTime: string;
}

export default function SalesEntry() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { selectedCustomer, handleCustomerSelect, customerId, customerOthers } = useCustomerSearch();
  const [heldInvoices, setHeldInvoices] = useState<HeldInvoice[]>([]);
  const [showHeldInvoices, setShowHeldInvoices] = useState(false);
  const [gateNumber, setGateNumber] = useState("");
  const [isGateNumberFromCustomer, setIsGateNumberFromCustomer] = useState(false);

  console.log(heldInvoices, "==============?")

  const form = useForm<SalesFormData>({
    resolver: zodResolver(salesSchema),
    defaultValues: {
      customerId: "",
    },
  });

  // Update form and gate number when customer changes
  useEffect(() => {
    if (selectedCustomer) {
      form.setValue("customerId", customerId);
      // Auto-populate gate number from customer's others field
      if (customerOthers) {
        setGateNumber(customerOthers);
        setIsGateNumberFromCustomer(true);
      } else {
        setGateNumber("");
        setIsGateNumberFromCustomer(false);
      }
    } else {
      form.setValue("customerId", "");
      setGateNumber("");
      setIsGateNumberFromCustomer(false);
    }
  }, [selectedCustomer, customerId, customerOthers, form]);

  // Load held invoices from localStorage on mount
  useEffect(() => {
    const held = JSON.parse(localStorage.getItem('heldInvoices') || '[]') as HeldInvoice[];
    setHeldInvoices(held);
  }, []);

console.log(heldInvoices, "see held invoices")

  const handleGoToInvoice = (customerId: string, saleItems: any[]) => {
    // Save draft to localStorage
    localStorage.setItem('currentInvoiceDraft', JSON.stringify(saleItems));
    setLocation(`/data-entry/sales-invoice?customerId=${customerId}`);
  };

  const onSubmit = (data: SalesFormData) => {
    if (!selectedCustomer) {
      toast({
        title: "Error",
        description: "Please select a customer",
        variant: "destructive",
      });
      return;
    }

    const queryParams = new URLSearchParams();
    queryParams.append("customerId", data.customerId);
    if (gateNumber) queryParams.append("gateNumber", gateNumber);
    setLocation(`/data-entry/sales-invoice?${queryParams.toString()}`);
  };

  const handleResumeInvoice = (holdId: string) => {
    console.log(heldInvoices, "==============<")
    // Don't remove from held list here - let the sales invoice page handle it
    // Only pass heldInvoiceId in the URL
    setLocation(`/data-entry/sales-invoice?heldInvoiceId=${holdId}`);
  };

  const handleDeleteHeldInvoice = (holdId: string) => {
    const updated = heldInvoices.filter(inv => inv.holdId !== holdId);
    setHeldInvoices(updated);
    localStorage.setItem('heldInvoices', JSON.stringify(updated));
  };

  // Fetch customers (needed for customer name display in held invoices)
  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: () => apiRequest("GET", "/api/customers"),
  });

  // Helper function to get customer name by ID
  const getCustomerName = (customerId: string) => {
    const customer = customers?.find(c => c.id.toString() === customerId);
    return customer ? `${customer.customer_code} - ${customer.customer_name}` : customerId;
  };

  return (
    <PageLayout title="Sales Entry" breadcrumb="Sales Entry">
      <div className="space-y-6">
        {/* Header with Held Invoices Button */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Sales Entry</h1>
          {heldInvoices.length > 0 && (
            <Button
              onClick={() => setShowHeldInvoices(!showHeldInvoices)}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Clock size={16} />
              Held Invoices ({heldInvoices.length})
            </Button>
          )}
        </div>

        {/* Business Date Display */}
        <BusinessDateDisplay />

        {/* Held Invoices Section */}
        {showHeldInvoices && heldInvoices.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock size={20} />
                Held Invoices
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Held Time</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {heldInvoices.map((invoice) => (
                    <TableRow key={invoice.holdId}>
                      <TableCell>{getCustomerName(invoice.customerId)}</TableCell>
                      <TableCell>{invoice.saleItems.length} items</TableCell>
                      <TableCell>{new Date(invoice.holdTime).toLocaleString()}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          onClick={() => handleResumeInvoice(invoice.holdId)}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          Resume
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => handleDeleteHeldInvoice(invoice.holdId)} title="Delete Held Invoice">
                          <Trash2 size={16} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

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
                <CustomerSearch
                  label="Customer"
                  placeholder="Search customer by code or name..."
                  onCustomerSelect={handleCustomerSelect}
                  required
                  showCode
                  allowClear
                  autoFocus
                />
                <div>
                  <Label htmlFor="gateNumber">Others/Gate</Label>
                  <Input
                    id="gateNumber"
                    type="text"
                    placeholder={isGateNumberFromCustomer ? "Auto-filled from customer" : "Others/Gate (optional)"}
                    value={gateNumber}
                    onChange={e => setGateNumber(e.target.value)}
                    readOnly={isGateNumberFromCustomer}
                    className={isGateNumberFromCustomer ? "bg-gray-100 cursor-not-allowed" : ""}
                  />
                  {isGateNumberFromCustomer && (
                    <p className="text-xs text-gray-500 mt-1">
                      This field is auto-filled from customer database
                    </p>
                  )}
                </div>
              </div>
              <Button 
                type="submit" 
                className="w-full md:w-auto"
                disabled={!selectedCustomer}
              >
                Create Sale Entry
              </Button>
            </form>
          </CardContent>
        </Card>
        {/* Sales List is removed from here as per the new workflow */}

      </div>
    </PageLayout>
  );
}
