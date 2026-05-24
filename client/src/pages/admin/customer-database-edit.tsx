import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { insertCustomerSchema } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAdminCrossTabSync } from "@/hooks/useAdminCrossTabSync";
import type { InsertCustomer } from "@shared/schema";
import { useParams } from "wouter";
import React from "react";
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';

// Helper to get next customer code
function getNextCustomerCode(customers: any[]) {
  const codes = customers
    .map((c) => c.customer_code)
    .filter((code) => /^C\d+$/i.test(code));
  const nums = codes.map((code) => parseInt(code.replace(/^C/i, ""), 10)).filter((n) => !isNaN(n));
  const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `C${nextNum}`;
}

// Helper to validate multiple emails
function validateEmails(emailString: string): boolean {
  if (!emailString.trim()) return true;
  const emails = emailString.split(',').map(email => email.trim());
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emails.every(email => email === '' || emailRegex.test(email));
}

export default function CustomerAdd() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const params = useParams();
  const customerId = params?.id ? parseInt(params.id) : null;
  const isEditMode = !!customerId;
  const queryClient = useQueryClient();
  const customers = queryClient.getQueryData<any[]>(["/api/customers"]) || [];
  const { broadcastCustomerOperation } = useAdminCrossTabSync();

  // Fetch customer data if in edit mode
  const { data: customerData, isLoading } = useQuery({
    queryKey: ["/api/customers", customerId],
    queryFn: async () => {
      if (!customerId) return null;
      const response = await apiRequest("GET", `/api/customers/${customerId}`);
      return response;
    },
    enabled: isEditMode,
  });

  const form = useForm<InsertCustomer>({
    resolver: zodResolver(insertCustomerSchema),
    defaultValues: {
      customer_code: "",
      sage_code: "",
      customer_name: "",
      address: "",
      telephone: "",
      fax: "",
      email: "",
      customer_city: "",
      customer_country: "",
      customer_currency: "GBP",
      remarks: "",
      own_branch: "no",
      vat_number: "",
      credit_limit: 0,
      runningBalance: 0,
      terms: "",
      settlement_days: 0,
      settlement_discount: 0,
      web_address: "",
      others: "",
      is_active: "yes",
      is_company: false,
    },
    mode: "onChange",
  });

  // Update form when customer data is loaded
  React.useEffect(() => {
    if (customerData) {
      form.reset(customerData);
    }
  }, [customerData, form]);

  React.useEffect(() => {
    if (!isEditMode) {
      const nextCode = getNextCustomerCode(customers);
      if (!form.getValues("customer_code")) {
        form.setValue("customer_code", nextCode);
      }
      if (!form.getValues("sage_code")) {
        form.setValue("sage_code", nextCode);
      }
    }
  }, [isEditMode, customers, form]);

  const customerMutation = useMutation({
    mutationFn: async (data: InsertCustomer) => {
      try {
        if (isEditMode) {
          const response = await apiRequest("PUT", `/api/customers/${customerId}`, data);
          return response;
        } else {
          const response = await apiRequest("POST", "/api/customers", data);
          return response;
        }
      } catch (error) {
        if (error instanceof Error) {
          throw error;
        }
        throw new Error(`Failed to ${isEditMode ? 'update' : 'add'} customer`);
      }
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      broadcastCustomerOperation(isEditMode ? "UPDATED" : "CREATED", { 
        id: isEditMode ? customerId : result?.id, 
        ...variables 
      });
      toast({
        title: "Success",
        description: `Customer ${isEditMode ? 'updated' : 'added'} successfully`,
      });
      setLocation("/admin/customer-database");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : `Failed to ${isEditMode ? 'update' : 'add'} customer`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: InsertCustomer) => {
    try {
      // Convert string values to numbers where needed
      const formData = {
        ...data,
        credit_limit: Number(data.credit_limit) || 0,
        runningBalance: Number(data.runningBalance) || 0,
        settlement_discount: Number(data.settlement_discount) || 0,
        settlement_days: Number(data.settlement_days) || 0,
      };
      
      await customerMutation.mutateAsync(formData);
    } catch (error) {
      console.error("Form submission error:", error);
    }
  };

  const currencyOptions = [
    { value: "CAD", label: "CAD - Canadian Dollar" },
    { value: "GBP", label: "GBP - British Pound" },
    { value: "EGP", label: "EGP - Egyptian Pound" },
    { value: "EUR", label: "EUR - Euro" },
    { value: "FRF", label: "FRF - French Franc" },
    { value: "INR", label: "INR - Indian Rupee" },
    { value: "PKR", label: "PKR - Pakistani Rupee" },
    { value: "TRY", label: "TRY - Turkish Lira" },
    { value: "UGX", label: "UGX - Ugandan Shilling" },
    { value: "USD", label: "USD - US Dollar" },
  ];

  if (isLoading) {
    return <div className="flex items-center justify-center h-96">Loading customer data...</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b border-[hsl(210,16%,93%)] p-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-medium tropifruit-text">{isEditMode ? 'Edit' : 'Add'} Customer</h2>
            <button 
              onClick={() => setLocation("/admin/customer-database")}
              className="text-sm text-[hsl(207,90%,54%)] hover:underline mt-1"
            >
              ← Back to Customer Database
            </button>
          </div>
          <div className="text-sm tropifruit-text-secondary">
            TROPIFRUIT UK LTD, 3 Dolphin Way, Porfield, RM16 1NZ...
          </div>
        </div>
      </div>

      <div className="p-6 flex-1 overflow-auto">
        <div className="bg-white rounded-lg shadow-sm border border-[hsl(210,16%,93%)] max-w-4xl">
          <div className="p-6">
            <h3 className="text-lg font-medium tropifruit-text mb-6">Customer Information</h3>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="customer_code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer Code *</FormLabel>
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
                </div>
                
                <FormField
                  control={form.control}
                  name="customer_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer Name *</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Textarea {...field} value={field.value || ""} rows={3} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="telephone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Telephone *</FormLabel>
                        <FormControl>
                          <PhoneInput
                            country={'gb'}
                            value={field.value || ''}
                            onChange={value => field.onChange(value.startsWith('+') ? value : `+${value}`)}
                            inputProps={{
                              name: 'telephone',
                              required: true,
                              autoFocus: false,
                            }}
                            enableSearch
                            inputStyle={{ width: '100%' }}
                          />
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
                          <Input {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email (separate multiple emails with commas)</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          value={field.value || ""} 
                          placeholder="email1@example.com, email2@example.com"
                          rows={2}
                        />
                      </FormControl>
                      {field.value && !validateEmails(field.value) && (
                        <p className="text-red-500 text-sm">Please enter valid email addresses separated by commas</p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="customer_city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer City</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} />
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
                          <Input {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="customer_currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer Currency</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {currencyOptions.map((currency) => (
                            <SelectItem key={currency.value} value={currency.value}>
                              {currency.label}
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
                  name="remarks"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Remarks</FormLabel>
                      <FormControl>
                        <Textarea {...field} value={field.value || ""} rows={3} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="own_branch"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Own Branch</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="vat_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>VAT Number</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} />
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
                            {...field}
                            type="number"
                            step="0.01"
                            value={field.value?.toString() || "0"}
                            onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="runningBalance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Running Balance</FormLabel>
                      <FormControl>
                        <Input 
                          {...field}
                          type="number"
                          step="0.01"
                          value={field.value?.toString() || "0"}
                          onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                          placeholder="Enter initial running balance"
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
                        <Input {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="settlement_days"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Settlement Days</FormLabel>
                        <FormControl>
                          <Input 
                            {...field}
                            type="number"
                            value={field.value?.toString() || "0"}
                            onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="settlement_discount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Settlement Discount</FormLabel>
                        <FormControl>
                          <Input 
                            {...field}
                            type="number"
                            step="0.01"
                            value={field.value?.toString() || "0"}
                            onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="web_address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Web Address</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} type="url" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="others"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Others/Gate</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} placeholder="Enter others/gate information" />
                      </FormControl>
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
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="is_company"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? false}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className="font-normal">Is Company</FormLabel>
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-2 pt-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLocation("/admin/customer-database")}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="tropifruit-success hover:bg-green-600"
                    disabled={customerMutation.isPending}
                  >
                    {customerMutation.isPending ? "Saving..." : "Save"}
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