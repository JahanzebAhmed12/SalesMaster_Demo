import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Printer, FileText, Download, RefreshCw, CalendarIcon } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";
import type { Employee, EmployeeWithAttendance } from "@shared/schema";
import React from "react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { DateRange } from "react-day-picker";

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
  employee: {
    id: number;
    fullName: string;
    title: string | null;
    status: string;
    dailyWage: number | null;
  };
  attendance: {
    presentDays: number;
    absentDays: number;
    leaveDays: number;
    holidayDays: number;
    attendancePercentage: number;
  };
  payroll: {
    workingDays: number;
    dailyWage: number;
    grossPay: number;
    tax: number;
    nationalInsurance: number;
    netPay: number;
  };
}

export default function MonthlyReports() {
  const { toast } = useToast();
  
  // Date range state - default to last 7 days
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(today.getDate() - 7);
    return {
      from: lastWeek,
      to: today
    };
  });

  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");

  // Fetch employees first
  const { data: employees = [], isLoading: isLoadingEmployees } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
    queryFn: () => apiRequest("GET", "/api/employees"),
    select: (data) => data.filter((emp: Employee) => emp.status === "active"),
  });

  // Fetch attendance data using new endpoint
  const { data: attendanceData = [], isLoading: isLoadingAttendance, refetch: refetchAttendance } = useQuery({
    queryKey: [
      '/api/reports/attendance',
      dateRange?.from?.toISOString().slice(0, 10),
      dateRange?.to?.toISOString().slice(0, 10),
      selectedEmployee
    ],
    queryFn: () => {
      if (!dateRange?.from || !dateRange?.to) return [];
      
      let url = `/api/reports/attendance?from_date=${dateRange.from.toISOString().slice(0, 10)}&to_date=${dateRange.to.toISOString().slice(0, 10)}`;
      if (selectedEmployee !== 'all') {
        url += `&employee_id=${selectedEmployee}`;
      }
      return apiRequest("GET", url);
    },
    enabled: !!dateRange?.from && !!dateRange?.to,
  });

  // Fetch attendance statistics
  const { data: attendanceStats, refetch: refetchStats } = useQuery({
    queryKey: [
      '/api/reports/attendance-stats',
      dateRange?.from?.toISOString().slice(0, 10),
      dateRange?.to?.toISOString().slice(0, 10)
    ],
    queryFn: () => {
      if (!dateRange?.from || !dateRange?.to) return null;
      
      return apiRequest("GET", `/api/reports/attendance-stats?from_date=${dateRange.from.toISOString().slice(0, 10)}&to_date=${dateRange.to.toISOString().slice(0, 10)}`);
    },
    enabled: !!dateRange?.from && !!dateRange?.to,
  });

  const handleFetchData = async () => {
    try {
      await refetchAttendance();
      await refetchStats();
      toast({
        title: "Success",
        description: "Data fetched successfully",
      });
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({
        title: "Error",
        description: "Failed to fetch data",
        variant: "destructive",
      });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handlePDFExport = async () => {
    const doc = new jsPDF();
    
    // Add header
    doc.setFontSize(16);
    doc.text('TROPIFRUIT UK LTD', 105, 20, { align: 'center' });
    doc.setFontSize(12);
    doc.text('3 Dolphin Way, Purfleet, RM19 1NZ', 105, 30, { align: 'center' });
    doc.setFontSize(14);
    doc.text('Attendance Report', 105, 45, { align: 'center' });
    
    if (dateRange?.from && dateRange?.to) {
      doc.setFontSize(10);
      doc.text(`${format(dateRange.from, "LLL dd, y")} - ${format(dateRange.to, "LLL dd, y")}`, 105, 55, { align: 'center' });
    }
    
    // Add attendance table
    const tableData = processedAttendanceData.map(item => [
      item.employee.name || item.employee.fullName || 'Unknown',
      item.presentDays.toString(),
      item.absentDays.toString(),
      item.leaveDays.toString(),
      item.holidayDays.toString(),
      `${item.attendancePercentage}%`,
      item.totalHours.toString()
    ]);
    
    // Use autoTable for better table formatting
    (doc as any).autoTable({
      head: [['Employee', 'Present', 'Absent', 'Leave', 'Holiday', 'Attendance %', 'Total Hours']],
      body: tableData,
      startY: 65,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] }
    });
    
    doc.save(`attendance-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const handleExcelExport = () => {
    const worksheetData = [
      ['Employee', 'Present Days', 'Absent Days', 'Leave Days', 'Holiday Days', 'Attendance %', 'Total Hours'],
      ...processedAttendanceData.map(item => [
        item.employee.name || item.employee.fullName || 'Unknown',
        item.presentDays,
        item.absentDays,
        item.leaveDays,
        item.holidayDays,
        item.attendancePercentage,
        item.totalHours
      ])
    ];
    
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Report');
    
    XLSX.writeFile(workbook, `attendance-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  // Process attendance data for display
  const processedAttendanceData = attendanceData.map(item => ({
    employee: item.employee,
    presentDays: item.attendance.presentDays,
    absentDays: item.attendance.absentDays,
    leaveDays: item.attendance.leaveDays,
    holidayDays: item.attendance.holidayDays,
    attendancePercentage: item.attendance.attendancePercentage,
    totalHours: item.attendance.totalHours,
  }));

  const hasAttendanceData = processedAttendanceData.length > 0;

  const getAttendanceColor = (percentage: number) => {
    if (percentage >= 95) return "bg-green-100 text-green-800";
    if (percentage >= 85) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  return (
    <div className="space-y-6">
      {/* Print-only CSS */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #payroll-print-area, #payroll-print-area * { visibility: visible !important; }
          #payroll-print-area { position: absolute !important; left: 0; top: 0; width: 100vw; background: white; box-shadow: none; }
        }
      `}</style>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-4 overflow-x-auto">
            <CardTitle className="flex-shrink-0">Attendance Reports & Payroll</CardTitle>
            <div className="flex flex-wrap gap-3 items-center ml-auto">
              {/* Date Range Picker */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="date"
                    variant={"outline"}
                    className={cn(
                      "w-[300px] justify-start text-left font-normal",
                      !dateRange && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "LLL dd, y")} -{" "}
                          {format(dateRange.to, "LLL dd, y")}
                        </>
                      ) : (
                        format(dateRange.from, "LLL dd, y")
                      )
                    ) : (
                      <span>Pick a date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>

              {/* Employee Filter */}
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id.toString()}>
                      {emp.name || emp.fullName || `Employee ${emp.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button onClick={handleFetchData} className="bg-blue-600 hover:bg-blue-700" disabled={isLoadingAttendance}>
                <RefreshCw className="w-4 h-4 mr-2" />
                {isLoadingAttendance ? "Loading..." : "Refresh"}
              </Button>
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
              <h1 className="text-2xl font-bold">TROPIFRUIT UK LTD</h1>
              <p className="text-gray-600">3 Dolphin Way, Purfleet, RM19 1NZ</p>
              <h2 className="text-xl font-semibold mt-4">Attendance Report</h2>
              <p className="text-gray-600">
                {dateRange?.from && dateRange?.to ? (
                  `${format(dateRange.from, "LLL dd, y")} - ${format(dateRange.to, "LLL dd, y")}`
                ) : (
                  "Select date range"
                )}
              </p>
            </div>

            {/* Summary Cards */}
            {attendanceStats && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <Card className="bg-gradient-to-r from-green-500 to-green-600 text-white">
                  <CardContent className="p-6">
                    <h4 className="text-lg font-semibold">Total Working Days</h4>
                    <p className="text-3xl font-bold mt-2">
                      {attendanceStats.workingDays}
                    </p>
                    <p className="text-green-100 text-sm mt-1">Days in selected range</p>
                  </CardContent>
                </Card>
                
                <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
                  <CardContent className="p-6">
                    <h4 className="text-lg font-semibold">Average Attendance</h4>
                    <p className="text-3xl font-bold mt-2">
                      {attendanceStats.avgAttendance}%
                    </p>
                    <p className="text-blue-100 text-sm mt-1">Period average</p>
                  </CardContent>
                </Card>
                
                <Card className="bg-gradient-to-r from-purple-500 to-purple-600 text-white">
                  <CardContent className="p-6">
                    <h4 className="text-lg font-semibold">Total Leave Days</h4>
                    <p className="text-3xl font-bold mt-2">
                      {attendanceStats.totalLeaves}
                    </p>
                    <p className="text-purple-100 text-sm mt-1">Approved leaves</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Attendance Table */}
            <div>
              {isLoadingAttendance ? (
                <div className="text-center py-8">Loading attendance data...</div>
              ) : !hasAttendanceData ? (
                <div className="text-center py-8 text-gray-500">
                  No attendance data found for the selected period.
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
                      {processedAttendanceData.map((item) => {
                        if (!item || !item.employee) {
                          console.error("Invalid employee attendance data item (skipping):", item);
                          return null;
                        }
                        const name = item.employee.name || item.employee.fullName || 'Unknown';
                        const initials = name.split(' ').map((n: string) => n[0]).join('').toUpperCase();
                        return (
                          <tr key={item.employee.id} className="hover:bg-gray-50">
                            <td className="py-4 px-4">
                              <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center text-sm font-medium">
                                  {initials}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-900">{name}</p>
                                  <p className="text-xs text-gray-500">{item.employee.title || 'No Title'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-4 text-center text-sm text-gray-900 font-semibold">{item.presentDays}</td>
                            <td className="py-4 px-4 text-center text-sm text-gray-900">{item.absentDays}</td>
                            <td className="py-4 px-4 text-center text-sm text-gray-900">{item.leaveDays}</td>
                            <td className="py-4 px-4 text-center text-sm text-gray-900">{item.holidayDays}</td>
                            <td className="py-4 px-4 text-center">
                              <Badge className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getAttendanceColor(item.attendancePercentage)}`}>
                                {item.attendancePercentage}%
                              </Badge>
                            </td>
                            <td className="py-4 px-4 text-center text-sm text-gray-900">{item.totalHours}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      {/* Simple Payroll Section */}
      <div className="bg-white rounded-xl shadow p-0 mt-8">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h3 className="text-lg font-semibold">Simple Payroll (Present Days × Daily Wage)</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={handlePrint} title="Print"><Printer className="w-4 h-4" /></Button>
            <Button variant="outline" size="icon" onClick={handlePDFExport} title="Export PDF"><FileText className="w-4 h-4" /></Button>
            <Button variant="outline" size="icon" onClick={handleExcelExport} title="Export Excel"><Download className="w-4 h-4" /></Button>
          </div>
        </div>
        <div className="px-6 pt-4 pb-6" id="payroll-print-area">
          <div className="text-sm text-gray-600 mb-4">
            Use the date range picker above to select the period for payroll calculation.
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="bg-blue-50">
                  <th className="text-center px-2 py-2">Employee</th>
                  <th className="text-center px-2 py-2">Present Days</th>
                  <th className="text-center px-2 py-2">Daily Wage</th>
                  <th className="text-center px-2 py-2">Pay</th>
                  <th className="text-center px-2 py-2">Present Dates</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingAttendance ? (
                  <tr><td colSpan={5} className="text-center py-8">Loading...</td></tr>
                ) : attendanceData.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8">No data for selected period</td></tr>
                ) : attendanceData.map((item: any) => (
                  <tr key={item.employee.id} className="hover:bg-blue-50">
                    <td className="text-center px-2 py-2 font-medium">{item.employee.name || item.employee.fullName || `Employee ${item.employee.id}`}</td>
                    <td className="text-center px-2 py-2">{item.presentDays}</td>
                    <td className="text-center px-2 py-2">£{item.employee.salary || item.employee.dailyWage || '0.00'}</td>
                    <td className="text-center px-2 py-2 font-bold text-green-700">£{item.pay}</td>
                    <td className="text-center px-2 py-2 text-xs">{(item.presentDates || []).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}