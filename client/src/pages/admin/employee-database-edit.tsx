import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Link, useLocation, useParams } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { API_BASE_URL, useRelativeUrls } from "@/lib/config";
import { insertEmployeeSchema, Employee, InsertEmployee, employeeSchema } from "@shared/schema";
import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Upload, Download, Eye, FileText } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const EmployeeDatabaseEdit = () => {
  const { id } = useParams<{ id: string }>();
  const employeeId = id ? parseInt(id) : undefined;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [uploadingFiles, setUploadingFiles] = useState<{ [key: number]: boolean }>({});
  const [employeeDocuments, setEmployeeDocuments] = useState<any[]>([]);

  // Fetch employee documents if editing existing employee
  const { data: documents = [] } = useQuery({
    queryKey: ["employee-documents", employeeId],
    queryFn: () => apiRequest("GET", `/api/employees/${employeeId}/documents`),
    enabled: !!employeeId,
  });

  useEffect(() => {
    if (documents) {
      setEmployeeDocuments(documents);
    }
  }, [documents]);

  // Helper to get the correct API URL for file operations
  const getApiUrl = (endpoint: string) => {
    return useRelativeUrls() ? endpoint : `${API_BASE_URL}${endpoint}`;
  };

  // File upload handler
  const handleFileUpload = async (file: File, documentName: string, startDate?: string, endDate?: string) => {
    if (!employeeId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please save the employee first before uploading documents.",
      });
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentName', documentName);
    if (startDate) formData.append('startDate', startDate);
    if (endDate) formData.append('endDate', endDate);

    try {
      const response = await fetch(getApiUrl(`/api/employees/${employeeId}/documents`), {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Upload failed:', response.status, errorText);
        throw new Error(`Upload failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      
      // Refresh documents list
      queryClient.invalidateQueries({ queryKey: ["employee-documents", employeeId] });
      
      toast({
        title: "Success",
        description: "Document uploaded successfully.",
      });

      return result.document;
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: "Failed to upload document. Please try again.",
      });
      throw error;
    }
  };

  // Delete document handler
  const handleDeleteDocument = async (documentId: number) => {
    if (!window.confirm('Are you sure you want to delete this document?')) {
      return;
    }

    try {
      await apiRequest("DELETE", `/api/employees/documents/${documentId}`);
      
      // Refresh documents list
      queryClient.invalidateQueries({ queryKey: ["employee-documents", employeeId] });
      
      toast({
        title: "Success",
        description: "Document deleted successfully.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete document.",
      });
    }
  };

  const form = useForm<InsertEmployee>({
    resolver: zodResolver(insertEmployeeSchema),
    defaultValues: {
      fullName: "",
      title: "",
      homeAddress: "",
      homePhoneNumber: "",
      mobileNumber: "",
      dateOfBirth: null,
      maritalStatus: "",
      nationalInsuranceNumber: "",
      startDate: null,
      department: "",
      position: "",
      salary: null,
      probationPeriod: "",
      lineManager: "",
      term: "",
      status: "",
      bankName: "",
      branchName: "",
      branchAddress: "",
      accountNumber: "",
      sortCode: "",
      documents: [],
      isActive: "yes",
    },
    mode: "onChange",
  });

  const { fields: documentFields, append: appendDocument, remove: removeDocument } = useFieldArray({
    control: form.control,
    name: "documents"
  });

  const { data: existingEmployee, isLoading, isError, error } = useQuery({
    queryKey: ["employee", employeeId],
    queryFn: () => apiRequest("GET", `/api/employees/${employeeId}`),
    enabled: !!employeeId,
  });

  const createEmployeeMutation = useMutation({
    mutationFn: async (newEmployee: InsertEmployee) => {
      console.log('Creating employee with data:', newEmployee);
      try {
        const response = await apiRequest("POST", "/api/employees", newEmployee);
        console.log('Server response:', response);
        return response;
      } catch (error) {
        console.error('Error in mutation:', error);
        if (error instanceof Error) {
          throw new Error(`Failed to create employee: ${error.message}`);
        }
        throw new Error('Failed to create employee: Unknown error');
      }
    },
    onSuccess: (data) => {
      console.log('Mutation successful, response:', data);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast({
        title: "Success!",
        description: "Employee created successfully.",
      });
      form.reset();
      setTimeout(() => {
        setLocation("/admin/employee-database");
      }, 100);
    },
    onError: (error) => {
      console.error('Error creating employee:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to create employee: ${error.message}`,
      });
    },
  });

  const updateEmployeeMutation = useMutation({
    mutationFn: (updatedEmployee: Employee) => {
      console.log('Updating employee:', updatedEmployee);
      return apiRequest("PUT", `/api/employees/${employeeId}`, updatedEmployee);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast({
        title: "Success!",
        description: "Employee updated successfully.",
      });
      setLocation("/admin/employee-database");
    },
    onError: (error) => {
      console.error('Error updating employee:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to update employee: ${error.message}`,
      });
    },
  });

  useEffect(() => {
    if (existingEmployee) {
      const data = {
        ...existingEmployee,
        dateOfBirth: existingEmployee.dateOfBirth || null,
        startDate: existingEmployee.startDate || null,
      };
      form.reset(data);
    }
  }, [existingEmployee, form]);

  const onSubmit = (data: InsertEmployee) => {
    console.log('Form submitted with data:', data);
    console.log('Form is valid:', form.formState.isValid);
    console.log('Form errors:', form.formState.errors);
    
    if (employeeId) {
      console.log('Updating existing employee:', employeeId);
      updateEmployeeMutation.mutate({ ...data, id: employeeId } as Employee);
    } else {
      console.log('Creating new employee');
      createEmployeeMutation.mutate(data);
    }
  };

  const formTitle = employeeId ? "Edit Employee" : "Add Employee";
  const buttonText = employeeId ? (updateEmployeeMutation.isPending ? "Updating..." : "Update") : (createEmployeeMutation.isPending ? "Saving..." : "Save");

  if (isLoading && employeeId) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Loading employee details...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-red-500">Error loading employee: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Employee Database</h1>
            <p className="text-sm text-gray-500">{formTitle}</p>
          </div>
          <div className="flex space-x-2">
            <Link href="/admin/employee-database">
              <Button variant="outline" className="bg-blue-600 text-white hover:bg-blue-700">
                View Employees
              </Button>
            </Link>
            <Link href="/admin/employee-database-edit">
              <Button className="bg-blue-600 text-white hover:bg-blue-700">
                Add Employee
              </Button>
            </Link>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center text-blue-600">{formTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Personal Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Personal Information</h3>
                  
                  <div>
                    <label htmlFor="fullName" className="block text-sm font-medium mb-2">Full Name *</label>
                    <Input 
                      id="fullName" 
                      placeholder="Enter full name" 
                      {...form.register("fullName")}
                    />
                    {form.formState.errors.fullName && (
                      <p className="text-red-500 text-xs mt-1">{form.formState.errors.fullName.message}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="title" className="block text-sm font-medium mb-2">Title</label>
                    <Select 
                      onValueChange={(value) => form.setValue("title", value)}
                      defaultValue={form.watch("title") || ""}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select title" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Mr">Mr</SelectItem>
                        <SelectItem value="Mrs">Mrs</SelectItem>
                        <SelectItem value="Miss">Miss</SelectItem>
                        <SelectItem value="Ms">Ms</SelectItem>
                        <SelectItem value="Dr">Dr</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label htmlFor="homeAddress" className="block text-sm font-medium mb-2">Home Address</label>
                    <Textarea 
                      id="homeAddress" 
                      placeholder="Enter home address" 
                      {...form.register("homeAddress")}
                      rows={3}
                    />
                  </div>

                  <div>
                    <label htmlFor="homePhoneNumber" className="block text-sm font-medium mb-2">Home Phone Number</label>
                    <Input 
                      id="homePhoneNumber" 
                      placeholder="Enter home phone number" 
                      {...form.register("homePhoneNumber")}
                    />
                  </div>

                  <div>
                    <label htmlFor="mobileNumber" className="block text-sm font-medium mb-2">Mobile Number</label>
                    <Input 
                      id="mobileNumber" 
                      placeholder="Enter mobile number" 
                      {...form.register("mobileNumber")}
                    />
                  </div>

                  <div>
                    <label htmlFor="dateOfBirth" className="block text-sm font-medium mb-2">Date of Birth</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !form.watch("dateOfBirth") && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {(() => {
                            const dateStr = form.watch("dateOfBirth");
                            return dateStr ? (
                              format(new Date(dateStr), "PPP")
                            ) : (
                              <span>Pick a date</span>
                            );
                          })()}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={(() => {
                            const dateStr = form.watch("dateOfBirth");
                            return dateStr ? new Date(dateStr) : undefined;
                          })()}
                          onSelect={(date) =>
                            form.setValue(
                              "dateOfBirth",
                              date ? format(date, "yyyy-MM-dd") : null
                            )
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div>
                    <label htmlFor="maritalStatus" className="block text-sm font-medium mb-2">Marital Status</label>
                    <Select 
                      onValueChange={(value) => form.setValue("maritalStatus", value)}
                      defaultValue={form.watch("maritalStatus") || ""}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select marital status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Single">Single</SelectItem>
                        <SelectItem value="Married">Married</SelectItem>
                        <SelectItem value="Divorced">Divorced</SelectItem>
                        <SelectItem value="Widowed">Widowed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label htmlFor="nationalInsuranceNumber" className="block text-sm font-medium mb-2">National Insurance Number</label>
                    <Input 
                      id="nationalInsuranceNumber" 
                      placeholder="Enter NI number" 
                      {...form.register("nationalInsuranceNumber")}
                    />
                  </div>
                </div>

                {/* Employment Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Employment Information</h3>
                  
                  <div>
                    <label htmlFor="startDate" className="block text-sm font-medium mb-2">Start Date</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !form.watch("startDate") && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {(() => {
                            const dateStr = form.watch("startDate");
                            return dateStr ? (
                              format(new Date(dateStr), "PPP")
                            ) : (
                              <span>Pick a date</span>
                            );
                          })()}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={(() => {
                            const dateStr = form.watch("startDate");
                            return dateStr ? new Date(dateStr) : undefined;
                          })()}
                          onSelect={(date) =>
                            form.setValue(
                              "startDate",
                              date ? format(date, "yyyy-MM-dd") : null
                            )
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div>
                    <label htmlFor="department" className="block text-sm font-medium mb-2">Department</label>
                    <Input 
                      id="department" 
                      placeholder="Enter department" 
                      {...form.register("department")}
                    />
                  </div>

                  <div>
                    <label htmlFor="position" className="block text-sm font-medium mb-2">Position</label>
                    <Input 
                      id="position" 
                      placeholder="Enter position" 
                      {...form.register("position")}
                    />
                  </div>

                  <div>
                    <label htmlFor="salary" className="block text-sm font-medium mb-2">Salary</label>
                    <Input 
                      id="salary" 
                      type="number" 
                      step="0.01" 
                      placeholder="Enter salary"
                      {...form.register("salary", { valueAsNumber: true })}
                    />
                  </div>

                  <div>
                    <label htmlFor="probationPeriod" className="block text-sm font-medium mb-2">Probation Period</label>
                    <Input 
                      id="probationPeriod" 
                      placeholder="e.g., 3 months" 
                      {...form.register("probationPeriod")}
                    />
                  </div>

                  <div>
                    <label htmlFor="lineManager" className="block text-sm font-medium mb-2">Line Manager</label>
                    <Input 
                      id="lineManager" 
                      placeholder="Enter line manager name" 
                      {...form.register("lineManager")}
                    />
                  </div>

                  <div>
                    <label htmlFor="term" className="block text-sm font-medium mb-2">Term</label>
                    <Select 
                      onValueChange={(value) => form.setValue("term", value)}
                      defaultValue={form.watch("term") || ""}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select term" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="permanent">Permanent</SelectItem>
                        <SelectItem value="contract">Contract</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label htmlFor="status" className="block text-sm font-medium mb-2">Status</label>
                    <Select 
                      onValueChange={(value) => form.setValue("status", value)}
                      defaultValue={form.watch("status") || ""}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="F/T">Full Time (F/T)</SelectItem>
                        <SelectItem value="P/T">Part Time (P/T)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Banking Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Banking Information</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="bankName" className="block text-sm font-medium mb-2">Bank Name</label>
                    <Input 
                      id="bankName" 
                      placeholder="Enter bank name" 
                      {...form.register("bankName")}
                    />
                  </div>

                  <div>
                    <label htmlFor="branchName" className="block text-sm font-medium mb-2">Branch Name</label>
                    <Input 
                      id="branchName" 
                      placeholder="Enter branch name" 
                      {...form.register("branchName")}
                    />
                  </div>

                  <div>
                    <label htmlFor="branchAddress" className="block text-sm font-medium mb-2">Branch Address</label>
                    <Textarea 
                      id="branchAddress" 
                      placeholder="Enter branch address" 
                      {...form.register("branchAddress")}
                      rows={3}
                    />
                  </div>

                  <div>
                    <label htmlFor="accountNumber" className="block text-sm font-medium mb-2">Account Number</label>
                    <Input 
                      id="accountNumber" 
                      placeholder="Enter account number" 
                      {...form.register("accountNumber")}
                    />
                  </div>

                  <div>
                    <label htmlFor="sortCode" className="block text-sm font-medium mb-2">Sort Code</label>
                    <Input 
                      id="sortCode" 
                      placeholder="Enter sort code" 
                      {...form.register("sortCode")}
                    />
                  </div>

                  <div>
                    <label htmlFor="forkLiftCertificateCompanyName" className="block text-sm font-medium mb-2">Fork Lift Certificate Company Name</label>
                    <Input 
                      id="forkLiftCertificateCompanyName" 
                      placeholder="Enter fork lift certificate company name" 
                      {...form.register("forkLiftCertificateCompanyName")}
                    />
                  </div>

                  <div>
                    <label htmlFor="licenceCertificateNumber" className="block text-sm font-medium mb-2">Licence Certificate Number</label>
                    <Input 
                      id="licenceCertificateNumber" 
                      placeholder="Enter licence certificate number" 
                      {...form.register("licenceCertificateNumber")}
                    />
                  </div>

                  <div>
                    <label htmlFor="marketPermitNumber" className="block text-sm font-medium mb-2">Market Permit Number</label>
                    <Input 
                      id="marketPermitNumber" 
                      placeholder="Enter market permit number" 
                      {...form.register("marketPermitNumber")}
                    />
                  </div>

                  <div>
                    <label htmlFor="isActive" className="block text-sm font-medium mb-2">Active Status</label>
                    <Select 
                      onValueChange={(value) => form.setValue("isActive", value)}
                      defaultValue={form.watch("isActive") || "yes"}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Active</SelectItem>
                        <SelectItem value="no">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Document Information */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Document Details</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => appendDocument({ documentName: "", startDate: null, endDate: null })}
                    className="flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add Document
                  </Button>
                </div>
                
                {documentFields.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <p>No documents added yet. Click "Add Document" to add document details.</p>
                  </div>
                )}

                {documentFields.map((field, index) => (
                  <Card key={field.id} className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-md font-medium text-gray-800">Document {index + 1}</h4>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeDocument(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label htmlFor={`documents.${index}.documentName`} className="block text-sm font-medium mb-2">
                          Document Name *
                        </label>
                        <Input
                          id={`documents.${index}.documentName`}
                          placeholder="Enter document name"
                          {...form.register(`documents.${index}.documentName`)}
                        />
                        {form.formState.errors.documents?.[index]?.documentName && (
                          <p className="text-red-500 text-xs mt-1">
                            {form.formState.errors.documents[index]?.documentName?.message}
                          </p>
                        )}
                      </div>

                      <div>
                        <label htmlFor={`documents.${index}.startDate`} className="block text-sm font-medium mb-2">
                          Start Date
                        </label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !form.watch(`documents.${index}.startDate`) && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {(() => {
                                const dateStr = form.watch(`documents.${index}.startDate`);
                                return dateStr ? (
                                  format(new Date(dateStr), "PPP")
                                ) : (
                                  <span>Pick a date</span>
                                );
                              })()}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={(() => {
                                const dateStr = form.watch(`documents.${index}.startDate`);
                                return dateStr ? new Date(dateStr) : undefined;
                              })()}
                              onSelect={(date) =>
                                form.setValue(
                                  `documents.${index}.startDate`,
                                  date ? format(date, "yyyy-MM-dd") : null
                                )
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>

                      <div>
                        <label htmlFor={`documents.${index}.endDate`} className="block text-sm font-medium mb-2">
                          End Date
                        </label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !form.watch(`documents.${index}.endDate`) && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {(() => {
                                const dateStr = form.watch(`documents.${index}.endDate`);
                                return dateStr ? (
                                  format(new Date(dateStr), "PPP")
                                ) : (
                                  <span>Pick a date</span>
                                );
                              })()}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={(() => {
                                const dateStr = form.watch(`documents.${index}.endDate`);
                                return dateStr ? new Date(dateStr) : undefined;
                              })()}
                              onSelect={(date) =>
                                form.setValue(
                                  `documents.${index}.endDate`,
                                  date ? format(date, "yyyy-MM-dd") : null
                                )
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>

                    {/* File Upload Section */}
                    {employeeId && (
                      <div className="mt-4 pt-4 border-t">
                        <label className="block text-sm font-medium mb-2">
                          Upload Document File
                        </label>
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                          <div className="text-center">
                            <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                            <label htmlFor={`file-upload-${index}`} className="cursor-pointer">
                              <span className="text-sm text-gray-600">
                                Click to upload a document or drag and drop
                              </span>
                              <input
                                id={`file-upload-${index}`}
                                type="file"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  
                                  const documentName = form.watch(`documents.${index}.documentName`);
                                  if (!documentName) {
                                    toast({
                                      variant: "destructive",
                                      title: "Error",
                                      description: "Please enter a document name first.",
                                    });
                                    return;
                                  }

                                  setUploadingFiles(prev => ({ ...prev, [index]: true }));
                                  
                                  try {
                                    await handleFileUpload(
                                      file,
                                      documentName,
                                      form.watch(`documents.${index}.startDate`) || undefined,
                                      form.watch(`documents.${index}.endDate`) || undefined
                                    );
                                  } finally {
                                    setUploadingFiles(prev => ({ ...prev, [index]: false }));
                                    e.target.value = '';
                                  }
                                }}
                                accept=".pdf,.png,.jpg,.jpeg,.gif,.doc,.docx,.txt"
                                disabled={uploadingFiles[index]}
                              />
                            </label>
                            {uploadingFiles[index] && (
                              <div className="mt-2 text-sm text-blue-600">Uploading...</div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Show uploaded documents for this employee */}
                    {employeeId && (
                      <div className="mt-4 pt-4 border-t">
                        <h5 className="text-sm font-medium mb-2">Uploaded Documents</h5>
                        {employeeDocuments.length === 0 ? (
                          <div className="text-sm text-gray-500">No documents uploaded yet.</div>
                        ) : (
                          <div className="space-y-2">
                            {employeeDocuments.map((doc: any) => (
                              <div key={doc.id} className="flex items-center justify-between p-2 border rounded">
                                <div className="flex-1">
                                  <div className="text-sm font-medium">{doc.documentName}</div>
                                  {doc.fileName && (
                                    <div className="text-xs text-gray-500">{doc.fileName}</div>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  {doc.hasFile && (
                                    <>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => window.open(getApiUrl(`/api/employees/documents/${doc.id}/view`), '_blank')}
                                        title="View document"
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => window.open(getApiUrl(`/api/employees/documents/${doc.id}`), '_blank')}
                                        title="Download document"
                                      >
                                        <Download className="h-4 w-4" />
                                      </Button>
                                    </>
                                  )}
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteDocument(doc.id)}
                                    className="text-red-600 hover:text-red-800"
                                    title="Delete document"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                ))}
              </div>

              <div className="flex justify-center">
                <Button
                  type="submit"
                  className="bg-green-600 hover:bg-green-700 text-white px-8"
                  disabled={createEmployeeMutation.isPending || updateEmployeeMutation.isPending}
                >
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

export default EmployeeDatabaseEdit;