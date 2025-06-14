import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileDown, Printer, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import React from "react";

// Define the type for company details response
interface CompanyDetails {
  id: number;
  companyName: string;
  address1: string;
  address2?: string;
  telephone?: string;
  mobile?: string;
  fax?: string;
  website?: string;
  email?: string;
  vatNo?: string;
  compRegNo?: string;
  bankDetails?: string;
  einlNumber?: string;
  remarks?: string;
  createdAt?: string;
  updatedAt?: string;
}

const formSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  address1: z.string().min(1, "Address 1 is required"),
  address2: z.string().optional(),
  telephone: z.string().optional(),
  mobile: z.string().optional(),
  fax: z.string().optional(),
  website: z.string().optional(),
  email: z.string().email("Invalid email format").optional().or(z.literal("")),
  vatNo: z.string().optional(),
  compRegNo: z.string().optional(),
  bankDetails: z.string().optional(),
  einlNumber: z.string().optional(),
  remarks: z.string().optional(),
});

export default function CompanyDetails() {
  const { toast } = useToast();

  // Fetch current company details with proper typing
  const { data: companyDetails, isLoading } = useQuery<CompanyDetails>({
    queryKey: ["/api/company-details"],
    queryFn: async () => {
      const response = await apiRequest<CompanyDetails>("GET", "/api/company-details");
      return response;
    },
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyName: "",
      address1: "",
      address2: "",
      telephone: "",
      mobile: "",
      fax: "",
      website: "",
      email: "",
      vatNo: "",
      compRegNo: "",
      bankDetails: "",
      einlNumber: "",
      remarks: "",
    },
  });

  // Update form values when data is loaded
  React.useEffect(() => {
    if (companyDetails) {
      form.reset({
        companyName: companyDetails.companyName || "",
        address1: companyDetails.address1 || "",
        address2: companyDetails.address2 || "",
        telephone: companyDetails.telephone || "",
        mobile: companyDetails.mobile || "",
        fax: companyDetails.fax || "",
        website: companyDetails.website || "",
        email: companyDetails.email || "",
        vatNo: companyDetails.vatNo || "",
        compRegNo: companyDetails.compRegNo || "",
        bankDetails: companyDetails.bankDetails || "",
        einlNumber: companyDetails.einlNumber || "",
        remarks: companyDetails.remarks || "",
      });
    }
  }, [companyDetails, form]);

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) => {
      const response = await apiRequest<CompanyDetails>("PUT", "/api/company-details", data);
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Company details updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update company details",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    mutation.mutate(data);
  };

  const handleExport = (format: string) => {
    toast({
      title: "Export",
      description: `Exporting to ${format} format...`,
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">Loading company details...</div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Company Details</h1>
        <div className="text-sm text-gray-600">
          {companyDetails?.companyName}, {companyDetails?.address1}, {companyDetails?.address2}
        </div>
      </div>

      <Card className="shadow-sm border border-gray-200 mb-6">
        <CardContent className="p-6">
          <div className="flex items-center space-x-3">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleExport('pdf')}
            >
              <FileDown className="h-4 w-4 mr-1" />
              PDF
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleExport('excel')}
            >
              Excel
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleExport('copy')}
            >
              <Copy className="h-4 w-4 mr-1" />
              Copy
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleExport('print')}
            >
              <Printer className="h-4 w-4 mr-1" />
              Print
            </Button>
          </div>
        </CardContent>
      </Card>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card className="shadow-sm border border-gray-200">
            <CardContent className="p-6">
              <h3 className="text-md font-medium text-gray-900 mb-4">Company Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="companyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-blue-600">Company Name:</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="address1"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-blue-600">Address 1:</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="address2"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-blue-600">Address 2:</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="telephone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-blue-600">Telephone:</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="mobile"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-blue-600">Mobile:</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="fax"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-blue-600">Fax:</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-blue-600">Website:</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-blue-600">Email:</FormLabel>
                        <FormControl>
                          <Input {...field} type="email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="vatNo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-blue-600">VAT No:</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="compRegNo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-blue-600">Comp Reg No:</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="bankDetails"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-blue-600">Bank Details:</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="einlNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-blue-600">EINL Number:</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              
              <div className="mt-6">
                <FormField
                  control={form.control}
                  name="remarks"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-blue-600">Remarks:</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={4} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-center pt-6">
            <Button
              type="submit"
              className="bg-green-600 text-white hover:bg-green-700 px-8"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
