import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Plus, Search, Download, FileText, Printer } from "lucide-react";
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

export default function EquipmentDatabase() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [isExporting, setIsExporting] = useState(false);
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
  const filteredEquipment = equipment.filter((item) =>
    item.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
          headStyles: { fillColor: [240, 240, 240] },
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
      const printWindow = window.open('', '', 'height=600,width=900');
      if (!printWindow) {
        toast({
          variant: "destructive",
          title: "Print Failed",
          description: "Unable to open print window. Please check your browser's popup settings."
        });
        return;
      }

      printWindow.document.write('<html><head><title>Equipment Database</title>');
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

      // Add header
      printWindow.document.write('<div class="header">');
      printWindow.document.write('<h2>Equipment Database</h2>');
      printWindow.document.write('</div>');

      // Add company info
      printWindow.document.write('<div class="company-info">');
      printWindow.document.write('<strong>TROPIFRUIT UK LTD</strong><br>');
      printWindow.document.write('3 Dolphin Way, Purfleet, RM19 1NZ<br>');
      printWindow.document.write(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`);
      printWindow.document.write('</div>');

      // Add table
      printWindow.document.write('<table>');
      printWindow.document.write('<thead><tr>');
      printWindow.document.write('<th>#</th><th>Description</th><th>Start Date</th><th>End Date</th><th>Status</th><th>Days Remaining</th>');
      printWindow.document.write('</tr></thead><tbody>');

      filteredEquipment.forEach((item, index) => {
        try {
          const today = new Date();
          const startDate = item.startDate ? new Date(item.startDate) : null;
          const endDate = item.endDate ? new Date(item.endDate) : null;
          
          const isValidStartDate = startDate && !isNaN(startDate.getTime());
          const isValidEndDate = endDate && !isNaN(endDate.getTime());
          
          const diffTime = isValidEndDate ? endDate.getTime() - today.getTime() : 0;
          const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          printWindow.document.write('<tr>');
          printWindow.document.write(`<td>${index + 1}</td>`);
          printWindow.document.write(`<td>${item.description || 'N/A'}</td>`);
          printWindow.document.write(`<td>${isValidStartDate ? format(startDate, "dd/MM/yyyy") : 'N/A'}</td>`);
          printWindow.document.write(`<td>${isValidEndDate ? format(endDate, "dd/MM/yyyy") : 'N/A'}</td>`);
          printWindow.document.write(`<td>${isValidEndDate ? (isExpired(item.endDate) ? 'Expired' : isExpiringSoon(item.endDate) ? 'Expiring Soon' : 'Active') : 'Unknown'}</td>`);
          printWindow.document.write(`<td>${isValidEndDate ? (daysRemaining < 0 ? `${Math.abs(daysRemaining)} days overdue` : `${daysRemaining} days`) : 'N/A'}</td>`);
          printWindow.document.write('</tr>');
        } catch (rowError) {
          console.error('Error processing row:', rowError);
          // Add a fallback row
          printWindow.document.write('<tr>');
          printWindow.document.write(`<td>${index + 1}</td>`);
          printWindow.document.write(`<td>${item.description || 'N/A'}</td>`);
          printWindow.document.write('<td>Error</td><td>Error</td><td>Error</td><td>Error</td>');
          printWindow.document.write('</tr>');
        }
      });

      printWindow.document.write('</tbody></table>');
      printWindow.document.write(`<div style="margin-top: 20px; font-size: 12px; color: #666;">Total Equipment: ${filteredEquipment.length}</div>`);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
      
      toast({
        title: "Success",
        description: "Print dialog opened successfully."
      });
    } catch (error) {
      console.error('Print error:', error);
      toast({
        variant: "destructive",
        title: "Print Failed",
        description: error instanceof Error ? error.message : "Failed to open print dialog."
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
                  <TableHead>Description</TableHead>
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
                ) : (
                  filteredEquipment.map((item) => {
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
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}