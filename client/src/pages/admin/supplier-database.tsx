import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Edit, Trash2, Search, FileDown, Printer, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Supplier } from "@shared/schema";

export default function Suppliers() {
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
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
            >
              <FileDown className="h-4 w-4 mr-2" />
              Sage Export
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
              <TableHead className="text-xs font-medium text-gray-500 uppercase">Supplier Code</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 uppercase">Sage Code</TableHead>
              <TableHead className="text-xs font-medium text-gray-500 uppercase">Supplier Name</TableHead>
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
            {suppliers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8 text-gray-500">
                  {searchTerm ? "No suppliers found matching your search." : "No suppliers found. Click 'Add' to create your first supplier."}
                </TableCell>
              </TableRow>
            ) : (
              suppliers.map((supplier, index) => (
                <TableRow key={supplier.id} className="table-hover">
                  <TableCell className="text-sm text-gray-900">{index + 1}</TableCell>
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
        
        {suppliers.length > 0 && (
          <div className="bg-gray-50 px-4 py-3 text-sm text-gray-500 border-t border-gray-200">
            Showing 1 to {suppliers.length} of {suppliers.length} entries
          </div>
        )}
      </Card>
    </div>
  );
}
