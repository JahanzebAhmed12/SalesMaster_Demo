import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Eye, Edit, Trash2, Download, FileText, Printer } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';

interface Customer {
  id: number;
  customer_code: string;
  customer_name: string;
  customer_city?: string;
  customer_country?: string;
  customer_currency: string;
  email?: string;
  telephone?: string;
  is_active: "yes" | "no";
}

interface InsertCustomer {
  customerCode: string;
  customerName: string;
  customerCity?: string;
  customerCountry?: string;
  customerCurrency: string;
  email?: string;
  telephone?: string;
  isActive: "yes" | "no";
}

export default function Customers() {
  const [, setLocation] = useLocation();
  const [activeView, setActiveView] = useState<"view" | "add">("view");
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: customers = [], isLoading, error } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/customers");
      console.log("API Response:", response);
      return response as Customer[];
    },
  });

  console.log("Customers data:", customers);

  const filteredCustomers = customers.filter((customer) => {
    if (!customer?.customer_name || !customer?.customer_code) return false;
    return (
      customer.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.customer_code.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  console.log("Filtered customers:", filteredCustomers);

  const deleteCustomerMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/customers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: "Success",
        description: "Customer deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete customer",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (id: number) => {
    if (window.confirm("Are you sure you want to delete this customer?")) {
      deleteCustomerMutation.mutate(id);
    }
  };

  const handleEdit = (id: number) => {
    setLocation(`/admin/customer-database-edit/${id}`);
  };

  const handleExport = (format: string) => {
    if (format === "excel" && customers) {
      const csvContent = [
        ["Customer Code", "Customer Name", "City", "Country", "Currency", "Email", "Telephone", "Status"].join(","),
        ...customers.map((c) =>
          [
            c.customer_code,
            `"${c.customer_name}"`,
            c.customer_city || "",
            c.customer_country || "",
            c.customer_currency,
            c.email || "",
            c.telephone || "",
            c.is_active === "yes" ? "Active" : "Inactive",
          ].join(","),
        ),
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "customers.csv";
      link.click();
      window.URL.revokeObjectURL(url);
    } else if (format === "pdf" && customers) {
      const htmlContent = `
        <html>
          <head>
            <title>Customer Database</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              table { width: 100%; border-collapse: collapse; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f2f2f2; }
              h1 { color: #333; }
            </style>
          </head>
          <body>
            <h1>Customer Database</h1>
            <table>
              <thead>
                <tr>
                  <th>Customer Code</th>
                  <th>Customer Name</th>
                  <th>City</th>
                  <th>Country</th>
                  <th>Currency</th>
                  <th>Email</th>
                  <th>Telephone</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${customers
                  .map(
                    (c) => `
                  <tr>
                    <td>${c.customer_code}</td>
                    <td>${c.customer_name}</td>
                    <td>${c.customer_city || "-"}</td>
                    <td>${c.customer_country || "-"}</td>
                    <td>${c.customer_currency}</td>
                    <td>${c.email || "-"}</td>
                    <td>${c.telephone || "-"}</td>
                    <td>${c.is_active === "yes" ? "Active" : "Inactive"}</td>
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
          </body>
        </html>
      `;

      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.print();
      }
    } else if (format === "print" && customers) {
      const htmlContent = `
        <html>
          <head>
            <title>Customer Database</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              table { width: 100%; border-collapse: collapse; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f2f2f2; }
              h1 { color: #333; }
              @media print {
                body { margin: 0; }
              }
            </style>
          </head>
          <body>
            <h1>Customer Database</h1>
            <table>
              <thead>
                <tr>
                  <th>Customer Code</th>
                  <th>Customer Name</th>
                  <th>City</th>
                  <th>Country</th>
                  <th>Currency</th>
                  <th>Email</th>
                  <th>Telephone</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${customers
                  .map(
                    (c) => `
                  <tr>
                    <td>${c.customer_code}</td>
                    <td>${c.customer_name}</td>
                    <td>${c.customer_city || "-"}</td>
                    <td>${c.customer_country || "-"}</td>
                    <td>${c.customer_currency}</td>
                    <td>${c.email || "-"}</td>
                    <td>${c.telephone || "-"}</td>
                    <td>${c.is_active === "yes" ? "Active" : "Inactive"}</td>
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
          </body>
        </html>
      `;

      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.print();
      }
    }
  };

  const handleAddClick = () => {
    setLocation("/admin/customer-database-edit");
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-96">Loading customers...</div>;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96 text-red-500">
        Error loading customers: {error instanceof Error ? error.message : "Unknown error"}
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Customer Database</h1>
        <div className="text-sm text-gray-500">
          TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
        </div>
      </div>

      <div className="mb-6">
        <div className="flex gap-2 mb-4">
          <Button 
            variant={activeView === "view" ? "default" : "outline"}
            onClick={() => setActiveView("view")}
            className="flex items-center gap-2"
          >
            <Eye className="h-4 w-4" />
            View Customers
          </Button>
          <Button 
            variant="outline"
            onClick={handleAddClick}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Customers
          </Button>
        </div>

        {activeView === "view" && (
          <>
            <div className="flex gap-2 mb-4">
              <Button variant="outline" size="sm" onClick={() => handleExport("all")}>
                Show all rows
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExport("excel")}>
                Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExport("pdf")}>
                PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExport("print")}>
                Print
              </Button>
              <div className="ml-auto">
                <Input
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64"
                />
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left p-3 border-r">Sl.No</th>
                        <th className="text-left p-3 border-r">Customer Code</th>
                        <th className="text-left p-3 border-r">Customer Name</th>
                        <th className="text-left p-3 border-r">City</th>
                        <th className="text-left p-3 border-r">Country</th>
                        <th className="text-left p-3 border-r">Currency</th>
                        <th className="text-left p-3 border-r">Email</th>
                        <th className="text-left p-3 border-r">Telephone</th>
                        <th className="text-left p-3 border-r">Edit</th>
                        <th className="text-left p-3 border-r">Delete</th>
                        <th className="text-left p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCustomers.map((customer, index) => (
                        <tr key={customer.id} className="border-b hover:bg-gray-50">
                          <td className="p-3 border-r">{index + 1}</td>
                          <td className="p-3 border-r">{customer.customer_code}</td>
                          <td className="p-3 border-r">{customer.customer_name}</td>
                          <td className="p-3 border-r">{customer.customer_city || "-"}</td>
                          <td className="p-3 border-r">{customer.customer_country || "-"}</td>
                          <td className="p-3 border-r">{customer.customer_currency}</td>
                          <td className="p-3 border-r">{customer.email || "-"}</td>
                          <td className="p-3 border-r">{customer.telephone || "-"}</td>
                          <td className="p-3 border-r">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleEdit(customer.id)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </td>
                          <td className="p-3 border-r">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleDelete(customer.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                          <td className="p-3">
                            <Badge 
                              variant="secondary" 
                              className={customer.is_active === "yes" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}
                            >
                              {customer.is_active === "yes" ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-3 border-t text-sm text-gray-500">
                  Showing 1 to {filteredCustomers.length} of {filteredCustomers.length} entries
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
