import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Plus, Search, Download, FileText, Printer, ChevronUp, ChevronDown } from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAdminCrossTabSync } from "@/hooks/useAdminCrossTabSync";
import { format } from "date-fns";
import type { Equipment } from "@shared/schema";
import PageLayout from "@/components/common/page-layout";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { printHtmlTable } from "@/lib/export-utils";

export default function EquipmentDatabase() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [sortField, setSortField] = useState<"description" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { broadcastEquipmentOperation } = useAdminCrossTabSync();



  // Fetch equipment
  const { data: equipment = [], isLoading } = useQuery<Equipment[]>({
    queryKey: ["/api/equipment"],
    queryFn: () => apiRequest("GET", "/api/equipment"),
  });

  // Delete equipment mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/equipment/${id}`),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      broadcastEquipmentOperation("DELETED", { id: deletedId });
      toast({
        title: "Success",
        description: "Equipment deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.error || "Failed to delete equipment",
        variant: "destructive",
      });
    },
  });

  // Filter equipment based on search term
  const filteredEquipment = React.useMemo(() => {
    let filtered = equipment.filter((item) =>
      item.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (sortField) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = (a[sortField] || '').toLowerCase();
        const bVal = (b[sortField] || '').toLowerCase();
        const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
        return sortDirection === 'asc' ? cmp : -cmp;
      });
    }

    return filtered;
  }, [equipment, searchTerm, sortField, sortDirection]);

  const paginatedEquipment = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEquipment.slice(start, start + pageSize);
  }, [filteredEquipment, currentPage, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredEquipment.length / pageSize));

  const handleSort = (field: "description") => {
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

  const handleEdit = (id: number) => {
    setLocation(`/admin/equipment-database-edit?id=${id}`);
  };

  const handleDelete = (id: number, description: string) => {
    if (window.confirm(`Are you sure you want to delete "${description}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  const handleAddNew = () => {
    setLocation("/admin/equipment-database-edit");
  };

  // Check if equipment is expiring soon (within 7 days)
  const isExpiringSoon = (endDate: string) => {
    try {
      if (!endDate) return false;
      const today = new Date();
      const expiry = new Date(endDate);
      
      // Check if date is valid
      if (isNaN(expiry.getTime())) return false;
      
      const diffTime = expiry.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= 7 && diffDays >= 0;
    } catch (error) {
      console.error('Error checking expiring soon:', error);
      return false;
    }
  };

  const isExpired = (endDate: string) => {
    try {
      if (!endDate) return false;
      const today = new Date();
      const expiry = new Date(endDate);
      
      // Check if date is valid
      if (isNaN(expiry.getTime())) return false;
      
      return expiry < today;
    } catch (error) {
      console.error('Error checking expired:', error);
      return false;
    }
  };

  const handleExport = async (exportFormat: string) => {
    if (filteredEquipment.length === 0) {
      toast({
        variant: "destructive",
        title: "No Data",
        description: "No equipment found to export."
      });
      return;
    }

    setIsExporting(true);

    try {
      const exportData = filteredEquipment.map((item, index) => {
        // Validate dates before processing
        const startDate = item.startDate ? new Date(item.startDate) : new Date();
        const endDate = item.endDate ? new Date(item.endDate) : new Date();
        const today = new Date();
        
        // Check if dates are valid
        const isValidStartDate = !isNaN(startDate.getTime());
        const isValidEndDate = !isNaN(endDate.getTime());
        
        const diffTime = isValidEndDate ? endDate.getTime() - today.getTime() : 0;
        const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        return {
          'Sl.No': index + 1,
          'Description': item.description || 'N/A',
          'Start Date': isValidStartDate ? format(startDate, "dd/MM/yyyy") : 'N/A',
          'End Date': isValidEndDate ? format(endDate, "dd/MM/yyyy") : 'N/A',
          'Status': isValidEndDate ? (isExpired(item.endDate) ? 'Expired' : isExpiringSoon(item.endDate) ? 'Expiring Soon' : 'Active') : 'Unknown',
          'Days Remaining': isValidEndDate ? (daysRemaining < 0 ? `${Math.abs(daysRemaining)} days overdue` : `${daysRemaining} days`) : 'N/A'
        };
      });

      switch (exportFormat) {
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
          console.log(`Unknown format: ${exportFormat}`);
      }
    } catch (error) {
      console.error('Export error:', error);
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred during export."
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExcelExport = async (data: any[]) => {
    try {
      if (!data || data.length === 0) {
        throw new Error("No data available for export");
      }

      // Check if XLSX is available
      if (typeof XLSX === 'undefined') {
        throw new Error("Excel export library not loaded");
      }

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);

      // Auto-size columns with error handling
      try {
        const colWidths = Object.keys(data[0] || {}).map(key => {
          const maxLength = Math.max(
            key.length,
            ...data.map(row => String(row[key] || '').length)
          );
          return { wch: Math.min(maxLength, 50) }; // Cap at 50 characters
        });
        ws['!cols'] = colWidths;
      } catch (colError) {
        console.warn('Column sizing failed, using default:', colError);
      }

      XLSX.utils.book_append_sheet(wb, ws, 'Equipment');
      
      const fileName = `Equipment_Database_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      toast({
        title: "Success",
        description: "Equipment data exported to Excel successfully."
      });
    } catch (error) {
      console.error('Excel export error:', error);
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export to Excel. Please try again."
      });
      throw error; // Re-throw to be caught by parent handler
    }
  };

  const handlePDFExport = async (data: any[]) => {
    try {
      if (!data || data.length === 0) {
        throw new Error("No data available for export");
      }

      // Check if jsPDF is available
      if (typeof jsPDF === 'undefined') {
        throw new Error("PDF export library not loaded");
      }

      const doc = new jsPDF('l', 'mm', 'a4');
      
      // Add title with error handling
      try {
        doc.setFontSize(16);
        doc.text('Equipment Database', 14, 15);
        
        // Add company info
        doc.setFontSize(10);
        doc.text('TROPIFRUIT UK LTD', 14, 25);
        doc.text('3 Dolphin Way, Purfleet, RM19 1NZ', 14, 30);
        doc.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 14, 35);
      } catch (headerError) {
        console.warn('PDF header creation failed:', headerError);
      }

      // Prepare table data with validation
      const tableData = data.map(row => [
        String(row['Sl.No'] || ''),
        String(row['Description'] || ''),
        String(row['Start Date'] || ''),
        String(row['End Date'] || ''),
        String(row['Status'] || ''),
        String(row['Days Remaining'] || '')
      ]);

      // Check if autoTable is available
      if (typeof autoTable === 'undefined') {
        throw new Error("PDF table library not loaded");
      }

      // Add table with error handling
      try {
        autoTable(doc, {
          head: [['#', 'Description', 'Start Date', 'End Date', 'Status', 'Days Remaining']],
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
            1: { cellWidth: 80 },
            2: { cellWidth: 30 },
            3: { cellWidth: 30 },
            4: { cellWidth: 30 },
            5: { cellWidth: 40 }
          },
          didDrawCell: function(data) {
            // Handle any cell drawing errors
          }
        });
      } catch (tableError) {
        console.error('PDF table creation failed:', tableError);
        throw new Error("Failed to create PDF table");
      }

      const fileName = `Equipment_Database_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      
      toast({
        title: "Success",
        description: "Equipment data exported to PDF successfully."
      });
    } catch (error) {
      console.error('PDF export error:', error);
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export to PDF. Please try again."
      });
      throw error; // Re-throw to be caught by parent handler
    }
  };

  const handlePrint = () => {
    try {
      let html = '';

      // Add header
      html += '<div class="header">';
      html += '<h2>Equipment Database</h2>';
      html += '</div>';

      // Add company info
      html += '<div class="company-info">';
      html += '<strong>TROPIFRUIT UK LTD</strong><br>';
      html += '3 Dolphin Way, Purfleet, RM19 1NZ<br>';
      html += `Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
      html += '</div>';

      // Add table
      html += '<table>';
      html += '<thead><tr>';
      html += '<th>#</th><th>Description</th><th>Start Date</th><th>End Date</th><th>Status</th><th>Days Remaining</th>';
      html += '</tr></thead><tbody>';

      filteredEquipment.forEach((item, index) => {
        try {
          const today = new Date();
          const startDate = item.startDate ? new Date(item.startDate) : null;
          const endDate = item.endDate ? new Date(item.endDate) : null;
          
          const isValidStartDate = startDate && !isNaN(startDate.getTime());
          const isValidEndDate = endDate && !isNaN(endDate.getTime());
          
          const diffTime = isValidEndDate ? endDate.getTime() - today.getTime() : 0;
          const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          html += '<tr>';
          html += `<td>${index + 1}</td>`;
          html += `<td>${item.description || 'N/A'}</td>`;
          html += `<td>${isValidStartDate ? format(startDate, "dd/MM/yyyy") : 'N/A'}</td>`;
          html += `<td>${isValidEndDate ? format(endDate, "dd/MM/yyyy") : 'N/A'}</td>`;
          html += `<td>${isValidEndDate ? (isExpired(item.endDate) ? 'Expired' : isExpiringSoon(item.endDate) ? 'Expiring Soon' : 'Active') : 'Unknown'}</td>`;
          html += `<td>${isValidEndDate ? (daysRemaining < 0 ? `${Math.abs(daysRemaining)} days overdue` : `${daysRemaining} days`) : 'N/A'}</td>`;
          html += '</tr>';
        } catch (rowError) {
          console.error('Error processing row:', rowError);
          // Add a fallback row
          html += '<tr>';
          html += `<td>${index + 1}</td>`;
          html += `<td>${item.description || 'N/A'}</td>`;
          html += '<td colspan="4">Error processing row</td>';
          html += '</tr>';
        }
      });
      
      html += '</tbody></table>';
      html += `<div style="margin-top: 20px; font-size: 12px; color: #666;">Total Equipment: ${filteredEquipment.length}</div>`;
      printHtmlTable('Equipment Database', html);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Print Failed",
        description: "An error occurred while printing."
      });
    }
  };

  return (
    <PageLayout title="Equipment Database" breadcrumb="Admin / Equipment Database">
      <div className="space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Equipment Database</CardTitle>
              <Button onClick={handleAddNew} className="bg-green-600 hover:bg-green-700">
                <Plus className="w-4 h-4 mr-2" />
                Add New Equipment
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleExport("excel")} 
                  className="text-green-600 hover:text-green-700"
                  disabled={isExporting}
                >
                  <Download className="h-4 w-4 mr-1" />
                  {isExporting ? 'Exporting...' : 'Excel'}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleExport("pdf")} 
                  className="text-red-600 hover:text-red-700"
                  disabled={isExporting}
                >
                  <FileText className="h-4 w-4 mr-1" />
                  {isExporting ? 'Generating...' : 'PDF'}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleExport("print")} 
                  className="text-blue-600 hover:text-blue-700"
                  disabled={isExporting}
                >
                  <Printer className="h-4 w-4 mr-1" />
                  Print
                </Button>
              </div>
              <div className="flex items-center space-x-2">
                <Search className="w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search equipment..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-sm"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Equipment Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer select-none hover:bg-gray-100" onClick={() => handleSort("description")}>
                    Description <SortIcon field="description" />
                  </TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Days Remaining</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      Loading equipment...
                    </TableCell>
                  </TableRow>
                ) : filteredEquipment.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      No equipment found
                    </TableCell>
                  </TableRow>
                ) : paginatedEquipment.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-gray-500">No equipment found.</TableCell>
                    </TableRow>
                  ) : (
                    paginatedEquipment.map((item) => {
                    try {
                      const today = new Date();
                      const startDate = item.startDate ? new Date(item.startDate) : null;
                      const endDate = item.endDate ? new Date(item.endDate) : null;
                      
                      const isValidStartDate = startDate && !isNaN(startDate.getTime());
                      const isValidEndDate = endDate && !isNaN(endDate.getTime());
                      
                      const diffTime = isValidEndDate ? endDate.getTime() - today.getTime() : 0;
                      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                      
                      return (
                        <TableRow key={item.id || `equipment-${Math.random()}`}>
                          <TableCell className="font-medium">{item.description || 'N/A'}</TableCell>
                          <TableCell>
                            {isValidStartDate ? format(startDate, "dd/MM/yyyy") : 'N/A'}
                          </TableCell>
                          <TableCell>
                            {isValidEndDate ? format(endDate, "dd/MM/yyyy") : 'N/A'}
                          </TableCell>
                          <TableCell>
                            {isValidEndDate ? (
                              isExpired(item.endDate) ? (
                                <Badge variant="destructive">Expired</Badge>
                              ) : isExpiringSoon(item.endDate) ? (
                                <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                                  Expiring Soon
                                </Badge>
                              ) : (
                                <Badge variant="default" className="bg-green-100 text-green-800">
                                  Active
                                </Badge>
                              )
                            ) : (
                              <Badge variant="secondary">Unknown</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {isValidEndDate ? (
                              <span className={
                                daysRemaining < 0 
                                  ? "text-red-600 font-semibold" 
                                  : daysRemaining <= 7 
                                    ? "text-yellow-600 font-semibold" 
                                    : "text-green-600"
                              }>
                                {daysRemaining < 0 
                                  ? `${Math.abs(daysRemaining)} days overdue` 
                                  : `${daysRemaining} days`
                                }
                              </span>
                            ) : (
                              <span className="text-gray-500">N/A</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEdit(item.id!)}
                                disabled={!item.id}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDelete(item.id!, item.description || 'Unknown')}
                                className="text-red-600 hover:text-red-700"
                                disabled={!item.id}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    } catch (rowError) {
                      console.error('Error rendering equipment row:', rowError, item);
                      return (
                        <TableRow key={`error-${Math.random()}`}>
                          <TableCell colSpan={6} className="text-center text-red-500">
                            Error displaying equipment data
                          </TableCell>
                        </TableRow>
                      );
                    }
                  })
                  )}
              </TableBody>
            </Table>
            {filteredEquipment.length > 0 && (
              <div className="border-t px-4 py-3 flex items-center justify-between text-sm text-gray-500">
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
                  Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredEquipment.length)} of {filteredEquipment.length} entries
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
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}