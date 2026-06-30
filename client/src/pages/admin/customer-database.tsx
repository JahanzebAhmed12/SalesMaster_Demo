import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Eye, Edit, Trash2, Download, FileText, Printer, ChevronUp, ChevronDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAdminCrossTabSync } from "@/hooks/useAdminCrossTabSync";
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Helper function to format multiple emails for display
const formatEmails = (emailString: string) => {
  if (!emailString) return "-";
  const emails = emailString.split(',').map(email => email.trim()).filter(email => email);
  if (emails.length <= 2) {
    return emails.join(', ');
  }
  return `${emails[0]}, ${emails[1]} (+${emails.length - 2} more)`;
};

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
  runningBalance?: number;
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
  const [sortField, setSortField] = useState<"customer_code" | "customer_name" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { broadcastCustomerOperation } = useAdminCrossTabSync();

  const { data: customers = [], isLoading, error } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/customers");
      console.log("API Response:", response);
      return response as Customer[];
    },
  });

  console.log("Customers data:", customers);

  const filteredCustomers = React.useMemo(() => {
    let filtered = customers.filter((customer) => {
      if (!customer?.customer_name || !customer?.customer_code) return false;
      return (
        customer.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.customer_code.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });

    if (sortField) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = (a[sortField] || '').toLowerCase();
        const bVal = (b[sortField] || '').toLowerCase();
        const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
        return sortDirection === 'asc' ? cmp : -cmp;
      });
    }

    return filtered;
  }, [customers, searchTerm, sortField, sortDirection]);

  const paginatedCustomers = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCustomers.slice(start, start + pageSize);
  }, [filteredCustomers, currentPage, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));

  const handleSort = (field: "customer_code" | "customer_name") => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <ChevronUp className="inline h-4 w-4 ml-1" /> : <ChevronDown className="inline h-4 w-4 ml-1" />;
  };

  const deleteCustomerMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/customers/${id}`);
    },
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      broadcastCustomerOperation("DELETED", { id: deletedId });
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

  const handleExport = async (format: string) => {
    if (format === "all") {
      toast({
        title: "Info",
        description: "All customers are already displayed in the table."
      });
      return;
    }

    if (filteredCustomers.length === 0) {
      toast({
        variant: "destructive",
        title: "No Data",
        description: "No customers found to export."
      });
      return;
    }

    try {
      const exportData = filteredCustomers.map((customer, index) => ({
        'Sl.No': index + 1,
        'Customer Code': customer.customer_code,
        'Customer Name': customer.customer_name,
        'City': customer.customer_city || '',
        'Country': customer.customer_country || '',
        'Currency': customer.customer_currency,
        'Running Balance': `£${(customer.runningBalance || 0).toFixed(2)}`,
        'Email': customer.email || '',
        'Telephone': customer.telephone || '',
        'Status': customer.is_active === "yes" ? "Active" : "Inactive"
      }));

      switch (format) {
        case "excel":
          await handleExcelExport(exportData);
          break;
        case "pdf":
          await handlePDFExport(exportData);
          break;
        case "print":
          handlePrint();
          break;
        default:
          console.log(`Unknown format: ${format}`);
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: "An unexpected error occurred during export."
      });
    }
  };

  const handleExcelExport = async (data: any[]) => {
    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);

      const colWidths = Object.keys(data[0] || {}).map(key => ({
        wch: Math.max(key.length, ...data.map(row => String(row[key] || '').length))
      }));
      ws['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, 'Customers');
      
      const fileName = `Customer_Database_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      toast({
        title: "Success",
        description: "Customer data exported to Excel successfully."
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: "Failed to export to Excel. Please try again."
      });
    }
  };

  const handlePDFExport = async (data: any[]) => {
    try {
      const doc = new jsPDF('l', 'mm', 'a4');
      
      doc.setFontSize(16);
      doc.text('Customer Database', 14, 15);
      
      doc.setFontSize(10);
      doc.text('TROPIFRUIT UK LTD', 14, 25);
      doc.text('3 Dolphin Way, Purfleet, RM19 1NZ', 14, 30);
      doc.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 14, 35);

      const tableData = data.map(row => [
        row['Sl.No'],
        row['Customer Code'],
        row['Customer Name'],
        row['City'],
        row['Country'],
        row['Currency'],
        row['Running Balance'],
        row['Email'],
        row['Telephone'],
        row['Status']
      ]);

      autoTable(doc, {
        head: [['#', 'Code', 'Name', 'City', 'Country', 'Currency', 'Balance', 'Email', 'Phone', 'Status']],
        body: tableData,
        startY: 45,
        styles: { fontSize: 8 },
        headStyles: {
          fillColor: [66, 139, 202],
          textColor: 255,
          fontStyle: 'bold'
        },
        columnStyles: {
          0: { cellWidth: 15 },
          1: { cellWidth: 25 },
          2: { cellWidth: 40 },
          3: { cellWidth: 25 },
          4: { cellWidth: 25 },
          5: { cellWidth: 20 },
          6: { cellWidth: 25 },
          7: { cellWidth: 40 },
          8: { cellWidth: 30 },
          9: { cellWidth: 20 }
        }
      });

      const fileName = `Customer_Database_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      
      toast({
        title: "Success",
        description: "Customer data exported to PDF successfully."
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: "Failed to export to PDF. Please try again."
      });
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Customer Database</title>');
      printWindow.document.write('<style>');
      printWindow.document.write('body{font-family:Arial,sans-serif;margin:20px;}');
      printWindow.document.write('table{width:100%;border-collapse:collapse;margin-top:20px;}');
      printWindow.document.write('th,td{border:1px solid #ccc;padding:8px;text-align:left;font-size:12px;}');
      printWindow.document.write('th{background-color:#f0f0f0;font-weight:bold;}');
      printWindow.document.write('.header{text-align:center;margin-bottom:20px;}');
      printWindow.document.write('.company-info{margin-bottom:15px;}');
      printWindow.document.write('@media print { body { margin: 0; } }');
      printWindow.document.write('</style>');
      printWindow.document.write('</head><body>');

      printWindow.document.write('<div class="header">');
      printWindow.document.write('<h2>Customer Database</h2>');
      printWindow.document.write('</div>');

      printWindow.document.write('<div class="company-info">');
      printWindow.document.write('<strong>TROPIFRUIT UK LTD</strong><br>');
      printWindow.document.write('3 Dolphin Way, Purfleet, RM19 1NZ<br>');
      printWindow.document.write(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`);
      printWindow.document.write('</div>');

      printWindow.document.write('<table>');
      printWindow.document.write('<thead><tr>');
      printWindow.document.write('<th>#</th><th>Code</th><th>Name</th><th>City</th><th>Country</th><th>Currency</th><th>Balance</th><th>Email</th><th>Phone</th><th>Status</th>');
      printWindow.document.write('</tr></thead><tbody>');

      filteredCustomers.forEach((customer, index) => {
        printWindow.document.write('<tr>');
        printWindow.document.write(`<td>${index + 1}</td>`);
        printWindow.document.write(`<td>${customer.customer_code}</td>`);
        printWindow.document.write(`<td>${customer.customer_name}</td>`);
        printWindow.document.write(`<td>${customer.customer_city || '-'}</td>`);
        printWindow.document.write(`<td>${customer.customer_country || '-'}</td>`);
        printWindow.document.write(`<td>${customer.customer_currency}</td>`);
        printWindow.document.write(`<td>£${(customer.runningBalance || 0).toFixed(2)}</td>`);
        printWindow.document.write(`<td>${customer.email || '-'}</td>`);
        printWindow.document.write(`<td>${customer.telephone || '-'}</td>`);
        printWindow.document.write(`<td>${customer.is_active === "yes" ? "Active" : "Inactive"}</td>`);
        printWindow.document.write('</tr>');
      });

      printWindow.document.write('</tbody></table>');
      printWindow.document.write(`<div style="margin-top: 20px; font-size: 12px; color: #666;">Total Customers: ${filteredCustomers.length}</div>`);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
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
                <Eye className="h-4 w-4 mr-1" />
                Show All
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleExport("excel")}
                className="text-green-600 hover:text-green-700"
              >
                <Download className="h-4 w-4 mr-1" />
                Excel
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleExport("pdf")}
                className="text-red-600 hover:text-red-700"
              >
                <FileText className="h-4 w-4 mr-1" />
                PDF
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleExport("print")}
                className="text-blue-600 hover:text-blue-700"
              >
                <Printer className="h-4 w-4 mr-1" />
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
                        <th className="text-left p-3 border-r cursor-pointer select-none hover:bg-gray-200" onClick={() => handleSort("customer_code")}>
                          Customer Code <SortIcon field="customer_code" />
                        </th>
                        <th className="text-left p-3 border-r cursor-pointer select-none hover:bg-gray-200" onClick={() => handleSort("customer_name")}>
                          Customer Name <SortIcon field="customer_name" />
                        </th>
                        <th className="text-left p-3 border-r">City</th>
                        <th className="text-left p-3 border-r">Country</th>
                        <th className="text-left p-3 border-r">Currency</th>
                        <th className="text-left p-3 border-r">Running Balance</th>
                        <th className="text-left p-3 border-r">Email</th>
                        <th className="text-left p-3 border-r">Telephone</th>
                        <th className="text-left p-3 border-r">Edit</th>
                        <th className="text-left p-3 border-r">Delete</th>
                        <th className="text-left p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedCustomers.length === 0 ? (
                        <tr>
                          <td colSpan={12} className="p-6 text-center text-gray-500">No customers found.</td>
                        </tr>
                      ) : (
                        paginatedCustomers.map((customer, index) => (
                        <tr key={customer.id} className="border-b hover:bg-gray-50">
                          <td className="p-3 border-r">{(currentPage - 1) * pageSize + index + 1}</td>
                          <td className="p-3 border-r">{customer.customer_code}</td>
                          <td className="p-3 border-r">{customer.customer_name}</td>
                          <td className="p-3 border-r">{customer.customer_city || "-"}</td>
                          <td className="p-3 border-r">{customer.customer_country || "-"}</td>
                          <td className="p-3 border-r">{customer.customer_currency}</td>
                          <td className="p-3 border-r">£{(customer.runningBalance || 0).toFixed(2)}</td>
                          <td className="p-3 border-r" title={customer.email || ""}>
                            {formatEmails(customer.email || "")}
                          </td>
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
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="p-3 border-t flex items-center justify-between text-sm text-gray-500">
                  <div className="flex items-center gap-2">
                    <span>Show</span>
                    <select
                      className="border rounded px-2 py-1 text-sm"
                      value={pageSize}
                      onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                    <span>entries</span>
                  </div>
                  <div>
                    Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredCustomers.length)} of {filteredCustomers.length} entries
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
