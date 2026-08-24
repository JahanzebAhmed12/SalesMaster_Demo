import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, scheduleAuthError } from "@/lib/queryClient";
import { getApiUrl } from "@/lib/config";
import { HolidayRequest } from "@shared/schema";
import { Loader2, Plus, Eye, Edit, Trash2, Printer, Upload, FileText, CalendarIcon, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { usePayrollMutations } from "@/hooks/usePayrollMutations";
import { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";
import "react-day-picker/dist/style.css";
import { Pagination } from "@/components/ui/pagination";

const HolidayRequests = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { holidayRequest } = usePayrollMutations();
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [entitlementStartDate, setEntitlementStartDate] = useState<Date | undefined>(new Date());
  const [entitlementEndDate, setEntitlementEndDate] = useState<Date | undefined>(new Date(new Date().getFullYear() + 1, 3, 5)); // Default to next year April 5th
  const [showEntitlementReset, setShowEntitlementReset] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data: holidayRequestsResponse, isLoading, error } = useQuery({
    queryKey: ["/api/holiday-requests", currentPage, itemsPerPage, debouncedSearchTerm],
    queryFn: () => {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        per_page: itemsPerPage.toString(),
        ...(debouncedSearchTerm && { search: debouncedSearchTerm })
      });
      return apiRequest("GET", `/api/holiday-requests?${params}`);
    },
  });

  const holidayRequests = holidayRequestsResponse?.data || [];
  const pagination = holidayRequestsResponse?.pagination;



  // Use the standardized mutations
  const uploadFormMutation = holidayRequest.uploadSignedForm;
  const resetEntitlementMutation = holidayRequest.resetEntitlement;
  const deleteFormMutation = holidayRequest.deleteSignedForm;
  const deleteRequestMutation = holidayRequest.delete;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'granted':
        return <Badge className="bg-green-100 text-green-800">Granted</Badge>;
      case 'not_granted':
        return <Badge className="bg-red-100 text-red-800">Not Granted</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type (PDF, images)
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: "Please select a PDF or image file (JPG, PNG)",
          variant: "destructive",
        });
        return;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please select a file smaller than 10MB",
          variant: "destructive",
        });
        return;
      }

      setSelectedFile(file);
    }
  };

  const handleUpload = (id: number) => {
    if (!selectedFile) {
      toast({
        title: "No file selected",
        description: "Please select a file to upload",
        variant: "destructive",
      });
      return;
    }

    uploadFormMutation.mutate({ id, file: selectedFile }, {
      onSuccess: () => {
        setUploadingId(null);
        setSelectedFile(null);
        // Refresh the holiday requests data to show the updated signed form status
        queryClient.invalidateQueries({ queryKey: ["/api/holiday-requests"] });
      }
    });
  };

  const handleResetEntitlement = () => {
    if (!entitlementStartDate || !entitlementEndDate) {
      toast({
        title: "Missing dates",
        description: "Please select both start and end dates for the new holiday year",
        variant: "destructive",
      });
      return;
    }

    if (entitlementStartDate >= entitlementEndDate) {
      toast({
        title: "Invalid date range",
        description: "Start date must be before end date",
        variant: "destructive",
      });
      return;
    }

    const confirmReset = window.confirm(
      `Are you sure you want to start a new holiday year?\n\nThis will:\n- Set the holiday year from ${format(entitlementStartDate, "dd/MM/yyyy")} to ${format(entitlementEndDate, "dd/MM/yyyy")}\n- Give all employees their full entitlement for the new year\n- Archive previous holiday requests\n\nThis action cannot be undone.`
    );

    if (confirmReset) {
      resetEntitlementMutation.mutate({
        startDate: format(entitlementStartDate, "yyyy-MM-dd"),
        endDate: format(entitlementEndDate, "yyyy-MM-dd")
      }, {
        onSuccess: (response) => {
          setShowEntitlementReset(false);
          // Show detailed success message
          toast({
            title: "Holiday Year Reset Successfully",
            description: `${response.employeesProcessed} employees reset. ${response.previousRequestsArchived} previous requests archived.`,
          });
          // Refresh the holiday requests to show updated data
          queryClient.invalidateQueries({ queryKey: ["/api/holiday-requests"] });
          // Also invalidate employee entitlement queries to refresh the holiday request form
          queryClient.invalidateQueries({ queryKey: ["employee-entitlement"] });
        }
      });
    }
  };

  const handleViewSignedForm = async (request: HolidayRequest) => {
    if (request.signedFormPath) {
      try {
                const url = getApiUrl(`/api/holiday-requests/${request.id}/signed-form`);


        const token = localStorage.getItem('jwt_token');
        const headers: Record<string, string> = {};

        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        // Fetch the file with authorization
        const response = await fetch(url, {
          method: 'GET',
          headers,
          credentials: 'include',
        });

        if (!response.ok) {
          if (response.status === 401) {
            scheduleAuthError();
            throw new Error('Session expired. Please login again.');
          }
          throw new Error('Failed to load signed form');
        }

        // Create blob URL and open in new window
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const newWindow = window.open(blobUrl, '_blank');

        // Clean up blob URL after a delay
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to load signed form",
          variant: "destructive",
        });
      }
    } else {
      toast({
        title: "No signed form",
        description: "No signed form has been uploaded for this request",
        variant: "destructive",
      });
    }
  };

  const handleDeleteSignedForm = (id: number) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete the signed form? This action cannot be undone."
    );
    if (confirmDelete) {
      deleteFormMutation.mutate(id);
    }
  };

  const handleDeleteRequest = (request: HolidayRequest) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete the holiday request for ${request.employeeName}? This action cannot be undone.`
    );
    if (confirmDelete) {
      deleteRequestMutation.mutate(request.id);
    }
  };



  if (error) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <p className="text-red-500 mb-4">Error loading holiday requests: {error.message}</p>
          <Button onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6">
        <div className="mb-6 flex flex-col space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Holiday Requests</h1>
              <p className="text-sm text-gray-500">Manage employee holiday requests</p>
            </div>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                onClick={() => setShowEntitlementReset(true)}
                className="border-orange-500 text-orange-600 hover:bg-orange-50"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                New Holiday Year
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const response = await apiRequest("GET", "/api/employees/entitlements");
                    console.log("Current Employee Entitlements:", response);
                    toast({
                      title: "Entitlements Check",
                      description: `${response.totalEmployees} employees found. Check console for details.`,
                    });
                  } catch (error) {
                    toast({
                      title: "Error",
                      description: "Failed to fetch entitlements",
                      variant: "destructive",
                    });
                  }
                }}
                className="border-blue-500 text-blue-600 hover:bg-blue-50"
              >
                <Eye className="h-4 w-4 mr-2" />
                Check Entitlements
              </Button>
              <Link href="/payroll/holiday-requests/new">
                <Button className="bg-blue-600 text-white hover:bg-blue-700">
                  <Plus className="h-4 w-4 mr-2" />
                  New Request
                </Button>
              </Link>
            </div>
          </div>
          
          {/* Search Bar */}
          <div className="flex items-center space-x-4">
            <div className="flex-1 max-w-md">
              <Input
                placeholder="Search by employee name, job title, or status..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1); // Reset to first page when searching
                }}
                className="w-full"
              />
            </div>
            {pagination && (
              <div className="text-sm text-gray-500">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, pagination.total)} of {pagination.total} requests
              </div>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center text-blue-600">Holiday Requests</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span>Loading holiday requests...</span>
              </div>
            ) : holidayRequests.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">
                  {debouncedSearchTerm ? `No holiday requests found matching "${debouncedSearchTerm}".` : "No holiday requests found."}
                </p>
                {!debouncedSearchTerm && (
                  <Link href="/payroll/holiday-requests/new">
                    <Button className="mt-4 bg-blue-600 text-white hover:bg-blue-700">
                      <Plus className="h-4 w-4 mr-2" />
                      Create First Request
                    </Button>
                  </Link>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-300 px-4 py-2 text-left">Employee Name</th>
                      <th className="border border-gray-300 px-4 py-2 text-left">Job Title</th>
                      <th className="border border-gray-300 px-4 py-2 text-left">Days Requested</th>
                      <th className="border border-gray-300 px-4 py-2 text-left">Last Date at Work</th>
                      <th className="border border-gray-300 px-4 py-2 text-left">Return Date</th>
                      <th className="border border-gray-300 px-4 py-2 text-left">Status</th>
                      <th className="border border-gray-300 px-4 py-2 text-left">Days Granted</th>
                      <th className="border border-gray-300 px-4 py-2 text-left">Remaining Entitlement</th>
                      <th className="border border-gray-300 px-4 py-2 text-left">Signed Form</th>
                      <th className="border border-gray-300 px-4 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holidayRequests.map((request: HolidayRequest) => (
                      <tr key={request.id} className="hover:bg-gray-50">
                        <td className="border border-gray-300 px-4 py-2">{request.employeeName}</td>
                        <td className="border border-gray-300 px-4 py-2">{request.jobTitle || '-'}</td>
                        <td className="border border-gray-300 px-4 py-2 text-center">{request.totalDaysRequested}</td>
                        <td className="border border-gray-300 px-4 py-2">
                          {request.lastDateAtWork ? format(new Date(request.lastDateAtWork), 'dd/MM/yyyy') : '-'}
                        </td>
                        <td className="border border-gray-300 px-4 py-2">
                          {request.returnDateToWork ? format(new Date(request.returnDateToWork), 'dd/MM/yyyy') : '-'}
                        </td>
                        <td className="border border-gray-300 px-4 py-2">
                          {getStatusBadge(request.status)}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center">
                          {request.daysGranted || '-'}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center">
                          {request.daysLeftEntitlement !== undefined ? request.daysLeftEntitlement : '-'}
                        </td>
                        <td className="border border-gray-300 px-4 py-2">
                          <div className="flex space-x-2">
                            {request.signedFormPath ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="View signed form"
                                  onClick={() => handleViewSignedForm(request)}
                                >
                                  <FileText className="h-4 w-4 text-green-600" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="Delete signed form"
                                  onClick={() => handleDeleteSignedForm(request.id)}
                                  disabled={deleteFormMutation.isPending}
                                >
                                  {deleteFormMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4 text-red-600" />
                                  )}
                                </Button>
                              </>
                            ) : (
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    title="Upload signed form"
                                    onClick={() => setUploadingId(request.id)}
                                  >
                                    <Upload className="h-4 w-4 text-blue-600" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Upload Signed Holiday Form</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <div>
                                      <Label htmlFor="signedForm">Select signed form (PDF or Image)</Label>
                                      <Input
                                        id="signedForm"
                                        type="file"
                                        accept=".pdf,.jpg,.jpeg,.png"
                                        onChange={handleFileSelect}
                                        className="mt-2"
                                      />
                                      <p className="text-sm text-gray-500 mt-1">
                                        Accepted formats: PDF, JPG, PNG (Max 10MB)
                                      </p>
                                    </div>
                                    {selectedFile && (
                                      <div className="p-3 bg-gray-50 rounded">
                                        <p className="text-sm">
                                          <strong>Selected file:</strong> {selectedFile.name}
                                        </p>
                                        <p className="text-sm text-gray-600">
                                          Size: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                                        </p>
                                      </div>
                                    )}
                                    <div className="flex justify-end space-x-2">
                                      <Button
                                        variant="outline"
                                        onClick={() => {
                                          setUploadingId(null);
                                          setSelectedFile(null);
                                        }}
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        onClick={() => handleUpload(request.id)}
                                        disabled={!selectedFile || uploadFormMutation.isPending}
                                      >
                                        {uploadFormMutation.isPending ? (
                                          <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Uploading...
                                          </>
                                        ) : (
                                          <>
                                            <Upload className="h-4 w-4 mr-2" />
                                            Upload
                                          </>
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            )}
                          </div>
                        </td>
                        <td className="border border-gray-300 px-4 py-2">
                          <div className="flex space-x-2">
                            <Link href={`/payroll/holiday-requests/view/${request.id}`}>
                              <Button variant="ghost" size="sm" title="View request">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Link href={`/payroll/holiday-requests/edit/${request.id}`}>
                              <Button variant="ghost" size="sm" title="Edit request">
                                <Edit className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Print form"
                              onClick={() => window.open(`/print/holiday-request/${request.id}`, '_blank')}
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Delete request"
                              onClick={() => handleDeleteRequest(request)}
                              disabled={deleteRequestMutation.isPending}
                            >
                              {deleteRequestMutation.isPending ? (
                                <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4 text-red-600" />
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            {/* Pagination */}
            {pagination && pagination.pages > 1 && (
              <div className="mt-6">
                <Pagination
                  currentPage={currentPage}
                  totalPages={pagination.pages}
                  totalItems={pagination.total}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                  onItemsPerPageChange={(newItemsPerPage) => {
                    setItemsPerPage(newItemsPerPage);
                    setCurrentPage(1);
                  }}
                  itemsPerPageOptions={[10, 25, 50, 100]}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Entitlement Reset Dialog */}
        <Dialog open={showEntitlementReset} onOpenChange={setShowEntitlementReset}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-orange-600">Start New Holiday Year</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <CalendarIcon className="h-5 w-5 text-blue-400" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-blue-800">
                      New Holiday Year Reset
                    </h3>
                    <div className="mt-2 text-sm text-blue-700">
                      <p>This will give all employees their full holiday entitlement for the new year and archive previous requests.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="entitlementStartDate" className="block text-sm font-medium mb-2">
                    Holiday Year Start Date
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !entitlementStartDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {entitlementStartDate ? (
                          format(entitlementStartDate, "PPP")
                        ) : (
                          <span>Pick start date</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <DayPicker
                        mode="single"
                        selected={entitlementStartDate}
                        onSelect={setEntitlementStartDate}
                        captionLayout="dropdown-buttons"
                        fromYear={new Date().getFullYear()}
                        toYear={new Date().getFullYear() + 5}
                        className="p-3"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <Label htmlFor="entitlementEndDate" className="block text-sm font-medium mb-2">
                    Holiday Year End Date
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !entitlementEndDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {entitlementEndDate ? (
                          format(entitlementEndDate, "PPP")
                        ) : (
                          <span>Pick end date</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <DayPicker
                        mode="single"
                        selected={entitlementEndDate}
                        onSelect={setEntitlementEndDate}
                        captionLayout="dropdown-buttons"
                        fromYear={new Date().getFullYear()}
                        toYear={new Date().getFullYear() + 5}
                        className="p-3"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="text-sm text-gray-600 bg-green-50 p-3 rounded-lg border border-green-200">
                <p className="font-medium mb-1 text-green-800">Holiday Year Summary:</p>
                <p>From: {entitlementStartDate ? format(entitlementStartDate, "dd/MM/yyyy") : "Not selected"}</p>
                <p>To: {entitlementEndDate ? format(entitlementEndDate, "dd/MM/yyyy") : "Not selected"}</p>
                <p className="text-green-700 text-xs mt-2">✓ Each employee will get their full individual entitlement for the new year</p>
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setShowEntitlementReset(false)}
                  disabled={resetEntitlementMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleResetEntitlement}
                  disabled={!entitlementStartDate || !entitlementEndDate || resetEntitlementMutation.isPending}
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                >
                  {resetEntitlementMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Starting New Year...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Start New Holiday Year
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default HolidayRequests;