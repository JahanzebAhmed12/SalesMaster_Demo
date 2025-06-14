import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { insertUserSchema } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { User, InsertUser } from "@shared/schema";

export default function UserEdit() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const userId = parseInt(params.id || "0");

  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/api/users", userId],
    queryFn: async () => {
      const response = await fetch(`/api/users/${userId}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch user");
      }
      return response.json();
    },
  });

  const form = useForm<InsertUser>({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      username: "",
      password: "",
      userType: "user",
      status: "Active",
    },
    values: user ? {
      username: user.username,
      password: user.password,
      userType: user.userType,
      status: user.status,
    } : undefined,
  });

  const updateUserMutation = useMutation({
    mutationFn: async (data: InsertUser) => {
      return apiRequest("PUT", `/api/users/${userId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
      toast({
        title: "Success",
        description: "User updated successfully",
      });
      setLocation("/users");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update user",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertUser) => {
    updateUserMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        <div className="bg-white border-b border-[hsl(210,16%,93%)] p-6">
          <h2 className="text-xl font-medium tropifruit-text">Loading...</h2>
        </div>
        <div className="p-6 flex-1 flex items-center justify-center">
          <div className="text-center tropifruit-text-secondary">Loading user data...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-full flex flex-col">
        <div className="bg-white border-b border-[hsl(210,16%,93%)] p-6">
          <h2 className="text-xl font-medium tropifruit-text">User Not Found</h2>
        </div>
        <div className="p-6 flex-1 flex items-center justify-center">
          <div className="text-center tropifruit-text-secondary">User not found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b border-[hsl(210,16%,93%)] p-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-medium tropifruit-text">Users List</h2>
            <button 
              onClick={() => setLocation("/users")}
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
            <h3 className="text-lg font-medium tropifruit-text mb-6">Edit User</h3>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-4 gap-6 items-center">
                  <FormLabel className="text-sm font-medium tropifruit-text">USER TYPE</FormLabel>
                  <div className="col-span-3">
                    <FormField
                      control={form.control}
                      name="userType"
                      render={({ field }) => (
                        <FormItem>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                            <Input type="password" {...field} />
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
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                    disabled={updateUserMutation.isPending}
                  >
                    {updateUserMutation.isPending ? "Saving..." : "Save"}
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
