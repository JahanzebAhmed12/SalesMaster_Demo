import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-request";
import { NonProduct } from "@shared/schema";
import { toast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";

const ViewNonProducts = () => {
  const queryClient = useQueryClient();

  const { data: nonProducts, isLoading, isError, error } = useQuery<NonProduct[]>({ 
    queryKey: ["nonProducts"], 
    queryFn: () => apiRequest<NonProduct[]>("/api/products/non", "GET"),
  });

  const deleteNonProductMutation = useMutation<void, Error, number>({
    mutationFn: (id) => apiRequest<void>(`/api/products/non/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nonProducts"] });
      toast({
        title: "Success!",
        description: "Non-product deleted successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to delete non-product: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleDelete = (id: number) => {
    if (window.confirm("Are you sure you want to delete this non-product?")) {
      deleteNonProductMutation.mutate(id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Loading non-products...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-red-500">Error loading non-products: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Non Products</h1>
            <p className="text-sm text-gray-500">Manage non-product items</p>
          </div>
          <div className="flex space-x-2">
            <Link href="/admin/products-database">
              <Button variant="outline" className="bg-blue-600 text-white hover:bg-blue-700">
                View Products
              </Button>
            </Link>
            <Link href="/admin/products-database">
              <Button variant="outline" className="bg-blue-600 text-white hover:bg-blue-700">
                Add Products
              </Button>
            </Link>
            <Button className="bg-blue-600 text-white hover:bg-blue-700">
              View NonProducts
            </Button>
            <Link href="/admin/add-nonproduct">
              <Button className="bg-blue-600 text-white hover:bg-blue-700">
                Add NonProducts
              </Button>
            </Link>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="flex space-x-2">
                <Button variant="outline" size="sm">Show all rows</Button>
                <Button variant="outline" size="sm">Excel</Button>
                <Button variant="outline" size="sm">PDF</Button>
                <Button variant="outline" size="sm">Print</Button>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm">Search:</span>
                <Input placeholder="Search..." className="w-48" />
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sl.No</TableHead>
                  <TableHead>Product Code</TableHead>
                  <TableHead>Sage Code</TableHead>
                  <TableHead>Product Description</TableHead>
                  <TableHead>Selling Price</TableHead>
                  <TableHead>Tax/Vat %</TableHead>
                  <TableHead>VAT Code</TableHead>
                  <TableHead>Edit</TableHead>
                  <TableHead>Delete</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nonProducts?.map((item, index) => (
                  <TableRow key={item.id} className="hover:bg-gray-50">
                    <TableCell>{index + 1}</TableCell>
                    <TableCell className="text-blue-600">{item.productCode}</TableCell>
                    <TableCell>{item.sageCode}</TableCell>
                    <TableCell className="text-blue-600">{item.description}</TableCell>
                    <TableCell>{item.sellingPrice !== null ? `£${item.sellingPrice.toFixed(2)}` : '£0.00'}</TableCell>
                    <TableCell>{item.taxRate !== null ? `${item.taxRate}%` : '0%'}</TableCell>
                    <TableCell>{item.vatCode}</TableCell>
                    <TableCell>
                      <Link href={`/admin/non-product-edit/${item.id}`}>
                        <Button variant="ghost" size="sm" className="text-blue-600">
                          Edit
                        </Button>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600"
                        onClick={() => handleDelete(item.id)}
                        disabled={deleteNonProductMutation.isPending}
                      >
                        {deleteNonProductMutation.isPending ? "Deleting..." : "Delete"}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${item.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {item.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="p-4 border-t flex items-center justify-between">
              <span className="text-sm text-gray-500">Showing {nonProducts?.length || 0} entries</span>
              <div className="flex space-x-2">
                <Button variant="outline" size="sm">Previous</Button>
                <Button variant="outline" size="sm" className="bg-blue-600 text-white">1</Button>
                <Button variant="outline" size="sm">Next</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ViewNonProducts;
