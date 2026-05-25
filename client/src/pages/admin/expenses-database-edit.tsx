import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Expense } from "@shared/schema";

// Helper to get next expense code
function getNextExpenseCode(expenses: any[]) {
  const codes = expenses
    .map((e: any) => e.expenseCode)
    .filter((code: string) => /^E\d+$/i.test(code));
  const nums = codes.map((code: string) => parseInt(code.replace(/^E/i, ""), 10)).filter((n: number) => !isNaN(n));
  const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `E${nextNum}`;
}

export default function ExpenseForm() {
  const [, params] = useRoute("/admin/expenses-database-edit/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const isEditing = !!params?.id;
  const isViewMode = window.location.href.includes("view=true");

  const [formData, setFormData] = useState<Partial<Expense>>({
    expenseCode: "",
    expenseName: "",
    isActive: "Yes",
  });

  const { data: expense, isLoading } = useQuery<Expense>({
    queryKey: ["expenses", params?.id],
    queryFn: async () => {
      if (!params?.id) throw new Error("No ID provided");
      return apiRequest("GET", `/api/expenses/${params.id}`);
    },
    enabled: isEditing,
  });

  // Check if this expense has any entries (prevents name editing)
  const { data: entryCheck } = useQuery<{ hasEntries: boolean; count: number }>({
    queryKey: ["expense-has-entries", params?.id],
    queryFn: () => apiRequest("GET", `/api/expenses/${params!.id}/has-entries`),
    enabled: isEditing,
  });

  const nameIsLocked = false;

  const { data: expenses = [] } = useQuery<Expense[]>({
    queryKey: ["expenses", ""],
    queryFn: async () => apiRequest("GET", "/api/expenses"),
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (!isEditing) {
      const nextCode = getNextExpenseCode(expenses);
      setFormData((prev) => ({
        ...prev,
        expenseCode: prev.expenseCode || nextCode,
        sageCode: prev.sageCode || nextCode,
      }));
    }
  }, [isEditing, expenses]);

  useEffect(() => {
    if (expense) {
      setFormData(expense);
    }
  }, [expense]);

  const createMutation = useMutation({
    mutationFn: async (data: Partial<Expense>) => {
      return apiRequest("POST", "/api/expenses", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast({
        title: "Success",
        description: "Expense created successfully",
      });
      setLocation("/admin/expenses-database");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create expense",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<Expense>) => {
      if (!params?.id) throw new Error("No ID provided");
      return apiRequest("PUT", `/api/expenses/${params.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast({
        title: "Success",
        description: "Expense updated successfully",
      });
      setLocation("/admin/expenses-database");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update expense",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditing) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
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

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {isEditing ? "Edit Expense" : "Add Expense"}
        </h1>
        <div className="text-sm text-gray-600">
          TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ..
        </div>
      </div>

      <Card className="shadow-sm border border-gray-200">
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="expenseCode">Expense Code</Label>
                <Input
                  id="expenseCode"
                  value={formData.expenseCode || ""}
                  readOnly
                  placeholder="Enter expense code"
                  required
                  disabled={isViewMode}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sageCode">Sage Code</Label>
                <Input
                  id="sageCode"
                  value={formData.sageCode || ""}
                  readOnly
                  placeholder="Sage code"
                  disabled
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="expenseName">
                  Expense Name
                  {nameIsLocked && (
                    <span className="ml-2 text-xs text-amber-600 font-normal">
                      (locked — {entryCheck?.count} {entryCheck?.count === 1 ? 'entry' : 'entries'} exist)
                    </span>
                  )}
                </Label>
                <Input
                  id="expenseName"
                  value={formData.expenseName}
                  onChange={(e) => setFormData({ ...formData, expenseName: e.target.value })}
                  placeholder="Enter expense name"
                  required
                  disabled={isViewMode || nameIsLocked}
                  className={nameIsLocked ? "bg-gray-100 cursor-not-allowed" : ""}
                />
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <RadioGroup
                  value={formData.isActive}
                  onValueChange={(value) => setFormData({ ...formData, isActive: value })}
                  disabled={isViewMode}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="Yes" id="active" />
                    <Label htmlFor="active">Active</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="No" id="inactive" />
                    <Label htmlFor="inactive">Inactive</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <div className="flex justify-end space-x-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation("/admin/expenses-database")}
              >
                Cancel
              </Button>
              {!isViewMode && (
                <Button 
                  type="submit"
                  className="bg-blue-600 text-white hover:bg-blue-700"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {isEditing ? "Update" : "Save"}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
