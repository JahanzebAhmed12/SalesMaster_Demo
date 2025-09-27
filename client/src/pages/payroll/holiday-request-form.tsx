import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Link, useLocation, useParams } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertHolidayRequestSchema, HolidayRequest, InsertHolidayRequest, Employee } from "@shared/schema";
import { useEffect } from "react";
import { Loader2, CalendarIcon, Printer } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { usePayrollMutations } from "@/hooks/usePayrollMutations";

const HolidayRequestForm = () => {
  const { id } = useParams<{ id: string }>();
  const requestId = id ? parseInt(id) : undefined;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { holidayRequest } = usePayrollMutations();

  const form = useForm<InsertHolidayRequest>({
    resolver: zodResolver(insertHolidayRequestSchema),
    defaultValues: {
      employeeId: 0,
      employeeName: "",
      jobTitle: "",
      totalDaysRequested: 1,
      lastDateAtWork: "",
      returnDateToWork: "",
      signedByEmployee: "",
      dateByEmployee: "",
      status: "pending",
      daysGranted: undefined,
      daysLeftEntitlement: undefined,
      managerName: "",
      signedByManager: "",
      datedByManager: "",
      managerComments: "",
    },
    mode: "onChange",
  });

  // Fetch employees for dropdown
  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: () => apiRequest("GET", "/api/employees"),
  });

  // Fetch employee entitlement information when employee is selected
  const { data: entitlementInfo, isLoading: isLoadingEntitlement } = useQuery({
    queryKey: ["employee-entitlement", form.watch("employeeId")],
    queryFn: () => apiRequest("GET", `/api/employees/${form.watch("employeeId")}/entitlement?t=${Date.now()}`),
    enabled: !!form.watch("employeeId") && form.watch("employeeId") > 0,
    staleTime: 0, // Always refetch to get latest data
    cacheTime: 0, // Don't cache the result
  });

  // Fetch existing request if editing
  const { data: existingRequest, isLoading, isError, error } = useQuery({
    queryKey: ["holiday-request", requestId],
    queryFn: () => apiRequest("GET", `/api/holiday-requests/${requestId}`),
    enabled: !!requestId,
  });

  // Use standardized mutations with proper navigation handling
  const createRequestMutation = useMutation({
    mutationFn: async (newRequest: InsertHolidayRequest) => {
      return apiRequest("POST", "/api/holiday-requests", newRequest);
    },
    onSuccess: async () => {
      // Wait for query invalidation to complete before navigating
      await queryClient.invalidateQueries({ queryKey: ["/api/holiday-requests"] });
      toast({
        title: "Success!",
        description: "Holiday request created successfully.",
      });
      // Small delay to ensure the query cache is updated
      setTimeout(() => {
        setLocation("/payroll/holiday-requests");
      }, 100);
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to create holiday request: ${error.message}`,
      });
    },
  });

  const updateRequestMutation = useMutation({
    mutationFn: (updatedRequest: HolidayRequest) => {
      return apiRequest("PUT", `/api/holiday-requests/${requestId}`, updatedRequest);
    },
    onSuccess: async () => {
      // Wait for query invalidation to complete before navigating
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["holiday-request", requestId] }),
        queryClient.invalidateQueries({ queryKey: ["/api/holiday-requests"] })
      ]);
      toast({
        title: "Success!",
        description: "Holiday request updated successfully.",
      });
      // Small delay to ensure the query cache is updated
      setTimeout(() => {
        setLocation("/payroll/holiday-requests");
      }, 100);
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to update holiday request: ${error.message}`,
      });
    },
  });

  useEffect(() => {
    if (existingRequest) {
      form.reset(existingRequest);
    }
  }, [existingRequest, form]);

  // Handle employee selection
  const handleEmployeeChange = (employeeId: string) => {
    const employee = employees.find((emp: Employee) => emp.id === parseInt(employeeId));
    if (employee) {
      form.setValue("employeeId", employee.id!);
      form.setValue("employeeName", employee.fullName);
      form.setValue("jobTitle", employee.position || "");
    }
  };

  const onSubmit = (data: InsertHolidayRequest) => {
    // Auto-calculate days left from entitlement if we have entitlement info
    if (entitlementInfo && data.daysGranted) {
      data.daysLeftEntitlement = entitlementInfo.remainingDays - data.daysGranted;
    }
    
    if (requestId) {
      updateRequestMutation.mutate({ ...data, id: requestId } as HolidayRequest);
    } else {
      createRequestMutation.mutate(data);
    }
  };

  const formTitle = requestId ? "Edit Holiday Request" : "New Holiday Request";
  const buttonText = requestId ? (updateRequestMutation.isPending ? "Updating..." : "Update") : (createRequestMutation.isPending ? "Saving..." : "Save");

  if (isLoading && requestId) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Loading holiday request...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-red-500">Error loading holiday request: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Holiday Requests</h1>
            <p className="text-sm text-gray-500">{formTitle}</p>
          </div>
          <div className="flex space-x-2">
            <Link href="/payroll/holiday-requests">
              <Button variant="outline" className="bg-blue-600 text-white hover:bg-blue-700">
                View Requests
              </Button>
            </Link>
            {requestId && (
              <Button
                variant="outline"
                onClick={() => window.open(`/print/holiday-request/${requestId}`, '_blank')}
                className="bg-green-600 text-white hover:bg-green-700"
              >
                <Printer className="h-4 w-4 mr-2" />
                Print Form
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center text-blue-600">TROPIFRUIT U.K. HOLIDAY REQUEST FORM</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Employee Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Employee Information</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="employeeId" className="block text-sm font-medium mb-2">Select Employee *</label>
                    <Select 
                      onValueChange={handleEmployeeChange}
                      defaultValue={form.watch("employeeId")?.toString() || ""}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select employee" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((employee: Employee) => (
                          <SelectItem key={employee.id} value={employee.id!.toString()}>
                            {employee.fullName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {form.formState.errors.employeeId && (
                      <p className="text-red-500 text-xs mt-1">{form.formState.errors.employeeId.message}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="employeeName" className="block text-sm font-medium mb-2">Name of Employee *</label>
                    <Input 
                      id="employeeName" 
                      placeholder="Employee name" 
                      {...form.register("employeeName")}
                      readOnly
                      className="bg-gray-50"
                    />
                    {form.formState.errors.employeeName && (
                      <p className="text-red-500 text-xs mt-1">{form.formState.errors.employeeName.message}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="jobTitle" className="block text-sm font-medium mb-2">Job Title</label>
                    <Input 
                      id="jobTitle" 
                      placeholder="Job title" 
                      {...form.register("jobTitle")}
                    />
                  </div>

                  <div>
                    <label htmlFor="totalDaysRequested" className="block text-sm font-medium mb-2">Total Number of Days *</label>
                    <Input 
                      id="totalDaysRequested" 
                      type="number"
                      min="1"
                      placeholder="Number of days" 
                      {...form.register("totalDaysRequested", { valueAsNumber: true })}
                    />
                    {form.formState.errors.totalDaysRequested && (
                      <p className="text-red-500 text-xs mt-1">{form.formState.errors.totalDaysRequested.message}</p>
                    )}
                  </div>
                </div>

                {/* Employee Entitlement Information */}
                {entitlementInfo && (
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-sm font-semibold text-blue-900">Holiday Entitlement Information</h4>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          queryClient.invalidateQueries({ queryKey: ["employee-entitlement", form.watch("employeeId")] });
                          toast({
                            title: "Refreshed",
                            description: "Entitlement information updated",
                          });
                        }}
                        className="text-blue-600 hover:text-blue-800 h-6 px-2"
                      >
                        <Loader2 className="h-3 w-3 mr-1" />
                        Refresh
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-blue-700 font-medium">Annual Entitlement:</span>
                        <div className="text-blue-900 font-semibold">{entitlementInfo.entitlementDays} days</div>
                      </div>
                      <div>
                        <span className="text-blue-700 font-medium">Used This Year:</span>
                        <div className="text-blue-900 font-semibold">{entitlementInfo.usedDays} days</div>
                      </div>
                      <div>
                        <span className="text-blue-700 font-medium">Remaining:</span>
                        <div className={`font-semibold ${entitlementInfo.remainingDays > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {entitlementInfo.remainingDays} days
                        </div>
                      </div>
                      <div>
                        <span className="text-blue-700 font-medium">Year:</span>
                        <div className="text-blue-900 font-semibold">{entitlementInfo.currentYear}</div>
                      </div>
                    </div>
                    {entitlementInfo.remainingDays < form.watch("totalDaysRequested") && (
                      <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded text-red-700 text-sm">
                        <strong>Warning:</strong> Requested days ({form.watch("totalDaysRequested")}) exceed remaining entitlement ({entitlementInfo.remainingDays} days).
                      </div>
                    )}
                  </div>
                )}

                {isLoadingEntitlement && form.watch("employeeId") > 0 && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
                    <div className="flex items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      <span className="text-sm text-gray-600">Loading entitlement information...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Holiday Dates */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Holiday Dates</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="lastDateAtWork" className="block text-sm font-medium mb-2">Last Date at Work *</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !form.watch("lastDateAtWork") && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {form.watch("lastDateAtWork") ? (
                            format(new Date(form.watch("lastDateAtWork")), "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={form.watch("lastDateAtWork") ? new Date(form.watch("lastDateAtWork")) : undefined}
                          onSelect={(date) =>
                            form.setValue(
                              "lastDateAtWork",
                              date ? format(date, "yyyy-MM-dd") : ""
                            )
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    {form.formState.errors.lastDateAtWork && (
                      <p className="text-red-500 text-xs mt-1">{form.formState.errors.lastDateAtWork.message}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="returnDateToWork" className="block text-sm font-medium mb-2">Return Date to Work *</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !form.watch("returnDateToWork") && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {form.watch("returnDateToWork") ? (
                            format(new Date(form.watch("returnDateToWork")), "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={form.watch("returnDateToWork") ? new Date(form.watch("returnDateToWork")) : undefined}
                          onSelect={(date) =>
                            form.setValue(
                              "returnDateToWork",
                              date ? format(date, "yyyy-MM-dd") : ""
                            )
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    {form.formState.errors.returnDateToWork && (
                      <p className="text-red-500 text-xs mt-1">{form.formState.errors.returnDateToWork.message}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Employee Signature */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Employee Signature</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="signedByEmployee" className="block text-sm font-medium mb-2">Signed by Employee</label>
                    <Input 
                      id="signedByEmployee" 
                      placeholder="Employee signature" 
                      {...form.register("signedByEmployee")}
                    />
                  </div>

                  <div>
                    <label htmlFor="dateByEmployee" className="block text-sm font-medium mb-2">Date by Employee</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !form.watch("dateByEmployee") && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {form.watch("dateByEmployee") ? (
                            format(new Date(form.watch("dateByEmployee")), "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={form.watch("dateByEmployee") ? new Date(form.watch("dateByEmployee")) : undefined}
                          onSelect={(date) =>
                            form.setValue(
                              "dateByEmployee",
                              date ? format(date, "yyyy-MM-dd") : ""
                            )
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>

              {/* Management Decision */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Management Decision</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label htmlFor="status" className="block text-sm font-medium mb-2">Status</label>
                    <Select 
                      onValueChange={(value) => form.setValue("status", value as "pending" | "granted" | "not_granted")}
                      defaultValue={form.watch("status") || "pending"}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="granted">Granted</SelectItem>
                        <SelectItem value="not_granted">Not Granted</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label htmlFor="daysGranted" className="block text-sm font-medium mb-2">Days Granted</label>
                    <Input 
                      id="daysGranted" 
                      type="number"
                      min="0"
                      placeholder="Days granted" 
                      {...form.register("daysGranted", { valueAsNumber: true })}
                    />
                  </div>

                  <div>
                    <label htmlFor="daysLeftEntitlement" className="block text-sm font-medium mb-2">Days Left from Entitlement</label>
                    <Input 
                      id="daysLeftEntitlement" 
                      type="number"
                      min="0"
                      placeholder="Days left" 
                      {...form.register("daysLeftEntitlement", { valueAsNumber: true })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="managerName" className="block text-sm font-medium mb-2">Manager Name</label>
                    <Input 
                      id="managerName" 
                      placeholder="Manager name" 
                      {...form.register("managerName")}
                    />
                  </div>

                  <div>
                    <label htmlFor="signedByManager" className="block text-sm font-medium mb-2">Signed by Manager</label>
                    <Input 
                      id="signedByManager" 
                      placeholder="Manager signature" 
                      {...form.register("signedByManager")}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="datedByManager" className="block text-sm font-medium mb-2">Dated by Manager</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !form.watch("datedByManager") && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {form.watch("datedByManager") ? (
                            format(new Date(form.watch("datedByManager")), "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={form.watch("datedByManager") ? new Date(form.watch("datedByManager")) : undefined}
                          onSelect={(date) =>
                            form.setValue(
                              "datedByManager",
                              date ? format(date, "yyyy-MM-dd") : ""
                            )
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div>
                    <label htmlFor="managerComments" className="block text-sm font-medium mb-2">Manager Comments</label>
                    <Textarea 
                      id="managerComments" 
                      placeholder="Additional comments from manager" 
                      {...form.register("managerComments")}
                      rows={3}
                    />
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-center space-x-4 pt-6">
                <Link href="/payroll/holiday-requests">
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </Link>
                <Button 
                  type="submit" 
                  className="bg-blue-600 text-white hover:bg-blue-700"
                  disabled={createRequestMutation.isPending || updateRequestMutation.isPending}
                >
                  {createRequestMutation.isPending || updateRequestMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  {buttonText}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default HolidayRequestForm;