import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Eye, Edit, Trash2, Download } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Employee } from "@shared/schema";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function EmployeeDatabase() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: () => apiRequest("GET", "/api/employees")
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