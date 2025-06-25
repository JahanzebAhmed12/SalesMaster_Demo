import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { z } from "zod";

// Profile update schema
const profileUpdateSchema = z.object({
  username: z.string().min(1, "Username is required"),
  email: z.string().email("Invalid email").nullable(),
  phone: z.string().nullable(),
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().optional(),
  confirmPassword: z.string().optional(),
}).refine((data) => {
  if (data.newPassword && data.newPassword.length > 0) {
    if (data.newPassword.length < 6) return false;
    return data.newPassword === data.confirmPassword;
  }
  return true;
}, {
  message: "Passwords don't match or new password is too short (min 6 characters)",
  path: ["confirmPassword"],
});

type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export default function UserProfile() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: userData, isLoading } = useQuery({
    queryKey: ["/api/users", user?.id],
    queryFn: async () => {
      const response = await fetch(`/api/users/${user?.id}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch user data");
      }
      return response.json();
    },
  });

  const form = useForm<ProfileUpdate>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: {
      username: userData?.username || "",
      email: userData?.email || "",
      phone: userData?.phone || "",
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    values: userData ? {
      username: userData.username,
      email: userData.email,
      phone: userData.phone,
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    } : undefined,
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileUpdate) => {
      return apiRequest("PUT", `/api/users/${user?.id}/profile`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", user?.id] });
      toast({
        title: "Profile Updated",
        description: "Your profile has been updated successfully.",
      });
      form.reset({
        username: form.getValues("username"),
        email: form.getValues("email"),
        phone: form.getValues("phone"),
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update profile. Please check your current password.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProfileUpdate) => {
    updateProfileMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-lg font-medium">Loading profile...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input {...field} type="tel" value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="border-t pt-6">
                <h3 className="text-lg font-medium mb-4">Change Password</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="currentPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Current Password</FormLabel>
                        <FormControl>
                          <Input {...field} type="password" />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New Password</FormLabel>
                        <FormControl>
                          <Input {...field} type="password" />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm New Password</FormLabel>
                        <FormControl>
                          <Input {...field} type="password" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button 
                  type="submit" 
                  className="bg-primary hover:bg-primary/90"
                  disabled={updateProfileMutation.isPending}
                >
                  {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
} 