import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { X, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertSupplierSchema } from "@shared/schema";
import type { Supplier, InsertSupplier } from "@shared/schema";
import { z } from "zod";

const formSchema = insertSupplierSchema.extend({
  supplier_code: z.string().min(1, "Supplier code is required"),
  sage_code: z.string().nullable(),
  supplier_name: z.string().min(1, "Supplier name is required"),
  address: z.string().nullable(),
  telephone: z.string().nullable(),
  fax: z.string().nullable(),
  email: z.string().email().nullable(),
  customer_country: z.string().nullable(),
  supplier_currency: z.string(),
  contact_no1: z.string().nullable(),
  contact_no2: z.string().nullable(),
  remarks: z.string().nullable(),
  vat_number: z.string().nullable(),
  credit_limit: z.number().nullable(),
  terms: z.string().nullable(),
  web_address: z.string().nullable(),
  bank_name: z.string().nullable(),
  bank_address: z.string().nullable(),
  bank_account_name: z.string().nullable(),
  sort_code: z.string().nullable(),
  account_no: z.string().nullable(),
  eec_group: z.string(),
  is_active: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

const currencies = [
  "CAD", "GBP", "EGP", "EUR", "FRF", "INR", "PKR", "TRY", "UGX", "USD"
];

// Helper to get next supplier code
function getNextSupplierCode(suppliers: any[]) {
  const codes = suppliers
    .map((s) => s.supplier_code)
    .filter((code) => /^S\d+$/i.test(code));
  const nums = codes.map((code) => parseInt(code.replace(/^S/i, ""), 10)).filter((n) => !isNaN(n));
  const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `S${nextNum}`;
}

export default function SupplierForm() {
  const [, params] = useRoute("/admin/supplier-database-edit/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const isEditing = !!params?.id;
  const isViewMode = window.location.href.includes("view=true");
  const queryClient = useQueryClient();
  const suppliers = queryClient.getQueryData<any[]>(["suppliers", ""]) || [];

  const { data: supplier, isLoading } = useQuery<Supplier>({
    queryKey: ["suppliers", params?.id],
    queryFn: async () => {
      if (!params?.id) throw new Error("No ID provided");
      return apiRequest("GET", `/api/suppliers/${params.id}`);
    },
    enabled: isEditing,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      supplier_code: "",
      sage_code: "",
      supplier_name: "",
      address: "",
      telephone: "",
      fax: "",
      email: "",
      customer_country: "",
      supplier_currency: "GBP",
      contact_no1: "",
      contact_no2: "",
      remarks: "",
      vat_number: "",
      credit_limit: null,
      terms: "",
      web_address: "",
      bank_name: "",
      bank_address: "",
      bank_account_name: "",
      sort_code: "",
      account_no: "",
      eec_group: "No",
      is_active: "Yes",
    },
  });

  useEffect(() => {
    if (supplier) {
      form.reset({
        supplier_code: supplier.supplier_code,
        sage_code: supplier.sage_code || "",
        supplier_name: supplier.supplier_name,
        address: supplier.address || "",
        telephone: supplier.telephone || "",
        fax: supplier.fax || "",
        email: supplier.email || "",
        customer_country: supplier.customer_country || "",
        supplier_currency: supplier.supplier_currency || "",
        contact_no1: supplier.contact_no1 || "",
        contact_no2: supplier.contact_no2 || "",
        remarks: supplier.remarks || "",
        vat_number: supplier.vat_number || "",
        credit_limit: supplier.credit_limit,
        terms: supplier.terms || "",
        web_address: supplier.web_address || "",
        bank_name: supplier.bank_name || "",
        bank_address: supplier.bank_address || "",
        bank_account_name: supplier.bank_account_name || "",
        sort_code: supplier.sort_code || "",
        account_no: supplier.account_no || "",
        eec_group: supplier.eec_group || "",
        is_active: supplier.is_active,
      });
    }
  }, [supplier, form]);

  useEffect(() => {
    if (!isEditing && suppliers.length > 0) {
      const nextCode = getNextSupplierCode(suppliers);
      form.setValue("supplier_code", nextCode);
      form.setValue("sage_code", nextCode);
    }
  }, [isEditing, suppliers, form]);

  const mutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const method = isEditing ? "PUT" : "POST";
      const url = isEditing ? `/api/suppliers/${params!.id}` : "/api/suppliers";
      return apiRequest(method, url, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast({
        title: "Success",
        description: `Supplier ${isEditing ? "updated" : "created"} successfully`,
      });
      setLocation("/admin/supplier-database");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || `Failed to ${isEditing ? "update" : "create"} supplier`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormValues) => {
    mutation.mutate(data);
  };

  const handleCancel = () => {
    setLocation("/admin/supplier-database");
  };

  if (isEditing && isLoading) {
    return (
      <div className="p-6">
        <div className="space-y-4">
          <div className="h-8 bg-gray-200 rounded animate-pulse" />
          <div className="h-96 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-background-gray min-h-screen">
      <Card className="shadow-sm border border-gray-200 mb-6">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-gray-900">
                {isViewMode ? "View Supplier" : isEditing ? "Edit Supplier" : "Add Supplier"}
              </h2>
              <div className="flex items-center text-sm text-gray-500 mt-1">
                <button
                  onClick={handleCancel}
                  className="text-primary hover:underline"
                >
                  Supplier Database
                </button>
                <ChevronRight className="mx-2 h-3 w-3" />
                <span>{isViewMode ? "View Supplier" : isEditing ? "Edit Supplier" : "Add Supplier"}</span>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Basic Information */}
          <div className="form-section">
            <h3 className="text-md font-medium text-gray-900 mb-4">Basic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="supplier_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier Code *</FormLabel>
                    <FormControl>
                      <Input {...field} readOnly />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sage_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sage Code</FormLabel>
                    <FormControl>
                    <Input {...field} value={field.value || ""} readOnly />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="supplier_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier Name *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Contact Information */}
          <div className="form-section">
            <h3 className="text-md font-medium text-gray-900 mb-4">Contact Information</h3>
            <div className="grid grid-cols-1 gap-4 mb-4">
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Textarea {...field} value={field.value || ''} rows={3} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="telephone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telephone</FormLabel>
                    <FormControl>
                      <Input {...field} type="tel" value={field.value || ''} />
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
                    <FormLabel>Fax</FormLabel>
                    <FormControl>
                      <Input {...field} type="tel" value={field.value || ''} />
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
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customer_country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Country</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="supplier_currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier Currency</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Currency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {currencies.map((currency) => (
                          <SelectItem key={currency} value={currency}>
                            {currency}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="web_address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Web Address</FormLabel>
                    <FormControl>
                      <Input {...field} type="url" value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact_no1"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact No 1</FormLabel>
                    <FormControl>
                      <Input {...field} type="tel" value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact_no2"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact No 2</FormLabel>
                    <FormControl>
                      <Input {...field} type="tel" value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Financial Information */}
          <div className="form-section">
            <h3 className="text-md font-medium text-gray-900 mb-4">Financial Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="vat_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>VAT Number</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="credit_limit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Credit Limit</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.01"
                        onChange={(e) => {
                          const value = e.target.value === '' ? null : Number(e.target.value);
                          field.onChange(value);
                        }}
                        value={field.value === null ? '' : field.value}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="terms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Terms</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="mt-4">
              <FormField
                control={form.control}
                name="remarks"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Remarks</FormLabel>
                    <FormControl>
                      <Textarea {...field} value={field.value || ''} rows={3} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Banking Information */}
          <div className="form-section">
            <h3 className="text-md font-medium text-gray-900 mb-4">Banking Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <FormField
                control={form.control}
                name="bank_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bank Name</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bank_account_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bank Account Name</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="mb-4">
              <FormField
                control={form.control}
                name="bank_address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bank Address</FormLabel>
                    <FormControl>
                      <Textarea {...field} value={field.value || ''} rows={3} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="sort_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sort Code</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="account_no"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account No</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Status & Settings */}
          <div className="form-section">
            <h3 className="text-md font-medium text-gray-900 mb-4">Status & Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="eec_group"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>EEC Group</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Yes">Yes</SelectItem>
                        <SelectItem value="No">No</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Is Active</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Yes">Yes</SelectItem>
                        <SelectItem value="No">No</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end space-x-4 pt-6">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={mutation.isPending}
            >
              {isViewMode ? "Back" : "Cancel"}
            </Button>
            {!isViewMode && (
              <Button
                type="submit"
                className="bg-primary text-white hover:bg-secondary-blue"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Saving..." : "Save Supplier"}
              </Button>
            )}
          </div>
        </form>
      </Form>
    </div>
  );
}
