import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Edit, Trash2, Search, FileDown, Printer, Eye, Download, FileText, ChevronUp, ChevronDown } from "lucide-react";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { printHtmlTable } from "@/lib/export-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAdminCrossTabSync } from "@/hooks/useAdminCrossTabSync";
import type { Supplier } from "@shared/schema";

export default function Suppliers() {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<"supplier_code" | "supplier_name" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();
  const { broadcastSupplierOperation } = useAdminCrossTabSync();

  const { data: suppliers = [], isLoading, error } = useQuery<Supplier[]>({
    queryKey: ["suppliers", searchTerm],
    queryFn: async () => {
      try {
        const url = searchTerm 
          ? `/api/suppliers?search=${encodeURIComponent(searchTerm)}`
          : "/api/suppliers";
        return apiRequest("GET", url);
      } catch (error) {
        console.error('Error fetching suppliers:', error);
        throw error;
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 3
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/suppliers/${id}`);
    },
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      broadcastSupplierOperation("DELETED", { id: deletedId });
      toast({
        title: "Success",
        description: "Supplier deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete supplier",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (id: number, name: string) => {
    if (window.confirm(`Are you sure you want to delete supplier "${name}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  const sortedSuppliers = React.useMemo(() => {
    if (!sortField) return suppliers;
    return [...suppliers].sort((a, b) => {
      const aVal = (a[sortField] || '').toLowerCase();
      const bVal = (b[sortField] || '').toLowerCase();
      const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [suppliers, sortField, sortDirection]);

  const paginatedSuppliers = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedSuppliers.slice(start, start + pageSize);
  }, [sortedSuppliers, currentPage, pageSize]);

  const totalPages = Math.max(1, Math.ceil(sortedSuppliers.length / pageSize));

  const handleSort = (field: "supplier_code" | "supplier_name") => {
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

  const handleExport = async (format: string) => {
    if (format === "all") {
      toast({
        title: "Info",
        description: "All suppliers are already displayed in the table."
      });
      return;
    }

    if (sortedSuppliers.length === 0) {
      toast({
        variant: "destructive",
        title: "No Data",
        description: "No suppliers found to export."
      });
      return;
    }

    setIsExporting(true);

    try {
      const exportData = sortedSuppliers.map((supplier, index) => ({
        'Sl.No': index + 1,
        'Supplier Code': supplier.supplier_code,
        'Sage Code': supplier.sage_code || '',
        'Supplier Name': supplier.supplier_name,
        'Telephone': supplier.telephone || '',
        'Email': supplier.email || '',
        'EEC Group': supplier.eec_group || '',
        'Status': supplier.is_active === "Yes" ? "Active" : "Inactive"
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
        case "sage":
          await handleSageExport();
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
    } finally {
      setIsExporting(false);
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

      XLSX.utils.book_append_sheet(wb, ws, 'Suppliers');
      
      const fileName = `Suppliers_Database_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      toast({
        title: "Success",
        description: "Suppliers data exported to Excel successfully."
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
      doc.text('Suppliers Database', 14, 15);
      
      doc.setFontSize(10);
      doc.text('TROPIFRUIT UK LTD', 14, 25);
      doc.text('3 Dolphin Way, Purfleet, RM19 1NZ', 14, 30);
      doc.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 14, 35);

      const tableData = data.map(row => [
        row['Sl.No'],
        row['Supplier Code'],
        row['Sage Code'],
        row['Supplier Name'],
        row['Telephone'],
        row['Email'],
        row['EEC Group'],
        row['Status']
      ]);

      autoTable(doc, {
        head: [['#', 'Supplier Code', 'Sage Code', 'Supplier Name', 'Telephone', 'Email', 'EEC Group', 'Status']],
        body: tableData,
        startY: 45,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [240, 240, 240] },
        columnStyles: {
          0: { cellWidth: 15 },
          1: { cellWidth: 25 },
          2: { cellWidth: 25 },
          3: { cellWidth: 50 },
          4: { cellWidth: 30 },
          5: { cellWidth: 40 },
          6: { cellWidth: 25 },
          7: { cellWidth: 20 }
        }
      });

      const fileName = `Suppliers_Database_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      
      toast({
        title: "Success",
        description: "Suppliers data exported to PDF successfully."
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: "Failed to export to PDF. Please try again."
      });
    }
  };

  const handleSageExport = async () => {
    try {
      const sageData = sortedSuppliers.map(supplier => ({
        'Supplier Code': supplier.supplier_code,
        'Sage Code': supplier.sage_code || supplier.supplier_code,
        'Supplier Name': supplier.supplier_name,
        'Address': supplier.address || '',
        'Telephone': supplier.telephone || '',
        'Email': supplier.email || '',
        'VAT Number': supplier.vat_number || '',
        'Status': supplier.is_active === "Yes" ? "Active" : "Inactive"
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(sageData);
      XLSX.utils.book_append_sheet(wb, ws, 'Sage Export');
      
      const fileName = `Sage_Suppliers_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      toast({
        title: "Success",
        description: "Sage export completed successfully."
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: "Failed to export Sage data. Please try again."
      });
    }
  };

  const handlePrint = () => {
    let html = '';

    html += '<div class="header">';
    html += '<h2>Suppliers Database</h2>';
    html += '</div>';

    html += '<div class="company-info">';
    html += '<strong>TROPIFRUIT UK LTD</strong><br>';
    html += '3 Dolphin Way, Purfleet, RM19 1NZ<br>';
    html += `Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
    html += '</div>';

    html += '<table>';
    html += '<thead><tr>';
    html += '<th>#</th><th>Supplier Code</th><th>Sage Code</th><th>Supplier Name</th><th>Telephone</th><th>Email</th><th>EEC Group</th><th>Status</th>';
    html += '</tr></thead><tbody>';

    sortedSuppliers.forEach((supplier, index) => {
      html += '<tr>';
      html += `<td>${index + 1}</td>`;
      html += `<td>${supplier.supplier_code}</td>`;
      html += `<td>${supplier.sage_code || '-'}</td>`;
      html += `<td>${supplier.supplier_name}</td>`;
      html += `<td>${supplier.telephone || '-'}</td>`;
      html += `<td>${supplier.email || '-'}</td>`;
      html += `<td>${supplier.eec_group || '-'}</td>`;
      html += `<td>${supplier.is_active === "Yes" ? "Active" : "Inactive"}</td>`;
      html += '</tr>';
    });

    html += '</tbody></table>';
    html += `<div style="margin-top: 20px; font-size: 12px; color: #666;">Total Suppliers: ${sortedSuppliers.length}</div>`;
    printHtmlTable('Suppliers Database', html);
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="space-y-4">
          <div className="h-8 bg-gray-200 rounded animate-pulse" />
          <div className="h-64 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="shadow-sm border border-red-200">
          <CardContent className="p-6">
            <div className="text-red-600">
              <h3 className="text-lg font-medium">Error Loading Suppliers</h3>
              <p className="mt-2">Failed to load supplier data. Please try again later.</p>
              <Button 
                onClick={() => queryClient.invalidateQueries({ queryKey: ["suppliers"] })}
                className="mt-4"
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 bg-background-gray min-h-screen">
      <Card className="shadow-sm border border-gray-200 mb-6">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-gray-900">Supplier Database</h2>
          </div>
          
          <div className="flex items-center space-x-3 mb-4">
            <Button asChild className="bg-primary text-white hover:bg-secondary-blue">
              <Link href="/admin/supplier-database-edit">
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Link>
            </Button>
            <Button 
              onClick={() => handleExport('sage')}
              className="bg-primary text-white hover:bg-secondary-blue"
              disabled={isExporting}
            >
              <FileDown className="h-4 w-4 mr-2" />
              {isExporting ? 'Exporting...' : 'Sage Export'}
            </Button>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleExport('all')}
                disabled={isExporting}
              >
                <Eye className="h-4 w-4 mr-1" />
                Show All
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleExport('excel')}
                className="text-green-600 hover:text-green-700"
                disabled={isExporting}
              >
                <Download className="h-4 w-4 mr-1" />
                {isExporting ? 'Exporting...' : 'Excel'}
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleExport('pdf')}
                className="text-red-600 hover:text-red-700"
                disabled={isExporting}
              >
                <FileText className="h-4 w-4 mr-1" />
                {isExporting ? 'Generating...' : 'PDF'}
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleExport('print')}
                className="text-blue-600 hover:text-blue-700"
                disabled={isExporting}
              >
                <Printer className="h-4 w-4 mr-1" />
                Print
              </Button>
            </div>
            <div className="relative">
              <Input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64 pr-8"
              />
              <Search className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card className="shadow-sm border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead className="text-xs font-medium text-gray-500 uppercase">Sl.No</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 uppercase cursor-pointer select-none hover:bg-gray-100" onClick={() => handleSort("supplier_code")}>
                Supplier Code <SortIcon field="supplier_code" />
              </TableHead>
              <TableHead className="text-xs font-medium text-gray-500 uppercase">Sage Code</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 uppercase cursor-pointer select-none hover:bg-gray-100" onClick={() => handleSort("supplier_name")}>
                Supplier Name <SortIcon field="supplier_name" />
              </TableHead>
              <TableHead className="text-xs font-medium text-gray-500 uppercase">Telephone</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 uppercase">Email</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 uppercase">EEC Group</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 uppercase">View</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 uppercase">Edit</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 uppercase">Delete</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 uppercase">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedSuppliers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8 text-gray-500">
                  {searchTerm ? "No suppliers found matching your search." : "No suppliers found. Click 'Add' to create your first supplier."}
                </TableCell>
              </TableRow>
            ) : (
              paginatedSuppliers.map((supplier, index) => (
                <TableRow key={supplier.id} className="table-hover">
                  <TableCell className="text-sm text-gray-900">{(currentPage - 1) * pageSize + index + 1}</TableCell>
                  <TableCell className="text-sm text-gray-900">{supplier.supplier_code}</TableCell>
                  <TableCell className="text-sm text-gray-900">{supplier.sage_code || "-"}</TableCell>
                  <TableCell className="text-sm text-gray-900">{supplier.supplier_name}</TableCell>
                  <TableCell className="text-sm text-gray-900">{supplier.telephone || "-"}</TableCell>
                  <TableCell className="text-sm text-gray-900">{supplier.email || "-"}</TableCell>
                  <TableCell className="text-sm text-gray-900">{supplier.eec_group || "-"}</TableCell>
                  <TableCell>
                    <Link href={`/admin/supplier-database-edit/${supplier.id}?view=true`}>
                      <Eye className="h-4 w-4 btn-view" />
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/admin/supplier-database-edit/${supplier.id}`}>
                      <Edit className="h-4 w-4 btn-edit" />
                    </Link>
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => handleDelete(supplier.id, supplier.supplier_name)}
                      disabled={deleteMutation.isPending}
                      className="disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4 btn-delete" />
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      className={supplier.is_active === "Yes" ? "status-active" : "status-inactive"}
                    >
                      {supplier.is_active === "Yes" ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        
        {sortedSuppliers.length > 0 && (
          <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex items-center justify-between text-sm text-gray-500">
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
              Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, sortedSuppliers.length)} of {sortedSuppliers.length} entries
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
        )}
      </Card>
    </div>
  );
}
