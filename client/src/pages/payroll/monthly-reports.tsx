import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Printer, FileText, Download } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";
import type { Employee, Attendance } from "@shared/schema";

interface MonthlyStats {
  workingDays: number;
  totalLeaves: number;
  avgAttendance: number;
}

interface EmployeeMonthlyData {
  employee: Employee;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  holidayDays: number;
  attendancePercentage: number;
  totalHours: number;
}

interface PayrollData {
  employee: Employee;
  attendance: {
    presentDays: number;
    absentDays: number;
    leaveDays: number;
    holidayDays: number;
    attendancePercentage: number;
  };
  payroll: {
    regularHours: number;
    overtimeHours: number;
    hourlyRate: number;
    overtimeRate: number;
    grossPay: number;
    tax: number;
    nationalInsurance: number;
    netPay: number;
  };
}

export default function MonthlyReports() {
  const { toast } = useToast();
  const [selectedMonth, setSelectedMonth] = useState("2025-06");
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");
  const [reportType, setReportType] = useState<"attendance" | "payroll">("attendance");
  
  const [year, month] = selectedMonth.split('-').map(Number);

  const { data: employees } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
  });

  const { data: monthlyAttendance } = useQuery<Attendance[]>({
    queryKey: [`/api/attendance?year=${year}&month=${month}`],
  });

  const { data: monthlyStats } = useQuery<MonthlyStats>({
    queryKey: [`/api/reports/monthly-stats?year=${year}&month=${month}`],
  });

  const { data: payrollData } = useQuery<PayrollData[]>({
    queryKey: [`/api/reports/payroll?year=${year}&month=${month}${selectedEmployee !== 'all' ? `&employeeId=${selectedEmployee}` : ''}`],
  });

  const handlePrint = () => {
    window.print();
    toast({
      title: "Print Report",
      description: "Sending report to printer...",
    });
  };

  const handlePDFExport = async () => {
    try {
      const element = document.getElementById('monthly-report-content');
      if (!element) return;

      const canvas = await html2canvas(element, {
        scale: 2,
        logging: false,
        useCORS: true
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const imgWidth = 210;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const monthName = new Date(year, month - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      pdf.save(`${reportType}-report-${monthName.replace(' ', '-')}.pdf`);
      
      toast({
        title: "PDF Export Complete",
        description: "Report has been downloaded as PDF.",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Unable to generate PDF report.",
        variant: "destructive",
      });
    }
  };

  const handleExcelExport = () => {
    try {
      let data: any[] = [];
      
      if (reportType === "payroll" && payrollData) {
        data = payrollData.map(item => ({
          'Employee ID': item.employee.employeeId,
          'Name': item.employee.name,
          'Department': item.employee.department,
          'Present Days': item.attendance.presentDays,
          'Absent Days': item.attendance.absentDays,
          'Leave Days': item.attendance.leaveDays,
          'Holiday Days': item.attendance.holidayDays,
          'Attendance %': `${item.attendance.attendancePercentage}%`,
          'Regular Hours': item.payroll.regularHours,
          'Overtime Hours': item.payroll.overtimeHours,
          'Hourly Rate': `£${item.payroll.hourlyRate}`,
          'Overtime Rate': `£${item.payroll.overtimeRate}`,
          'Gross Pay': `£${item.payroll.grossPay}`,
          'Tax': `£${item.payroll.tax}`,
          'National Insurance': `£${item.payroll.nationalInsurance}`,
          'Net Pay': `£${item.payroll.netPay}`
        }));
      } else {
        const employeeData = calculateEmployeeData();
        data = employeeData.map(item => ({
          'Employee ID': item.employee.employeeId,
          'Name': item.employee.name,
          'Department': item.employee.department,
          'Present Days': item.presentDays,
          'Absent Days': item.absentDays,
          'Leave Days': item.leaveDays,
          'Holiday Days': item.holidayDays,
          'Attendance %': `${item.attendancePercentage}%`,
          'Total Hours': `${item.totalHours}h`
        }));
      }

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `${reportType} Report`);
      
      const monthName = new Date(year, month - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      XLSX.writeFile(wb, `${reportType}-report-${monthName.replace(' ', '-')}.xlsx`);
      
      toast({
        title: "Excel Export Complete",
        description: "Report has been downloaded as Excel file.",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Unable to generate Excel report.",
        variant: "destructive",
      });
    }
  };

  const calculateEmployeeData = (): EmployeeMonthlyData[] => {
    if (!employees || !monthlyAttendance) return [];

    return employees.map(employee => {
      const employeeAttendance = monthlyAttendance.filter(att => att.employeeId === employee.id);
      
      const presentDays = employeeAttendance.filter(att => att.status === 'present').length;
      const absentDays = employeeAttendance.filter(att => att.status === 'absent').length;
      const leaveDays = employeeAttendance.filter(att => att.status === 'leave').length;
      const holidayDays = employeeAttendance.filter(att => att.status === 'holiday').length;
      
      const totalWorkingDays = monthlyStats?.workingDays || 22;
      const attendancePercentage = totalWorkingDays > 0 ? (presentDays / totalWorkingDays) * 100 : 0;
      const totalHours = presentDays * 8; // Assuming 8 hours per day

      return {
        employee,
        presentDays,
        absentDays,
        leaveDays,
        holidayDays,
        attendancePercentage: Math.round(attendancePercentage * 10) / 10,
        totalHours,
      };
    });
  };

  const employeeData = calculateEmployeeData();

  const getAttendanceColor = (percentage: number) => {
    if (percentage >= 95) return "bg-green-100 text-green-800";
    if (percentage >= 85) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  const monthOptions = [
    { value: "2025-06", label: "June 2025" },
    { value: "2025-05", label: "May 2025" },
    { value: "2025-04", label: "April 2025" },
    { value: "2025-03", label: "March 2025" },
    { value: "2025-02", label: "February 2025" },
    { value: "2025-01", label: "January 2025" },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Monthly Reports & Payroll</CardTitle>
            <div className="flex space-x-3">
              <Select value={reportType} onValueChange={(value: "attendance" | "payroll") => setReportType(value)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Report Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="attendance">Attendance</SelectItem>
                  <SelectItem value="payroll">Payroll</SelectItem>
                </SelectContent>
              </Select>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {reportType === "payroll" && (
                <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Employees</SelectItem>
                    {employees?.map(emp => (
                      <SelectItem key={emp.id} value={emp.id.toString()}>
                        {emp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button onClick={handlePrint} className="no-print">
                <Printer className="w-4 h-4 mr-2" />
                Print
              </Button>
              <Button onClick={handlePDFExport} variant="outline" className="no-print bg-red-600 text-white hover:bg-red-700">
                <FileText className="w-4 h-4 mr-2" />
                PDF
              </Button>
              <Button onClick={handleExcelExport} variant="outline" className="no-print bg-green-600 text-white hover:bg-green-700">
                <Download className="w-4 h-4 mr-2" />
                Excel
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div id="monthly-report-content">
            {/* Report Header */}
            <div className="text-center mb-6 print-only hidden">
              <h1 className="text-2xl font-bold">TROPHFRUIT UK LTD</h1>
              <p className="text-gray-600">3 Dolphin Way, Purfleet, RM19 1NZ</p>
              <h2 className="text-xl font-semibold mt-4 capitalize">{reportType} Report</h2>
              <p className="text-gray-600">
                {new Date(year, month - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
              </p>
            </div>

            {/* Monthly Summary Cards */}
            {monthlyStats && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <Card className="bg-gradient-to-r from-green-500 to-green-600 text-white">
                  <CardContent className="p-6">
                    <h4 className="text-lg font-semibold">Total Working Days</h4>
                    <p className="text-3xl font-bold mt-2">{monthlyStats.workingDays}</p>
                    <p className="text-green-100 text-sm mt-1">Excluding weekends & holidays</p>
                  </CardContent>
                </Card>
                
                <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
                  <CardContent className="p-6">
                    <h4 className="text-lg font-semibold">Average Attendance</h4>
                    <p className="text-3xl font-bold mt-2">{monthlyStats.avgAttendance}%</p>
                    <p className="text-blue-100 text-sm mt-1">Monthly average</p>
                  </CardContent>
                </Card>
                
                <Card className="bg-gradient-to-r from-purple-500 to-purple-600 text-white">
                  <CardContent className="p-6">
                    <h4 className="text-lg font-semibold">Total Leave Days</h4>
                    <p className="text-3xl font-bold mt-2">{monthlyStats.totalLeaves}</p>
                    <p className="text-purple-100 text-sm mt-1">Approved leaves</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Report Content Based on Type */}
            {reportType === "payroll" ? (
              <div className="space-y-6">
                {payrollData && payrollData.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-4 font-medium text-gray-700">Employee</th>
                          <th className="text-center py-3 px-4 font-medium text-gray-700">Attendance %</th>
                          <th className="text-center py-3 px-4 font-medium text-gray-700">Regular Hours</th>
                          <th className="text-center py-3 px-4 font-medium text-gray-700">Overtime Hours</th>
                          <th className="text-center py-3 px-4 font-medium text-gray-700">Hourly Rate</th>
                          <th className="text-center py-3 px-4 font-medium text-gray-700">Gross Pay</th>
                          <th className="text-center py-3 px-4 font-medium text-gray-700">Tax (20%)</th>
                          <th className="text-center py-3 px-4 font-medium text-gray-700">NI (12%)</th>
                          <th className="text-center py-3 px-4 font-medium text-gray-700">Net Pay</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {payrollData.map((data) => {
                          const initials = data.employee.name.split(' ').map(n => n[0]).join('').toUpperCase();
                          
                          return (
                            <tr key={data.employee.id} className="hover:bg-gray-50">
                              <td className="py-4 px-4">
                                <div className="flex items-center space-x-3">
                                  <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center text-sm font-medium">
                                    {initials}
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-gray-900">{data.employee.name}</p>
                                    <p className="text-xs text-gray-500">{data.employee.employeeId} - {data.employee.department}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-4 px-4 text-center">
                                <Badge className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getAttendanceColor(data.attendance.attendancePercentage)}`}>
                                  {data.attendance.attendancePercentage}%
                                </Badge>
                              </td>
                              <td className="py-4 px-4 text-center text-sm text-gray-900 font-semibold">{data.payroll.regularHours}h</td>
                              <td className="py-4 px-4 text-center text-sm text-blue-600 font-semibold">{data.payroll.overtimeHours}h</td>
                              <td className="py-4 px-4 text-center text-sm text-gray-900">£{data.payroll.hourlyRate}</td>
                              <td className="py-4 px-4 text-center text-sm text-green-600 font-bold">£{data.payroll.grossPay}</td>
                              <td className="py-4 px-4 text-center text-sm text-red-600">£{data.payroll.tax}</td>
                              <td className="py-4 px-4 text-center text-sm text-red-600">£{data.payroll.nationalInsurance}</td>
                              <td className="py-4 px-4 text-center text-sm text-green-700 font-bold">£{data.payroll.netPay}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    No payroll data found for the selected month.
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-medium text-gray-700">Employee</th>
                      <th className="text-center py-3 px-4 font-medium text-gray-700">Present Days</th>
                      <th className="text-center py-3 px-4 font-medium text-gray-700">Absent Days</th>
                      <th className="text-center py-3 px-4 font-medium text-gray-700">Leave Days</th>
                      <th className="text-center py-3 px-4 font-medium text-gray-700">Holiday Days</th>
                      <th className="text-center py-3 px-4 font-medium text-gray-700">Attendance %</th>
                      <th className="text-center py-3 px-4 font-medium text-gray-700">Total Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {employeeData.map((data) => {
                      const initials = data.employee.name.split(' ').map(n => n[0]).join('').toUpperCase();
                      
                      return (
                        <tr key={data.employee.id} className="hover:bg-gray-50">
                          <td className="py-4 px-4">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center text-sm font-medium">
                                {initials}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">{data.employee.name}</p>
                                <p className="text-xs text-gray-500">{data.employee.employeeId} - {data.employee.department}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-center text-sm text-green-600 font-semibold">{data.presentDays}</td>
                          <td className="py-4 px-4 text-center text-sm text-red-600 font-semibold">{data.absentDays}</td>
                          <td className="py-4 px-4 text-center text-sm text-orange-600 font-semibold">{data.leaveDays}</td>
                          <td className="py-4 px-4 text-center text-sm text-blue-600 font-semibold">{data.holidayDays}</td>
                          <td className="py-4 px-4 text-center">
                            <Badge className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getAttendanceColor(data.attendancePercentage)}`}>
                              {data.attendancePercentage}%
                            </Badge>
                          </td>
                          <td className="py-4 px-4 text-center text-sm text-gray-900 font-semibold">{data.totalHours}h</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {employeeData.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No attendance data found for the selected month.
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}