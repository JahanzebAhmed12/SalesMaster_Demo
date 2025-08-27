import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Eye, Edit, Trash2, Download, FileText, Upload, UserPlus } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Employee } from "@shared/schema";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

// DocumentsCell component for managing employee documents
const DocumentsCell = ({ employeeId }: { employeeId: number }) => {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data: documents = [], refetch } = useQuery({
    queryKey: ["employee-documents", employeeId],
    queryFn: () => apiRequest("GET", `/api/employees/${employeeId}/documents`),
    enabled: isOpen, // Only fetch when dialog is open
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
      const response = await fetch(`/api/employees/${employeeId}/documents`, {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
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
    window.open(`/api/employees/documents/${documentId}`, '_blank');
  };

  const handleView = (documentId: number) => {
    window.open(`/api/employees/documents/${documentId}/view`, '_blank');
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

  const { data: employees = [], isLoading, error } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: () => apiRequest("GET", "/api/employees"),
    onError: (error: any) => {
      console.error("Error loading employees:", error);
      toast({
        variant: "destructive",
        title: "Error Loading Employees",
        description: error.message || "Failed to load employee data. Please try again.",
      });
    }
  });

  const deleteEmployeeMutation = useMutation<void, Error, number>({
    mutationFn: (id) => apiRequest("DELETE", `/api/employees/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast({ title: "Success", description: "Employee deleted successfully." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const filteredEmployees = (employees || []).filter((employee) =>
    employee.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (employee.department && employee.department.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (employee.position && employee.position.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleDelete = (employee: Employee) => {
    if (window.confirm(`Are you sure you want to delete employee '${employee.fullName}'?`)) {
      deleteEmployeeMutation.mutate(employee.id);
    }
  };

  const handleExport = (format: string) => {
    console.log(`Exporting to ${format}`);
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
                    <th className="text-left p-3 border-r">Full Name</th>
                    <th className="text-left p-3 border-r">Title</th>
                    <th className="text-left p-3 border-r">Department</th>
                    <th className="text-left p-3 border-r">Position</th>
                    <th className="text-left p-3 border-r">Mobile Number</th>
                    <th className="text-left p-3 border-r">Start Date</th>
                    <th className="text-left p-3 border-r">Term</th>
                    <th className="text-left p-3 border-r">Status</th>
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
                  {filteredEmployees.map((employee: Employee, index: number) => (
                    <tr key={employee.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 border-r">{index + 1}</td>
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
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t text-sm text-gray-500">
              Showing 1 to {filteredEmployees.length} of {filteredEmployees.length} entries
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}