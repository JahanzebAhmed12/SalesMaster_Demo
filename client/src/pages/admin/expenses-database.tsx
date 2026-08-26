import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Edit, Trash2, Search, FileDown, Printer, Download, FileText, Eye } from "lucide-react";
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
import type { Expense } from "@shared/schema";

export default function Expenses() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const { data: expenses = [], isLoading, error } = useQuery<Expense[]>({
    queryKey: ["expenses", searchTerm],
    queryFn: async () => {
      try {
        const url = searchTerm 
          ? `/api/expenses?search=${encodeURIComponent(searchTerm)}`
          : "/api/expenses";
        return apiRequest("GET", url);
      } catch (error) {
        console.error('Error fetching expenses:', error);
        throw error;
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 3
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/expenses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast({
        title: "Success",
        description: "Expense deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete expense",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (id: number, name: string) => {
    if (window.confirm(`Are you sure you want to delete expense "${name}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  const handleExport = async (format: string) => {
    if (format === "all") {
      toast({
        title: "Info",
        description: "All expenses are already displayed in the table."
      });
      return;
    }

    if (filteredExpenses.length === 0) {
      toast({
        variant: "destructive",
        title: "No Data",
        description: "No expenses found to export."
      });
      return;
    }

    setIsExporting(true);

    try {
      const exportData = filteredExpenses.map((expense, index) => ({
        'Sl.No': index + 1,
        'Expenses Code': expense.expenseCode,
        'Expenses Name': expense.expenseName,
        'Status': expense.isActive === "Yes" ? "Active" : "Inactive"
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

      XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
      
      const fileName = `Expenses_Database_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      toast({
        title: "Success",
        description: "Expenses data exported to Excel successfully."
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
      const doc = new jsPDF('p', 'mm', 'a4');
      
      doc.setFontSize(16);
      doc.text('Expenses Database', 14, 15);
      
      doc.setFontSize(10);
      doc.text('TROPIFRUIT UK LTD', 14, 25);
      doc.text('3 Dolphin Way, Purfleet, RM19 1NZ', 14, 30);
      doc.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 14, 35);

      const tableData = data.map(row => [
        row['Sl.No'],
        row['Expenses Code'],
        row['Expenses Name'],
        row['Status']
      ]);

      autoTable(doc, {
        head: [['#', 'Expenses Code', 'Expenses Name', 'Status']],
        body: tableData,
        startY: 45,
        styles: { fontSize: 10 },
        headStyles: {
          fillColor: [66, 139, 202],
          textColor: 255,
          fontStyle: 'bold'
        },
        columnStyles: {
          0: { cellWidth: 20 },
          1: { cellWidth: 40 },
          2: { cellWidth: 80 },
          3: { cellWidth: 30 }
        }
      });

      const fileName = `Expenses_Database_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      
      toast({
        title: "Success",
        description: "Expenses data exported to PDF successfully."
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
    let html = '';

    html += '<div class="header">';
    html += '<h2>Expenses Database</h2>';
    html += '</div>';

    html += '<div class="company-info">';
    html += '<strong>TROPIFRUIT UK LTD</strong><br>';
    html += '3 Dolphin Way, Purfleet, RM19 1NZ<br>';
    html += `Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
    html += '</div>';

    html += '<table>';
    html += '<thead><tr>';
    html += '<th>#</th><th>Expenses Code</th><th>Expenses Name</th><th>Status</th>';
    html += '</tr></thead><tbody>';

    filteredExpenses.forEach((expense, index) => {
      html += '<tr>';
      html += `<td>${index + 1}</td>`;
      html += `<td>${expense.expenseCode}</td>`;
      html += `<td>${expense.expenseName}</td>`;
      html += `<td>${expense.isActive === "Yes" ? "Active" : "Inactive"}</td>`;
      html += '</tr>';
    });

    html += '</tbody></table>';
    html += `<div style="margin-top: 20px; font-size: 12px; color: #666;">Total Expenses: ${filteredExpenses.length}</div>`;
    printHtmlTable('Expenses Database', html);
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
              <h3 className="text-lg font-medium">Error Loading Expenses</h3>
              <p className="mt-2">Failed to load expense data. Please try again later.</p>
              <Button 
                onClick={() => queryClient.invalidateQueries({ queryKey: ["expenses"] })}
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

  // Filter expenses based on search term
  const filteredExpenses = expenses.filter(expense =>
    expense.expenseCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    expense.expenseName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
        <div className="text-sm text-gray-600">
          TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ..
        </div>
      </div>

      <Card className="shadow-sm border border-gray-200 mb-6">
        <CardContent className="p-6">
          <div className="flex items-center space-x-3 mb-4">
            <Button asChild className="bg-blue-600 text-white hover:bg-blue-700">
              <Link href="/admin/expenses-database-edit">
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Link>
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
                className="flex items-center gap-1"
                disabled={isExporting}
              >
                <Download className="h-4 w-4 mr-1" />
                {isExporting ? 'Exporting...' : 'Excel'}
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleExport('pdf')}
                className="flex items-center gap-1"
                disabled={isExporting}
              >
                <FileText className="h-4 w-4 mr-1" />
                {isExporting ? 'Generating...' : 'PDF'}
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleExport('print')}
                className="flex items-center gap-1"
                disabled={isExporting}
              >
                <Printer className="h-4 w-4 mr-1" />
                Print
              </Button>
            </div>
            <div className="relative">
              <Input
                type="text"
                placeholder="Search:"
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
          <TableHeader className="bg-blue-100">
            <TableRow>
              <TableHead className="text-xs font-medium text-gray-700 uppercase">Sl.No</TableHead>
              <TableHead className="text-xs font-medium text-gray-700 uppercase">Expenses Code</TableHead>
              <TableHead className="text-xs font-medium text-gray-700 uppercase">Expenses Name</TableHead>
              <TableHead className="text-xs font-medium text-gray-700 uppercase">Edit</TableHead>
              <TableHead className="text-xs font-medium text-gray-700 uppercase">Delete</TableHead>
              <TableHead className="text-xs font-medium text-gray-700 uppercase">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredExpenses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                  {searchTerm ? "No expenses found matching your search." : "No expenses found. Click 'Add' to create your first expense."}
                </TableCell>
              </TableRow>
            ) : (
              filteredExpenses.map((expense, index) => (
                <TableRow key={expense.id} className="hover:bg-gray-50">
                  <TableCell className="text-sm text-gray-900">{index + 1}</TableCell>
                  <TableCell className="text-sm text-blue-600 font-medium">{expense.expenseCode}</TableCell>
                  <TableCell className="text-sm text-gray-900">{expense.expenseName}</TableCell>
                  <TableCell>
                    <Link href={`/admin/expenses-database-edit/${expense.id}`}>
                      <Edit className="h-4 w-4 text-blue-600 hover:text-blue-800" />
                    </Link>
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => handleDelete(expense.id, expense.expenseName)}
                      disabled={deleteMutation.isPending}
                      className="text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      className={expense.isActive === "Yes" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}
                    >
                      {expense.isActive === "Yes" ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        
        {filteredExpenses.length > 0 && (
          <div className="bg-gray-50 px-4 py-3 text-sm text-gray-500 border-t border-gray-200 flex justify-between items-center">
            <span>Showing 1 to {filteredExpenses.length} of {filteredExpenses.length} entries</span>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm">Previous</Button>
              <Button variant="outline" size="sm" className="bg-blue-600 text-white">1</Button>
              <Button variant="outline" size="sm">Next</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
