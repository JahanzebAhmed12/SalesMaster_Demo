import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertUserSchema } from "@shared/schema";
import { Plus } from "lucide-react";
import type { User, InsertUser } from "@shared/schema";
import { z } from "zod";
import ProtectedRoute from "@/components/protected-route";

function UsersContent() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("All");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  
  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: () => apiRequest("GET", "/api/users")
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Success",
        description: "User deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete user",
        variant: "destructive",
      });
    },
  });

  const filteredUsers = users?.filter((user: User) => {
    const matchesSearch = user.username.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === "All" || user.userType === filterType.toLowerCase();
    return matchesSearch && matchesType;
  }) || [];

  const handleDelete = (id: number, username: string) => {
    if (confirm(`Are you sure you want to delete user "${username}"?`)) {
      deleteUserMutation.mutate(id);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b border-[hsl(210,16%,93%)] p-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-medium tropifruit-text">Users List</h2>
          <div className="text-sm tropifruit-text-secondary">
            TROPIFRUIT UK LTD, 3 Dolphin Way, Porfield, RM16 1NZ...
          </div>
        </div>
      </div>

      <div className="p-6 flex-1 overflow-auto">
        <div className="bg-white rounded-lg shadow-sm border border-[hsl(210,16%,93%)]">
          <div className="p-6 border-b border-[hsl(210,16%,93%)]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All</SelectItem>
                    <SelectItem value="Admin">Admin</SelectItem>
                    <SelectItem value="User">User</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm tropifruit-text-secondary">records per page</span>
                <Button 
                  onClick={() => setLocation("/admin/user-database-add")}
                  className="tropifruit-success hover:bg-green-600 ml-4"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add New User
                </Button>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm tropifruit-text-secondary">Search:</span>
                <Input
                  type="text"
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64"
                />
              </div>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-[hsl(210,16%,93%)]">
                <tr>
                  <th className="text-left p-4 text-sm font-medium tropifruit-text">S.No</th>
                  <th className="text-left p-4 text-sm font-medium tropifruit-text">USER TYPE</th>
                  <th className="text-left p-4 text-sm font-medium tropifruit-text">USER NAME</th>
                  <th className="text-left p-4 text-sm font-medium tropifruit-text">USER PASSWORD</th>
                  <th className="text-center p-4 text-sm font-medium tropifruit-text">Edit</th>
                  <th className="text-center p-4 text-sm font-medium tropifruit-text">Delete</th>
                  <th className="text-left p-4 text-sm font-medium tropifruit-text">Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center tropifruit-text-secondary">
                      Loading...
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center tropifruit-text-secondary">
                      {users?.length === 0 ? "No users found" : "No users match your search"}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user, index) => (
                    <tr key={user.id} className="border-b border-[hsl(210,16%,93%)] hover:bg-gray-50">
                      <td className="p-4 text-sm tropifruit-text">{index + 1}</td>
                      <td className="p-4 text-sm tropifruit-text">{user.userType}</td>
                      <td className="p-4 text-sm tropifruit-text">{user.username}</td>
                      <td className="p-4 text-sm tropifruit-text-secondary">••••••••••</td>
                      <td className="p-4 text-center">
                        <Link href={`/admin/user-database-add/${user.id}`}>
                          <button className="text-[hsl(207,90%,54%)] hover:text-[hsl(207,75%,45%)]">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                            </svg>
                          </button>
                        </Link>
                      </td>
                      <td className="p-4 text-center">
                        <button 
                          onClick={() => handleDelete(user.id, user.username)}
                          className="text-red-500 hover:text-red-700"
                          disabled={deleteUserMutation.isPending}
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                          </svg>
                        </button>
                      </td>
                      <td className="p-4">
                        <span className="tropifruit-success px-2 py-1 rounded text-xs font-medium">
                          {user.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {filteredUsers.length > 0 && (
            <div className="p-4 border-t border-[hsl(210,16%,93%)]">
              <div className="flex items-center justify-between">
                <div className="text-sm tropifruit-text-secondary">
                  Showing 1 to {filteredUsers.length} of {filteredUsers.length} entries
                </div>
                <div className="flex items-center space-x-2">
                  <button className="px-3 py-1 text-sm tropifruit-text-secondary hover:text-[hsl(207,90%,54%)]">
                    ← Previous
                  </button>
                  <div className="w-64 bg-gray-200 rounded-full h-2">
                    <div className="tropifruit-button-primary h-2 rounded-full w-full"></div>
                  </div>
                  <button className="px-3 py-1 text-sm tropifruit-text-secondary hover:text-[hsl(207,90%,54%)]">
                    Next →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Users() {
  return (
    <ProtectedRoute requireAdmin>
      <UsersContent />
    </ProtectedRoute>
  );
}
