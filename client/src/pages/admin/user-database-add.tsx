import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { insertUserSchema } from "@shared/schema";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { InsertUser } from "@shared/schema";
import { useEffect } from "react";
import ProtectedRoute from "@/components/protected-route";
import { useInvalidateMutation } from "@/lib/queryClient";

function UserAddContent() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [match, params] = useRoute("/admin/user-database-add/:id");
  const userId = match ? params.id : null;
  const isEditMode = !!userId;

  // Create a modified schema for edit mode that makes password optional
  const editUserSchema = insertUserSchema.extend({
    password: z.string().optional()
  });

  const form = useForm<InsertUser>({
    resolver: zodResolver(isEditMode ? editUserSchema : insertUserSchema),
    defaultValues: {
      username: "",
      password: "",
      userType: "user",
      status: "Active",
      email: "",
      phone: "",
      dailyWage: 0
    },
  });

  // Debug: Watch form values
  const watchedValues = form.watch();
  useEffect(() => {
    console.log('Form values changed:', watchedValues);
  }, [watchedValues]);

  // Fetch user data if in edit mode
  const { data: userData, isLoading } = useQuery({
    queryKey: ["/api/users", userId],
    queryFn: () => apiRequest("GET", `/api/users/${userId}`),
    enabled: isEditMode,
  });

  // Update form with user data when it's loaded
  useEffect(() => {
    if (userData) {
      console.log('Loading user data:', userData);
      form.reset({
        username: userData.username,
        password: "", // Don't pre-fill password
        userType: userData.userType,
        status: userData.status,
        email: userData.email || "",
        phone: userData.phone || "",
        dailyWage: userData.dailyWage || 0
      });
      console.log('Form reset with values:', form.getValues());
    }
  }, [userData, form]);

  const addUserMutation = useInvalidateMutation(
    async (data: any) => {
      console.log('Sending data to API:', data);
      const response = isEditMode
        ? await apiRequest("PUT", `/api/users/${userId}`, data)
        : await apiRequest("POST", "/api/users", data);
      console.log('API response:', response);
      return response;
    },
    [{ queryKey: ["/api/users"] }, { queryKey: ["/api/users/attendance"] }],
    {
      onSuccess: (data) => {
        console.log('Mutation success:', data);
        toast({
          title: "Success",
          description: isEditMode ? "User updated successfully" : "User added successfully",
        });
        setLocation("/admin/user-setup");
      },
      onError: (error) => {
        console.error('Mutation error:', error);
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : `Failed to ${isEditMode ? 'update' : 'add'} user`,
          variant: "destructive",
        });
      },
    }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form submit event triggered');
    
    try {
      const formData = form.getValues();
      console.log('Form data:', formData);
      
      // Format data to match backend expectations
      const formattedData = {
        username: formData.username,
        userType: formData.userType, // Backend expects 'userType', not 'user_type'
        status: formData.status,
        // Only include optional fields if they have values
        ...(formData.email ? { email: formData.email } : {}),
        ...(formData.phone ? { phone: formData.phone } : {}),
        ...(formData.dailyWage ? { dailyWage: formData.dailyWage } : {}), // Backend expects 'dailyWage', not 'daily_wage'
        // Only include password if it's provided and not empty (for edit mode, empty password means don't change)
        ...(formData.password && formData.password.trim() !== "" ? { password: formData.password } : {})
      };
      
      console.log('Formatted data:', formattedData);
      await addUserMutation.mutateAsync(formattedData);
    } catch (error) {
      console.error('Form submission error:', error);
      toast({
        title: "Error",
        description: "Failed to submit form. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b border-[hsl(210,16%,93%)] p-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-medium tropifruit-text">{isEditMode ? 'Edit User' : 'Add New User'}</h2>
            <button 
              onClick={() => setLocation("/admin/user-setup")}
              className="text-sm text-[hsl(207,90%,54%)] hover:underline mt-1"
            >
              ← Back to Users List
            </button>
          </div>
          <div className="text-sm tropifruit-text-secondary">
            TROPIFRUIT UK LTD, 3 Dolphin Way, Porfield, RM16 1NZ...
          </div>
        </div>
      </div>

      <div className="p-6 flex-1">
        <div className="bg-white rounded-lg shadow-sm border border-[hsl(210,16%,93%)] max-w-2xl">
          <div className="p-6">
            <h3 className="text-lg font-medium tropifruit-text mb-6">{isEditMode ? 'Edit User' : 'Add User'}</h3>
            
            <Form {...form}>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-4 gap-6 items-center">
                  <FormLabel className="text-sm font-medium tropifruit-text">USER TYPE</FormLabel>
                  <div className="col-span-3">
                    <FormField
                      control={form.control}
                      name="userType"
                      render={({ field }) => (
                        <FormItem>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select user type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="admin">admin</SelectItem>
                              <SelectItem value="user">user</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-6 items-center">
                  <FormLabel className="text-sm font-medium tropifruit-text">USER NAME</FormLabel>
                  <div className="col-span-3">
                    <FormField
                      control={form.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-6 items-center">
                  <FormLabel className="text-sm font-medium tropifruit-text">USER PASSWORD</FormLabel>
                  <div className="col-span-3">
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input type="password" {...field} placeholder={isEditMode ? "Leave blank to keep current password" : ""} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-6 items-center">
                  <FormLabel className="text-sm font-medium tropifruit-text">STATUS</FormLabel>
                  <div className="col-span-3">
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Active">Active</SelectItem>
                              <SelectItem value="Inactive">Inactive</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-6">
                  <Button 
                    type="submit" 
                    className="tropifruit-success hover:bg-green-600"
                    disabled={addUserMutation.isPending}
                  >
                    {addUserMutation.isPending ? (isEditMode ? "Updating..." : "Adding...") : (isEditMode ? "Update User" : "Add User")}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UserAdd() {
  return (
  
      <UserAddContent />
   
  );
} 