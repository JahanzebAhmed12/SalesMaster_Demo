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
    const today = new Date();
    const expiry = new Date(endDate);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 7 && diffDays >= 0;
  };

  const isExpired = (endDate: string) => {
    const today = new Date();
    const expiry = new Date(endDate);
    return expiry < today;
  };

  const handleExport = async (format: string) => {
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
        const today = new Date();
        const endDate = new Date(item.endDate);
        const diffTime = endDate.getTime() - today.getTime();
        const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        return {
          'Sl.No': index + 1,
          'Description': item.description,
          'Start Date': format(new Date(item.startDate), "dd/MM/yyyy"),
          'End Date': format(new Date(item.endDate), "dd/MM/yyyy"),
          'Status': isExpired(item.endDate) ? 'Expired' : isExpiringSoon(item.endDate) ? 'Expiring Soon' : 'Active',
          'Days Remaining': daysRemaining < 0 ? `${Math.abs(daysRemaining)} days overdue` : `${daysRemaining} days`
        };
      });

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
    } finally {
      setIsExporting(false);
    }
  };

  const handleExcelExport = async (data: any[]) => {
    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);

      // Auto-size columns
      const colWidths = Object.keys(data[0] || {}).map(key => ({
        wch: Math.max(key.length, ...data.map(row => String(row[key] || '').length))
      }));
      ws['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, 'Equipment');
      
      const fileName = `Equipment_Database_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      toast({
        title: "Success",
        description: "Equipment data exported to Excel successfully."
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
      
      // Add title
      doc.setFontSize(16);
      doc.text('Equipment Database', 14, 15);
      
      // Add company info
      doc.setFontSize(10);
      doc.text('TROPIFRUIT UK LTD', 14, 25);
      doc.text('3 Dolphin Way, Purfleet, RM19 1NZ', 14, 30);
      doc.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 14, 35);

      // Prepare table data
      const tableData = data.map(row => [
        row['Sl.No'],
        row['Description'],
        row['Start Date'],
        row['End Date'],
        row['Status'],
        row['Days Remaining']
      ]);

      // Add table
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
        }
      });

      const fileName = `Equipment_Database_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      
      toast({
        title: "Success",
        description: "Equipment data exported to PDF successfully."
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
        const today = new Date();
        const endDate = new Date(item.endDate);
        const diffTime = endDate.getTime() - today.getTime();
        const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        printWindow.document.write('<tr>');
        printWindow.document.write(`<td>${index + 1}</td>`);
        printWindow.document.write(`<td>${item.description}</td>`);
        printWindow.document.write(`<td>${format(new Date(item.startDate), "dd/MM/yyyy")}</td>`);
        printWindow.document.write(`<td>${format(new Date(item.endDate), "dd/MM/yyyy")}</td>`);
        printWindow.document.write(`<td>${isExpired(item.endDate) ? 'Expired' : isExpiringSoon(item.endDate) ? 'Expiring Soon' : 'Active'}</td>`);
        printWindow.document.write(`<td>${daysRemaining < 0 ? `${Math.abs(daysRemaining)} days overdue` : `${daysRemaining} days`}</td>`);
        printWindow.document.write('</tr>');
      });

      printWindow.document.write('</tbody></table>');
      printWindow.document.write(`<div style="margin-top: 20px; font-size: 12px; color: #666;">Total Equipment: ${filteredEquipment.length}</div>`);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
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
                    const today = new Date();
                    const endDate = new Date(item.endDate);
                    const diffTime = endDate.getTime() - today.getTime();
                    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.description}</TableCell>
                        <TableCell>{format(new Date(item.startDate), "dd/MM/yyyy")}</TableCell>
                        <TableCell>{format(new Date(item.endDate), "dd/MM/yyyy")}</TableCell>
                        <TableCell>
                          {isExpired(item.endDate) ? (
                            <Badge variant="destructive">Expired</Badge>
                          ) : isExpiringSoon(item.endDate) ? (
                            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                              Expiring Soon
                            </Badge>
                          ) : (
                            <Badge variant="default" className="bg-green-100 text-green-800">
                              Active
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
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
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(item.id!)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(item.id!, item.description)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
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