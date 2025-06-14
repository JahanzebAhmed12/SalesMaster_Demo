import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Edit, Trash2, Search, FileDown, Printer } from "lucide-react";
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

  const handleExport = (format: string) => {
    // Implement export functionality
    toast({
      title: "Export",
      description: `Exporting to ${format} format...`,
    });
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
              >
                Show all rows
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleExport('excel')}
              >
                Excel
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleExport('pdf')}
              >
                PDF
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleExport('print')}
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
