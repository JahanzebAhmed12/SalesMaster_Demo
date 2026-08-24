import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Employee } from "@shared/schema";
import { format } from "date-fns";
import { useEffect } from "react";

export default function EmployeeJoiningForm() {
  const { id } = useParams<{ id: string }>();
  const employeeId = parseInt(id || "0");

  const { data: employee, isLoading, error } = useQuery<Employee>({
    queryKey: ["employee", employeeId],
    queryFn: () => apiRequest("GET", `/api/employees/${employeeId}`),
    enabled: !!employeeId,
  });

  // Auto-print when component loads
  useEffect(() => {
    if (employee && !isLoading) {
      const timer = setTimeout(() => {
        window.print();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [employee, isLoading]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading employee joining form...</div>
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-red-600">Error loading employee data</div>
      </div>
    );
  }

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "_______________";
    try {
      return format(new Date(dateString), "dd/MM/yyyy");
    } catch {
      return "_______________";
    }
  };

  const formatValue = (value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === "") {
      return "_______________";
    }
    return value.toString();
  };

  return (
    <div className="min-h-screen bg-white p-8 print:p-6">
      <style>{`
        @media print {
          body { margin: 0; }
          .no-print { display: none; }
          .page-break { page-break-before: always; }
        }
        .form-field {
          border-bottom: 1px solid #000;
          min-height: 24px;
          display: inline-block;
          min-width: 200px;
          padding: 2px 4px;
        }
        .signature-box {
          border: 1px solid #000;
          height: 60px;
          width: 200px;
          margin: 10px 0;
        }
      `}</style>

      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold mb-2">TROPIFRUIT UK LTD</h1>
        <p className="text-sm mb-1">3 Dolphin Way, Purfleet, RM19 1NZ</p>
        <p className="text-sm mb-4">Tel: [Phone Number] | Email: [Email Address]</p>
        <h2 className="text-xl font-bold border-b-2 border-black pb-2">EMPLOYEE JOINING FORM</h2>
      </div>

      {/* Personal Information Section */}
      <div className="mb-6">
        <h3 className="text-lg font-bold mb-4 bg-gray-100 p-2">PERSONAL INFORMATION</h3>
        
        <div className="grid grid-cols-1 gap-4 text-sm">
          <div className="flex items-center">
            <span className="w-40 font-medium">Full Name:</span>
            <span className="form-field flex-1">{formatValue(employee.fullName)}</span>
          </div>
          
          <div className="flex items-center">
            <span className="w-40 font-medium">Title:</span>
            <span className="form-field flex-1">{formatValue(employee.title)}</span>
          </div>
          
          <div className="flex items-center">
            <span className="w-40 font-medium">Date of Birth:</span>
            <span className="form-field flex-1">{formatDate(employee.dateOfBirth)}</span>
          </div>
          
          <div className="flex items-center">
            <span className="w-40 font-medium">Marital Status:</span>
            <span className="form-field flex-1">{formatValue(employee.maritalStatus)}</span>
          </div>
          
          <div className="flex items-center">
            <span className="w-40 font-medium">National Insurance No:</span>
            <span className="form-field flex-1">{formatValue(employee.nationalInsuranceNumber)}</span>
          </div>
        </div>
      </div>

      {/* Contact Information Section */}
      <div className="mb-6">
        <h3 className="text-lg font-bold mb-4 bg-gray-100 p-2">CONTACT INFORMATION</h3>
        
        <div className="grid grid-cols-1 gap-4 text-sm">
          <div className="flex items-start">
            <span className="w-40 font-medium">Home Address:</span>
            <span className="form-field flex-1 min-h-16">{formatValue(employee.homeAddress)}</span>
          </div>
          
          <div className="flex items-center">
            <span className="w-40 font-medium">Home Phone:</span>
            <span className="form-field flex-1">{formatValue(employee.homePhoneNumber)}</span>
          </div>
          
          <div className="flex items-center">
            <span className="w-40 font-medium">Mobile Number:</span>
            <span className="form-field flex-1">{formatValue(employee.mobileNumber)}</span>
          </div>
        </div>
      </div>

      {/* Employment Information Section */}
      <div className="mb-6">
        <h3 className="text-lg font-bold mb-4 bg-gray-100 p-2">EMPLOYMENT INFORMATION</h3>
        
        <div className="grid grid-cols-1 gap-4 text-sm">
          <div className="flex items-center">
            <span className="w-40 font-medium">Start Date:</span>
            <span className="form-field flex-1">{formatDate(employee.startDate)}</span>
          </div>
          
          <div className="flex items-center">
            <span className="w-40 font-medium">Department:</span>
            <span className="form-field flex-1">{formatValue(employee.department)}</span>
          </div>
          
          <div className="flex items-center">
            <span className="w-40 font-medium">Position:</span>
            <span className="form-field flex-1">{formatValue(employee.position)}</span>
          </div>
          
          <div className="flex items-center">
            <span className="w-40 font-medium">Salary:</span>
            <span className="form-field flex-1">{employee.salary ? `£${employee.salary.toFixed(2)}` : "_______________"}</span>
          </div>
          
          <div className="flex items-center">
            <span className="w-40 font-medium">Probation Period:</span>
            <span className="form-field flex-1">{formatValue(employee.probationPeriod)}</span>
          </div>
          
          <div className="flex items-center">
            <span className="w-40 font-medium">Line Manager:</span>
            <span className="form-field flex-1">{formatValue(employee.lineManager)}</span>
          </div>
          
          <div className="flex items-center">
            <span className="w-40 font-medium">Employment Term:</span>
            <span className="form-field flex-1">{formatValue(employee.term)}</span>
          </div>
          
          <div className="flex items-center">
            <span className="w-40 font-medium">Status:</span>
            <span className="form-field flex-1">{formatValue(employee.status)}</span>
          </div>
          
          <div className="flex items-center">
            <span className="w-40 font-medium">Holiday Entitlement:</span>
            <span className="form-field flex-1">{formatValue(employee.entitlementDays)} days per year</span>
          </div>
        </div>
      </div>

      {/* Banking Information Section */}
      <div className="mb-6">
        <h3 className="text-lg font-bold mb-4 bg-gray-100 p-2">BANKING INFORMATION</h3>
        
        <div className="grid grid-cols-1 gap-4 text-sm">
          <div className="flex items-center">
            <span className="w-40 font-medium">Bank Name:</span>
            <span className="form-field flex-1">{formatValue(employee.bankName)}</span>
          </div>
          
          <div className="flex items-center">
            <span className="w-40 font-medium">Branch Name:</span>
            <span className="form-field flex-1">{formatValue(employee.branchName)}</span>
          </div>
          
          <div className="flex items-start">
            <span className="w-40 font-medium">Branch Address:</span>
            <span className="form-field flex-1 min-h-12">{formatValue(employee.branchAddress)}</span>
          </div>
          
          <div className="flex items-center">
            <span className="w-40 font-medium">Account Number:</span>
            <span className="form-field flex-1">{formatValue(employee.accountNumber)}</span>
          </div>
          
          <div className="flex items-center">
            <span className="w-40 font-medium">Sort Code:</span>
            <span className="form-field flex-1">{formatValue(employee.sortCode)}</span>
          </div>
        </div>
      </div>

      {/* Additional Information Section */}
      <div className="mb-6">
        <h3 className="text-lg font-bold mb-4 bg-gray-100 p-2">ADDITIONAL INFORMATION</h3>
        
        <div className="grid grid-cols-1 gap-4 text-sm">
          <div className="flex items-center">
            <span className="w-40 font-medium">Fork Lift Certificate Company:</span>
            <span className="form-field flex-1">{formatValue(employee.forkLiftCertificateCompanyName)}</span>
          </div>
          
          <div className="flex items-center">
            <span className="w-40 font-medium">Licence Certificate Number:</span>
            <span className="form-field flex-1">{formatValue(employee.licenceCertificateNumber)}</span>
          </div>
          
          <div className="flex items-center">
            <span className="w-40 font-medium">Market Permit Number:</span>
            <span className="form-field flex-1">{formatValue(employee.marketPermitNumber)}</span>
          </div>
        </div>
      </div>

      {/* Next of Kin Information Section */}
      <div className="mb-6">
        <h3 className="text-lg font-bold mb-4 bg-gray-100 p-2">NEXT OF KIN INFORMATION</h3>
        
        <div className="grid grid-cols-1 gap-4 text-sm">
          <div className="flex items-center">
            <span className="w-40 font-medium">Name:</span>
            <span className="form-field flex-1">{formatValue(employee.nextOfKinName)}</span>
          </div>
          
          <div className="flex items-center">
            <span className="w-40 font-medium">Relationship:</span>
            <span className="form-field flex-1">{formatValue(employee.nextOfKinRelationship)}</span>
          </div>
          
          <div className="flex items-center">
            <span className="w-40 font-medium">Phone Number:</span>
            <span className="form-field flex-1">{formatValue(employee.nextOfKinPhoneNumber)}</span>
          </div>
          
          <div className="flex items-center">
            <span className="w-40 font-medium">Email Address:</span>
            <span className="form-field flex-1">{formatValue(employee.nextOfKinEmail)}</span>
          </div>
          
          <div className="flex items-start">
            <span className="w-40 font-medium">Home Address:</span>
            <span className="form-field flex-1 min-h-16">{formatValue(employee.nextOfKinAddress)}</span>
          </div>
        </div>
      </div>

      {/* Declaration Section */}
      <div className="mb-8">
        <h3 className="text-lg font-bold mb-4 bg-gray-100 p-2">EMPLOYEE DECLARATION</h3>
        
        <div className="text-sm space-y-4">
          <p>
            I confirm that the information provided above is true and complete to the best of my knowledge. 
            I understand that any false information may lead to the refusal of my application or cancellation 
            of my employment.
          </p>
          
          <p>
            I agree to comply with all company policies, procedures, and terms of employment as outlined 
            in the employee handbook and my employment contract.
          </p>
          
          <div className="grid grid-cols-2 gap-8 mt-8">
            <div>
              <p className="font-medium mb-2">Employee Signature:</p>
              <div className="signature-box"></div>
              <p className="text-xs mt-1">Signature</p>
            </div>
            
            <div>
              <p className="font-medium mb-2">Date:</p>
              <div className="form-field w-32">_______________</div>
            </div>
          </div>
        </div>
      </div>



      {/* Footer */}
      <div className="text-center text-xs text-gray-600 mt-8 border-t pt-4">
        <p>This form is confidential and should be stored securely in the employee's personnel file.</p>
        <p>Generated on: {format(new Date(), "dd/MM/yyyy 'at' HH:mm")}</p>
      </div>

      {/* Print Button - Hidden when printing */}
      <div className="no-print fixed bottom-4 right-4">
        <button
          onClick={() => window.print()}
          className="bg-blue-600 text-white px-4 py-2 rounded shadow-lg hover:bg-blue-700"
        >
          Print Form
        </button>
      </div>
    </div>
  );
}