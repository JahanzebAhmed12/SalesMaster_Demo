import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileDown, Printer, Copy, Download, FileText } from "lucide-react";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useCompanyDetails } from "@/hooks/use-company-details";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";

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
  const [isExporting, setIsExporting] = useState(false);

  // Fetch current company details with proper typing
  const { companyDetails, isLoadingCompany: isLoading } = useCompanyDetails();

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

  const handleExport = async (format: string) => {
    if (!companyDetails) {
      toast({
        variant: "destructive",
        title: "No Data",
        description: "No company details found to export."
      });
      return;
    }

    setIsExporting(true);

    try {
      const exportData = [{
        'Company Name': companyDetails.companyName,
        'Address 1': companyDetails.address1,
        'Address 2': companyDetails.address2 || '',
        'Telephone': companyDetails.telephone || '',
        'Mobile': companyDetails.mobile || '',
        'Fax': companyDetails.fax || '',
        'Website': companyDetails.website || '',
        'Email': companyDetails.email || '',
        'VAT No': companyDetails.vatNo || '',
        'Company Reg No': companyDetails.compRegNo || '',
        'Bank Details': companyDetails.bankDetails || '',
        'EINL Number': companyDetails.einlNumber || '',
        'Remarks': companyDetails.remarks || ''
      }];

      switch (format) {
        case "excel":
          await handleExcelExport(exportData);
          break;
        case "pdf":
          await handlePDFExport(exportData);
          break;
        case "copy":
          handleCopy();
          break;
        case "print":
          handlePrint();
          break;
        default:
          console.log(`Unknown format: ${format}`);
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: "An unexpected error occurred during export."
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExcelExport = async (data: any[]) => {
    try {
      const wb = XLSX.utils.book_new();

      // Create a vertical layout for company details
      const verticalData = Object.entries(data[0]).map(([key, value]) => ({
        'Field': key,
        'Value': value
      }));

      const ws = XLSX.utils.json_to_sheet(verticalData);

      // Set column widths
      ws['!cols'] = [
        { wch: 20 }, // Field column
        { wch: 50 }  // Value column
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Company Details');

      const fileName = `Company_Details_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);

      toast({
        title: "Success",
        description: "Company details exported to Excel successfully."
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: "Failed to export to Excel. Please try again."
      });
    }
  };

  const handlePDFExport = async (data: any[]) => {
    try {
      const doc = new jsPDF('p', 'mm', 'a4');

      doc.setFontSize(16);
      doc.text('Company Details', 14, 15);

      doc.setFontSize(10);
      doc.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 14, 25);

      // Create vertical table data
      const tableData = Object.entries(data[0]).map(([key, value]) => [key, value || '-']);

      autoTable(doc, {
        head: [['Field', 'Value']],
        body: tableData,
        startY: 35,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [240, 240, 240] },
        columnStyles: {
          0: { cellWidth: 50, fontStyle: 'bold' },
          1: { cellWidth: 120 }
        }
      });

      const fileName = `Company_Details_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);

      toast({
        title: "Success",
        description: "Company details exported to PDF successfully."
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: "Failed to export to PDF. Please try again."
      });
    }
  };

  const handleCopy = () => {
    if (!companyDetails) return;

    const textData = [
      `Company Name: ${companyDetails.companyName}`,
      `Address 1: ${companyDetails.address1}`,
      `Address 2: ${companyDetails.address2 || ''}`,
      `Telephone: ${companyDetails.telephone || ''}`,
      `Mobile: ${companyDetails.mobile || ''}`,
      `Fax: ${companyDetails.fax || ''}`,
      `Website: ${companyDetails.website || ''}`,
      `Email: ${companyDetails.email || ''}`,
      `VAT No: ${companyDetails.vatNo || ''}`,
      `Company Reg No: ${companyDetails.compRegNo || ''}`,
      `Bank Details: ${companyDetails.bankDetails || ''}`,
      `EINL Number: ${companyDetails.einlNumber || ''}`,
      `Remarks: ${companyDetails.remarks || ''}`
    ].join('\n');

    navigator.clipboard.writeText(textData).then(() => {
      toast({
        title: "Success",
        description: "Company details copied to clipboard"
      });
    }).catch(() => {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive"
      });
    });
  };

  const handlePrint = () => {
    if (!companyDetails) return;

    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Company Details</title>');
      printWindow.document.write('<style>');
      printWindow.document.write('body{font-family:Arial,sans-serif;margin:20px;}');
      printWindow.document.write('table{width:100%;border-collapse:collapse;margin-top:20px;}');
      printWindow.document.write('th,td{border:1px solid #ccc;padding:12px;text-align:left;font-size:12px;}');
      printWindow.document.write('th{background-color:#f0f0f0;font-weight:bold;width:30%;}');
      printWindow.document.write('.header{text-align:center;margin-bottom:20px;}');
      printWindow.document.write('@media print { body { margin: 0; } }');
      printWindow.document.write('</style>');
      printWindow.document.write('</head><body>');

      printWindow.document.write('<div class="header">');
      printWindow.document.write('<h2>Company Details</h2>');
      printWindow.document.write(`<p>Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</p>`);
      printWindow.document.write('</div>');

      printWindow.document.write('<table>');

      const fields = [
        ['Company Name', companyDetails.companyName],
        ['Address 1', companyDetails.address1],
        ['Address 2', companyDetails.address2 || ''],
        ['Telephone', companyDetails.telephone || ''],
        ['Mobile', companyDetails.mobile || ''],
        ['Fax', companyDetails.fax || ''],
        ['Website', companyDetails.website || ''],
        ['Email', companyDetails.email || ''],
        ['VAT No', companyDetails.vatNo || ''],
        ['Company Reg No', companyDetails.compRegNo || ''],
        ['Bank Details', companyDetails.bankDetails || ''],
        ['EINL Number', companyDetails.einlNumber || ''],
        ['Remarks', companyDetails.remarks || '']
      ];

      fields.forEach(([field, value]) => {
        printWindow.document.write('<tr>');
        printWindow.document.write(`<th>${field}</th>`);
        printWindow.document.write(`<td>${value || '-'}</td>`);
        printWindow.document.write('</tr>');
      });

      printWindow.document.write('</table>');
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
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
              onClick={() => handleExport('excel')}
              className="text-green-600 hover:text-green-700"
              disabled={isExporting}
            >
              <Download className="h-4 w-4 mr-1" />
              {isExporting ? 'Exporting...' : 'Excel'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('pdf')}
              className="text-red-600 hover:text-red-700"
              disabled={isExporting}
            >
              <FileText className="h-4 w-4 mr-1" />
              {isExporting ? 'Generating...' : 'PDF'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('copy')}
              className="text-blue-600 hover:text-blue-700"
              disabled={isExporting}
            >
              <Copy className="h-4 w-4 mr-1" />
              Copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('print')}
              className="text-purple-600 hover:text-purple-700"
              disabled={isExporting}
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
