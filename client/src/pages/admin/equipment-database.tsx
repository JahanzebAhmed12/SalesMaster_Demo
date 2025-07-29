import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Plus, Search } from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { Equipment } from "@shared/schema";
import PageLayout from "@/components/common/page-layout";

export default function EquipmentDatabase() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch equipment
  const { data: equipment = [], isLoading } = useQuery<Equipment[]>({
    queryKey: ["/api/equipment"],
    queryFn: () => apiRequest("GET", "/api/equipment"),
  });

  // Delete equipment mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/equipment/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
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
            <div className="flex items-center space-x-2">
              <Search className="w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search equipment..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
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