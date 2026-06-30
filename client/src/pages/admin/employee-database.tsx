import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Eye, Edit, Trash2, Download, FileText, Upload, UserPlus, Printer, ChevronUp, ChevronDown } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Employee } from "@shared/schema";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAdminCrossTabSync } from "@/hooks/useAdminCrossTabSync";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Helper to get the correct API URL
const getApiUrl = (endpoint: string) => {
  // Use the same base URL as the current page, but for API calls
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  const port = window.location.port;
  
  // In development, use localhost:5000, in production use the same host
  let API_BASE_URL;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    API_BASE_URL = "http://localhost:5000";
  } else {
    // Production - use the same protocol and host as the frontend
    API_BASE_URL = `${protocol}//${hostname}${port ? ':' + port : ''}`;
  }
  
  return `${API_BASE_URL}${endpoint}`;
};

// DocumentsCell component for managing employee documents
const DocumentsCell = ({ employeeId }: { employeeId: number }) => {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data: documents = [], refetch } = useQuery({
    queryKey: ["employee-documents", employeeId],
    queryFn: () => apiRequest("GET", `/api/employees/${employeeId}/documents`),
    // Always fetch to show correct count, but refetch when dialog opens
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const documentName = prompt("Enter document name:");
    if (!documentName) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentName', documentName);

    try {
      const response = await fetch(getApiUrl(`/api/employees/${employeeId}/documents`), {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`,
        },
      });

      if (!response.ok) throw new Error('Upload failed');

      toast({
        title: "Success",
        description: "Document uploaded successfully.",
      });
      
      refetch(); // Refresh documents list
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: "Failed to upload document. Please try again.",
      });
    } finally {
      setUploading(false);
      event.target.value = ''; // Reset file input
    }
  };

  const handleDownload = (documentId: number, fileName: string) => {
    window.open(getApiUrl(`/api/employees/documents/${documentId}`), '_blank');
  };

  const handleView = (documentId: number) => {
    window.open(getApiUrl(`/api/employees/documents/${documentId}/view`), '_blank');
  };

  const handleDelete = async (documentId: number, documentName: string) => {
    if (!window.confirm(`Are you sure you want to delete "${documentName}"?`)) return;

    try {
      await apiRequest("DELETE", `/api/employees/documents/${documentId}`);
      toast({
        title: "Success",
        description: "Document deleted successfully.",
      });
      refetch(); // Refresh documents list
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete document.",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="flex items-center gap-1">
          <FileText className="h-4 w-4" />
          <span className="text-xs">{documents.length}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Employee Documents</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Upload Section */}
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
            <div className="text-center">
              <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
              <label htmlFor={`file-upload-${employeeId}`} className="cursor-pointer">
                <span className="text-sm text-gray-600">
                  Click to upload a document or drag and drop
                </span>
                <input
                  id={`file-upload-${employeeId}`}
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  accept=".pdf,.png,.jpg,.jpeg,.gif,.doc,.docx,.txt"
                  disabled={uploading}
                />
              </label>
              {uploading && (
                <div className="mt-2 text-sm text-blue-600">Uploading...</div>
              )}
            </div>
          </div>

          {/* Documents List */}
          <div className="space-y-2">
            {documents.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No documents uploaded yet.
              </div>
            ) : (
              documents.map((doc: any) => (
                <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{doc.documentName}</div>
                    {doc.fileName && (
                      <div className="text-xs text-gray-500">{doc.fileName}</div>
                    )}
                    {(doc.startDate || doc.endDate) && (
                      <div className="text-xs text-gray-500">
                        {doc.startDate && `From: ${new Date(doc.startDate).toLocaleDateString()}`}
                        {doc.startDate && doc.endDate && " | "}
                        {doc.endDate && `To: ${new Date(doc.endDate).toLocaleDateString()}`}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {doc.hasFile && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleView(doc.id)}
                          title="View document"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownload(doc.id, doc.fileName)}
                          title="Download document"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(doc.id, doc.documentName)}
                      className="text-red-600 hover:text-red-800"
                      title="Delete document"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default function EmployeeDatabase() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [sortField, setSortField] = useState<"fullName" | "department" | "status" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { broadcastEmployeeOperation } = useAdminCrossTabSync();

  const { data: employees = [], isLoading, error } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: () => apiRequest("GET", "/api/employees"),
  });

  const deleteEmployeeMutation = useMutation<void, Error, number>({
    mutationFn: (id) => apiRequest("DELETE", `/api/employees/${id}`),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      broadcastEmployeeOperation("DELETED", { id: deletedId });
      toast({ title: "Success", description: "Employee deleted successfully." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const filteredEmployees = React.useMemo(() => {
    let filtered = (employees || []).filter((employee) =>
      employee.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (employee.department && employee.department.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (employee.position && employee.position.toLowerCase().includes(searchTerm.toLowerCase()))
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
  }, [employees, searchTerm, sortField, sortDirection]);

  const paginatedEmployees = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEmployees.slice(start, start + pageSize);
  }, [filteredEmployees, currentPage, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / pageSize));

  const handleSort = (field: "fullName" | "department" | "status") => {
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

  const handleDelete = (employee: Employee) => {
    if (window.confirm(`Are you sure you want to delete employee '${employee.fullName}'?`)) {
      deleteEmployeeMutation.mutate(employee.id);
    }
  };

  const handleExport = async (format: string) => {
    if (format === "all") {
      // Show all rows - just remove any pagination if implemented
      toast({
        title: "Info",
        description: "All employees are already displayed in the table."
      });
      return;
    }

    if (filteredEmployees.length === 0) {
      toast({
        variant: "destructive",
        title: "No Data",
        description: "No employees found to export."
      });
      return;
    }

    setIsExporting(true);

    try {
      const exportData = filteredEmployees.map((employee, index) => ({
        'Sl.No': index + 1,
        'Full Name': employee.fullName,
        'Title': employee.title || '',
        'Department': employee.department || '',
        'Position': employee.position || '',
        'Mobile Number': employee.mobileNumber || '',
        'Start Date': employee.startDate ? new Date(employee.startDate).toLocaleDateString() : '',
        'Term': employee.term || '',
        'Status': employee.status || '',
        'Next of Kin': employee.nextOfKinName || '',
        'Next of Kin Relationship': employee.nextOfKinRelationship || '',
        'Next of Kin Phone': employee.nextOfKinPhoneNumber || '',
        'Active': employee.isActive === 'yes' ? 'Active' : 'Inactive'
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

  const handleExcelExport = (data: any[]) => {
    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);

      // Auto-size columns
      const colWidths = Object.keys(data[0] || {}).map(key => ({
        wch: Math.max(key.length, ...data.map(row => String(row[key] || '').length))
      }));
      ws['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, 'Employees');
      
      const fileName = `Employee_Database_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      toast({
        title: "Success",
        description: "Employee data exported to Excel successfully."
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: "Failed to export to Excel. Please try again."
      });
    }
  };

  const handlePDFExport = (data: any[]) => {
    try {
      const doc = new jsPDF('l', 'mm', 'a4'); // Landscape orientation for better table fit
      
      // Add title
      doc.setFontSize(16);
      doc.text('Employee Database', 14, 15);
      
      // Add company info
      doc.setFontSize(10);
      doc.text('TROPIFRUIT UK LTD', 14, 25);
      doc.text('3 Dolphin Way, Purfleet, RM19 1NZ', 14, 30);
      doc.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 14, 35);

      // Prepare table data
      const tableData = data.map(row => [
        row['Sl.No'],
        row['Full Name'],
        row['Title'],
        row['Department'],
        row['Position'],
        row['Mobile Number'],
        row['Start Date'],
        row['Status'],
        row['Active']
      ]);

      // Add table
      autoTable(doc, {
        head: [['#', 'Name', 'Title', 'Department', 'Position', 'Mobile', 'Start Date', 'Status', 'Active']],
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
          1: { cellWidth: 40 },
          2: { cellWidth: 25 },
          3: { cellWidth: 30 },
          4: { cellWidth: 30 },
          5: { cellWidth: 30 },
          6: { cellWidth: 25 },
          7: { cellWidth: 25 },
          8: { cellWidth: 20 }
        }
      });

      const fileName = `Employee_Database_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      
      toast({
        title: "Success",
        description: "Employee data exported to PDF successfully."
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
      printWindow.document.write('<html><head><title>Employee Database</title>');
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
      printWindow.document.write('<h2>Employee Database</h2>');
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
      printWindow.document.write('<th>#</th><th>Full Name</th><th>Title</th><th>Department</th><th>Position</th><th>Mobile</th><th>Start Date</th><th>Status</th><th>Active</th>');
      printWindow.document.write('</tr></thead><tbody>');

      filteredEmployees.forEach((employee, index) => {
        printWindow.document.write('<tr>');
        printWindow.document.write(`<td>${index + 1}</td>`);
        printWindow.document.write(`<td>${employee.fullName}</td>`);
        printWindow.document.write(`<td>${employee.title || ''}</td>`);
        printWindow.document.write(`<td>${employee.department || ''}</td>`);
        printWindow.document.write(`<td>${employee.position || ''}</td>`);
        printWindow.document.write(`<td>${employee.mobileNumber || ''}</td>`);
        printWindow.document.write(`<td>${employee.startDate ? new Date(employee.startDate).toLocaleDateString() : ''}</td>`);
        printWindow.document.write(`<td>${employee.status || ''}</td>`);
        printWindow.document.write(`<td>${employee.isActive === 'yes' ? 'Active' : 'Inactive'}</td>`);
        printWindow.document.write('</tr>');
      });

      printWindow.document.write('</tbody></table>');
      printWindow.document.write(`<div style="margin-top: 20px; font-size: 12px; color: #666;">Total Employees: ${filteredEmployees.length}</div>`);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-96">Loading employees...</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="text-red-600 mb-4">
              <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.962-.833-2.732 0L4.082 14.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Employees</h3>
            <p className="text-gray-500 mb-4">There was a problem loading the employee data.</p>
            <Button 
              onClick={() => window.location.reload()} 
              className="bg-blue-600 hover:bg-blue-700"
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Employee Database</h1>
        <div className="text-sm text-gray-500">
          TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
        </div>
      </div>

      <div className="mb-6">
        <div className="flex gap-2 mb-4">
          <Button 
            variant="default"
            className="flex items-center gap-2"
          >
            <Eye className="h-4 w-4" />
            View Employees
          </Button>
          <Link href="/admin/employee-database-edit">
            <Button 
              variant="outline"
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Employee
            </Button>
          </Link>
        </div>

        <div className="flex gap-2 mb-4">
          <Button variant="outline" size="sm" onClick={() => handleExport("all")} disabled={isExporting}>
            <Eye className="h-4 w-4 mr-1" />
            Show All
          </Button>
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
          <div className="ml-auto">
            <Input
              placeholder="Search employees..."
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
                    <th className="text-left p-3 border-r cursor-pointer select-none hover:bg-gray-200" onClick={() => handleSort("fullName")}>
                      Full Name <SortIcon field="fullName" />
                    </th>
                    <th className="text-left p-3 border-r">Title</th>
                    <th className="text-left p-3 border-r cursor-pointer select-none hover:bg-gray-200" onClick={() => handleSort("department")}>
                      Department <SortIcon field="department" />
                    </th>
                    <th className="text-left p-3 border-r">Position</th>
                    <th className="text-left p-3 border-r">Mobile Number</th>
                    <th className="text-left p-3 border-r">Start Date</th>
                    <th className="text-left p-3 border-r">Term</th>
                    <th className="text-left p-3 border-r cursor-pointer select-none hover:bg-gray-200" onClick={() => handleSort("status")}>
                      Status <SortIcon field="status" />
                    </th>
                    <th className="text-left p-3 border-r">Next of Kin</th>
                    <th className="text-left p-3 border-r">Documents</th>
                    <th className="text-left p-3 border-r">Joining Form</th>
                    <th className="text-left p-3 border-r">Contract</th>
                    <th className="text-left p-3 border-r">Edit</th>
                    <th className="text-left p-3 border-r">Delete</th>
                    <th className="text-left p-3">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={16} className="p-6 text-center text-gray-500">No employees found.</td>
                    </tr>
                  ) : (
                    paginatedEmployees.map((employee: Employee, index: number) => (
                    <tr key={employee.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 border-r">{(currentPage - 1) * pageSize + index + 1}</td>
                      <td className="p-3 border-r">{employee.fullName}</td>
                      <td className="p-3 border-r">{employee.title || ""}</td>
                      <td className="p-3 border-r">{employee.department || ""}</td>
                      <td className="p-3 border-r">{employee.position || ""}</td>
                      <td className="p-3 border-r">{employee.mobileNumber || ""}</td>
                      <td className="p-3 border-r">
                        {employee.startDate ? new Date(employee.startDate).toLocaleDateString() : ""}
                      </td>
                      <td className="p-3 border-r">{employee.term || ""}</td>
                      <td className="p-3 border-r">{employee.status || ""}</td>
                      <td className="p-3 border-r">
                        {employee.nextOfKinName ? (
                          <div className="text-xs">
                            <div className="font-medium">{employee.nextOfKinName}</div>
                            {employee.nextOfKinRelationship && (
                              <div className="text-gray-500">({employee.nextOfKinRelationship})</div>
                            )}
                            {employee.nextOfKinPhoneNumber && (
                              <div className="text-gray-500">{employee.nextOfKinPhoneNumber}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="p-3 border-r">
                        <DocumentsCell employeeId={employee.id} />
                      </td>
                      <td className="p-3 border-r">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => window.open(`/print/employee-joining-form/${employee.id}`, '_blank')}
                          title="Print Joining Form"
                        >
                          <UserPlus className="h-4 w-4" />
                        </Button>
                      </td>
                      <td className="p-3 border-r">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => window.open(`/print/employee-contract/${employee.id}`, '_blank')}
                          title="Print Contract"
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      </td>
                      <td className="p-3 border-r">
                        <Link href={`/admin/employee-database-edit/${employee.id}`}>
                          <Button variant="ghost" size="sm">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </Link>
                      </td>
                      <td className="p-3 border-r">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleDelete(employee)} 
                          disabled={deleteEmployeeMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                      <td className="p-3">
                        <Badge 
                          variant="secondary" 
                          className={employee.isActive === 'yes' ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}
                        >
                          {employee.isActive === 'yes' ? 'Active' : 'Inactive'}
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
                Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredEmployees.length)} of {filteredEmployees.length} employees
                {searchTerm && ` (filtered)`}
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
      </div>
    </div>
  );
}