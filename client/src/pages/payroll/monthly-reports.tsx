import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Printer, FileText, Download, RefreshCw, Mail, Search, X } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";
import type { Employee, EmployeeWithAttendance } from "@shared/schema";
import React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { DateRangeFilter } from "@/components/ui/date-range-filter";


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

interface AttendanceExportItem {
  employee: {
    id: number;
    name: string;
    fullName?: string;
    title?: string | null;
    salary?: number | string | null;
    dailyWage?: number | string | null;
  };
  presentDays: number;
  attendance: {
    presentDays: number;
    absentDays: number;
    leaveDays: number;
    holidayDays: number;
    attendancePercentage: number;
    totalHours: number;
  };
  dailyAttendance?: Record<string, {
    status?: string | null;
    leave_type?: string | null;
    holiday_name?: string | null;
  }>;
}

type ExportCell = string | number;

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

// Helper function to format date without timezone conversion
const formatDateForAPI = (date: Date): string => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export default function MonthlyReports() {
  const { toast } = useToast();
  
  // Date state - default to last 7 days
  const [fromDate, setFromDate] = useState<Date>(() => {
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    return lastWeek;
  });
  
  const [toDate, setToDate] = useState<Date>(() => {
    return new Date();
  });

  // Validation function to ensure toDate is not before fromDate
  const handleToDateChange = (date: Date) => {
    if (date < fromDate) {
      toast({
        title: "Invalid Date Range",
        description: "To date cannot be before From date",
        variant: "destructive",
      });
      return;
    }
    setToDate(date);
  };

  const handleFromDateChange = (date: Date) => {
    setFromDate(date);
    // If toDate is before the new fromDate, keep both dates valid by aligning it.
    if (toDate < date) {
      setToDate(date);
    }
  };

  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");
  const [employeeSearchOpen, setEmployeeSearchOpen] = useState(false);
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState("");
  const [emailAddress, setEmailAddress] = useState<string>("");
  const [isEmailSending, setIsEmailSending] = useState(false);

  // Fetch employees first
  const { data: employees = [], isLoading: isLoadingEmployees } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
    queryFn: () => apiRequest("GET", "/api/employees"),
    select: (data) => data.filter((emp: Employee) => emp.status === "active"),
  });

  // Fetch attendance data using new endpoint
  const { data: attendanceData = [], isLoading: isLoadingAttendance, refetch: refetchAttendance } = useQuery<AttendanceExportItem[]>({
    queryKey: [
      '/api/reports/attendance',
      fromDate ? formatDateForAPI(fromDate) : null,
      toDate ? formatDateForAPI(toDate) : null,
      selectedEmployee
    ],
    queryFn: () => {
      if (!fromDate || !toDate) return [];
      
      // Use timezone-safe date formatting to avoid timezone conversion issues
      const fromDateStr = formatDateForAPI(fromDate);
      const toDateStr = formatDateForAPI(toDate);
      
      let url = `/api/reports/attendance?from_date=${fromDateStr}&to_date=${toDateStr}`;
      if (selectedEmployee !== 'all') {
        url += `&employee_id=${selectedEmployee}`;
      }
      console.log('Fetching attendance data for:', { fromDateStr, toDateStr, url });
      return apiRequest("GET", url).then(data => {
        console.log('Received attendance data:', data);
        return data;
      });
    },
    enabled: !!fromDate && !!toDate,
  });

  // Fetch attendance statistics
  const { data: attendanceStats, refetch: refetchStats } = useQuery({
    queryKey: [
      '/api/reports/attendance-stats',
      fromDate ? formatDateForAPI(fromDate) : null,
      toDate ? formatDateForAPI(toDate) : null
    ],
    queryFn: () => {
      if (!fromDate || !toDate) return null;
      
      // Use timezone-safe date formatting to avoid timezone conversion issues
      const fromDateStr = formatDateForAPI(fromDate);
      const toDateStr = formatDateForAPI(toDate);
      const url = `/api/reports/attendance-stats?from_date=${fromDateStr}&to_date=${toDateStr}`;
      
      console.log('Fetching attendance stats for:', { fromDateStr, toDateStr, url });
      return apiRequest("GET", url);
    },
    enabled: !!fromDate && !!toDate,
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
    
    if (fromDate && toDate) {
      doc.setFontSize(10);
      doc.text(`${format(fromDate, "LLL dd, y")} - ${format(toDate, "LLL dd, y")}`, 105, 55, { align: 'center' });
    }
    
    // Add attendance table
    const tableData: ExportCell[][] = processedAttendanceData.map((item) => [
      item.employee.name || item.employee.fullName || 'Unknown',
      item.presentDays.toString(),
      item.absentDays.toString(),
      item.leaveDays.toString(),
      item.holidayDays.toString(),
      `${item.attendancePercentage}%`,
      item.totalHours.toString()
    ]);
    
    // Create table manually
    let yPosition = 65;
    const cellHeight = 8;
    const startX = 10;
    const headers = ['Employee', 'Present', 'Absent', 'Leave', 'Holiday', 'Attendance %', 'Total Hours'];
    const cellWidth = (210 - 20) / headers.length; // A4 width minus margins
    
    // Draw headers
    doc.setFillColor(59, 130, 246);
    doc.rect(startX, yPosition, cellWidth * headers.length, cellHeight, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    headers.forEach((header, index) => {
      doc.text(header, startX + (index * cellWidth) + 2, yPosition + 5);
    });
    
    yPosition += cellHeight;
    doc.setTextColor(0, 0, 0);
    
    // Draw data rows
    tableData.forEach((row, rowIndex) => {
      if (yPosition > 270) { // Start new page if needed
        doc.addPage();
        yPosition = 20;
      }
      
      // Alternate row colors
      if (rowIndex % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(startX, yPosition, cellWidth * headers.length, cellHeight, 'F');
      }
      
      row.forEach((cell, cellIndex) => {
        doc.text(String(cell), startX + (cellIndex * cellWidth) + 2, yPosition + 5);
      });
      
      yPosition += cellHeight;
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

  const handleDetailedPDFExport = async () => {
    if (!fromDate || !toDate) {
      toast({
        title: "Error",
        description: "Please select both from and to dates first",
        variant: "destructive",
      });
      return;
    }

    const doc = new jsPDF('l', 'mm', 'a4'); // Landscape orientation
    
    // Add header
    doc.setFontSize(16);
    doc.text('TROPIFRUIT UK LTD', 148, 15, { align: 'center' });
  
    doc.setFontSize(14);
    doc.text('Detailed Attendance Report Stand (73 and 100) ', 148, 32, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`${format(fromDate, "dd/MM/yyyy")} - ${format(toDate, "dd/MM/yyyy")}`, 148, 38, { align: 'center' });
    
  
    
    // Generate day headers with day names (Monday, Tuesday, etc.)
    const days: string[] = [];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDate = new Date(fromDate);
    while (currentDate <= toDate) {
      const dayName = dayNames[currentDate.getDay()];
      days.push(dayName);
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Create table headers
    const headers = ['Employee', ...days, 'Weekly Wage', 'Remarks'];
    
    // Create table data
    const tableData: ExportCell[][] = attendanceData.map((item) => {
      const weeklySalary = parseFloat(String(item.employee.salary ?? item.employee.dailyWage ?? '0'));
      const totalDaysInPeriod = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const workingDaysInPeriod = Math.min(6, totalDaysInPeriod);
      const weeklyPay = workingDaysInPeriod > 0 ? (weeklySalary * item.presentDays) / workingDaysInPeriod : 0;
      
      const row: ExportCell[] = [item.employee.name || item.employee.fullName || 'Unknown'];
      
      // Add daily attendance markings using actual daily data
      const currentDate = new Date(fromDate);
      days.forEach((day, dayIndex) => {
        const dateStr = formatDateForAPI(currentDate);
        const attendanceData = item.dailyAttendance?.[dateStr];
        const status = attendanceData?.status || '-';
        
        // Convert status to display format with additional details
        let displayValue = '-';
        switch (status) {
          case 'present':
            displayValue = 'P';
            break;
          case 'absent':
            displayValue = 'A';
            break;
          case 'leave':
            const leaveType = attendanceData?.leave_type;
            if (leaveType) {
              // Capitalize first letter and take first 3 chars for short form
              const shortLeaveType = leaveType.charAt(0).toUpperCase() + leaveType.slice(1, 3);
              displayValue = `L-${shortLeaveType}`;
            } else {
              displayValue = 'L';
            }
            break;
          case 'holiday':
            const holidayName = attendanceData?.holiday_name;
            if (holidayName) {
              // Take first word or first 8 characters, whichever is shorter
              const shortHolidayName = holidayName.split(' ')[0].slice(0, 8);
              displayValue = `H-${shortHolidayName}`;
            } else {
              displayValue = 'H';
            }
            break;
          default:
            displayValue = '-';
        }
        
        row.push(displayValue);
        currentDate.setDate(currentDate.getDate() + 1);
      });
      
      row.push(`£${weeklyPay.toFixed(2)}`);
      row.push(''); // Remarks column
      
      return row;
    });
    
    // Create table manually
    let yPosition = 50;
    const cellHeight = 6;
    const startX = 10;
    const cellWidth = (297 - 20) / headers.length; // A4 landscape width minus margins
    
    // Draw headers
    doc.setFillColor(59, 130, 246);
    doc.rect(startX, yPosition, cellWidth * headers.length, cellHeight, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    headers.forEach((header, index) => {
      doc.text(header, startX + (index * cellWidth) + 2, yPosition + 4);
    });
    
    yPosition += cellHeight;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(6);
    
    // Draw data rows
    tableData.forEach((row, rowIndex) => {
      if (yPosition > 200) { // Start new page if needed
        doc.addPage();
        yPosition = 20;
      }
      
      // Alternate row colors
      if (rowIndex % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(startX, yPosition, cellWidth * headers.length, cellHeight, 'F');
      }
      
      row.forEach((cell, cellIndex) => {
        doc.text(String(cell), startX + (cellIndex * cellWidth) + 2, yPosition + 4);
      });
      
      yPosition += cellHeight;
    });
    
    doc.save(`detailed-attendance-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const handleDetailedExcelExport = () => {
    if (!fromDate || !toDate) {
      toast({
        title: "Error",
        description: "Please select both from and to dates first",
        variant: "destructive",
      });
      return;
    }

    // Generate day headers with day names (Monday, Tuesday, etc.)
    const days: string[] = [];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDate = new Date(fromDate);
    while (currentDate <= toDate) {
      const dayName = dayNames[currentDate.getDay()];
      days.push(dayName);
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Create headers
    const headers = ['Employee', ...days, 'Weekly Wage', 'Remarks'];
    
    // Create data rows
    const worksheetData = [
      headers,
      ...attendanceData.map((item) => {
        const weeklySalary = parseFloat(String(item.employee.salary ?? item.employee.dailyWage ?? '0'));
        const totalDaysInPeriod = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const workingDaysInPeriod = Math.min(6, totalDaysInPeriod);
        const weeklyPay = workingDaysInPeriod > 0 ? (weeklySalary * item.presentDays) / workingDaysInPeriod : 0;
        
        const row: ExportCell[] = [item.employee.name || item.employee.fullName || 'Unknown'];
        
        // Add daily attendance markings using actual daily data
        const currentDate = new Date(fromDate);
        days.forEach((day, dayIndex) => {
          const dateStr = formatDateForAPI(currentDate);
          const attendanceData = item.dailyAttendance?.[dateStr];
          const status = attendanceData?.status || '-';
          
          // Convert status to display format with additional details
          let displayValue = '-';
          switch (status) {
            case 'present':
              displayValue = 'P';
              break;
            case 'absent':
              displayValue = 'A';
              break;
            case 'leave':
              const leaveType = attendanceData?.leave_type;
              if (leaveType) {
                // Capitalize first letter and take first 3 chars for short form
                const shortLeaveType = leaveType.charAt(0).toUpperCase() + leaveType.slice(1, 3);
                displayValue = `L-${shortLeaveType}`;
              } else {
                displayValue = 'L';
              }
              break;
            case 'holiday':
              const holidayName = attendanceData?.holiday_name;
              if (holidayName) {
                // Take first word or first 8 characters, whichever is shorter
                const shortHolidayName = holidayName.split(' ')[0].slice(0, 8);
                displayValue = `H-${shortHolidayName}`;
              } else {
                displayValue = 'H';
              }
              break;
            default:
              displayValue = '-';
          }
          
          row.push(displayValue);
          currentDate.setDate(currentDate.getDate() + 1);
        });
        
        row.push(`£${weeklyPay.toFixed(2)}`);
        row.push(''); // Remarks column
        
        return row;
      })
    ];
    
    // Add legend row
    worksheetData.push([]);
    worksheetData.push(['Legend: P=Present, A=Absent, L-Sic=Sick Leave, L-Ann=Annual Leave, H-Xmas=Christmas Holiday, -=No Record']);
    
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    
    // Style the header row
    const headerRange = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
      if (!worksheet[cellAddress]) continue;
      worksheet[cellAddress].s = {
        fill: { fgColor: { rgb: "3B82F6" } },
        font: { color: { rgb: "FFFFFF" }, bold: true }
      };
    }
    
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Detailed Attendance');
    
    XLSX.writeFile(workbook, `detailed-attendance-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const handleEmailReport = async (reportType: 'summary' | 'detailed') => {
    if (!emailAddress.trim()) {
      toast({
        title: "Error",
        description: "Please enter an email address",
        variant: "destructive",
      });
      return;
    }

    if (!fromDate || !toDate) {
      toast({
        title: "Error",
        description: "Please select both from and to dates first",
        variant: "destructive",
      });
      return;
    }

    setIsEmailSending(true);

    try {
      // Generate PDF content based on report type
      let pdfBlob;
      if (reportType === 'summary') {
        // Generate summary PDF
        const doc = new jsPDF();
        
        // Add header
        doc.setFontSize(16);
        doc.text('TROPIFRUIT UK LTD', 105, 20, { align: 'center' });
        doc.setFontSize(12);
        doc.text('3 Dolphin Way, Purfleet, RM19 1NZ', 105, 30, { align: 'center' });
        doc.setFontSize(14);
        doc.text('Attendance Summary Report', 105, 45, { align: 'center' });
        doc.setFontSize(10);
        doc.text(`${format(fromDate, "LLL dd, y")} - ${format(toDate, "LLL dd, y")}`, 105, 55, { align: 'center' });
        
        // Add summary table
        const tableData: ExportCell[][] = processedAttendanceData.map((item) => [
          item.employee.name || item.employee.fullName || 'Unknown',
          item.presentDays.toString(),
          item.absentDays.toString(),
          item.leaveDays.toString(),
          item.holidayDays.toString(),
          `${item.attendancePercentage}%`,
          item.totalHours.toString()
        ]);
        
        // Create table manually
        let yPosition = 65;
        const cellHeight = 8;
        const startX = 10;
        const headers = ['Employee', 'Present', 'Absent', 'Leave', 'Holiday', 'Attendance %', 'Total Hours'];
        const cellWidth = (210 - 20) / headers.length;
        
        // Draw headers
        doc.setFillColor(59, 130, 246);
        doc.rect(startX, yPosition, cellWidth * headers.length, cellHeight, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        headers.forEach((header, index) => {
          doc.text(header, startX + (index * cellWidth) + 2, yPosition + 5);
        });
        
        yPosition += cellHeight;
        doc.setTextColor(0, 0, 0);
        
        // Draw data rows
        tableData.forEach((row, rowIndex) => {
          if (yPosition > 270) {
            doc.addPage();
            yPosition = 20;
          }
          
          if (rowIndex % 2 === 0) {
            doc.setFillColor(248, 250, 252);
            doc.rect(startX, yPosition, cellWidth * headers.length, cellHeight, 'F');
          }
          
          row.forEach((cell, cellIndex) => {
            doc.text(String(cell), startX + (cellIndex * cellWidth) + 2, yPosition + 5);
          });
          
          yPosition += cellHeight;
        });
        
        pdfBlob = doc.output('blob');
      } else {
        // Generate detailed PDF (same as handleDetailedPDFExport but return blob)
        const doc = new jsPDF('l', 'mm', 'a4');
        
        // Add header
        doc.setFontSize(16);
        doc.text('TROPIFRUIT UK LTD', 148, 15, { align: 'center' });
        doc.setFontSize(12);
        doc.text('3 Dolphin Way, Purfleet, RM19 1NZ', 148, 22, { align: 'center' });
        doc.setFontSize(14);
        doc.text('Detailed Attendance Report', 148, 32, { align: 'center' });
        doc.setFontSize(10);
        doc.text(`${format(fromDate, "dd/MM/yyyy")} - ${format(toDate, "dd/MM/yyyy")}`, 148, 38, { align: 'center' });
        
        // Add legend
        doc.setFontSize(8);
        doc.text('Legend: P=Present, A=Absent, L-Sic=Sick Leave, L-Ann=Annual Leave, H-Xmas=Christmas Holiday, -=No Record', 148, 43, { align: 'center' });
        
        // Generate day headers (Day 1, Day 2, etc.)
        const days: string[] = [];
        const currentDate = new Date(fromDate);
        let dayCount = 1;
        while (currentDate <= toDate) {
          days.push(`Day ${dayCount}`);
          currentDate.setDate(currentDate.getDate() + 1);
          dayCount++;
        }
        
        const headers = ['Employee', ...days, 'Weekly Wage', 'Remarks'];
        
        const tableData: ExportCell[][] = attendanceData.map((item) => {
          const weeklySalary = parseFloat(String(item.employee.salary ?? item.employee.dailyWage ?? '0'));
          const totalDaysInPeriod = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          const workingDaysInPeriod = Math.min(6, totalDaysInPeriod);
          const weeklyPay = workingDaysInPeriod > 0 ? (weeklySalary * item.presentDays) / workingDaysInPeriod : 0;
          
          const row: ExportCell[] = [item.employee.name || item.employee.fullName || 'Unknown'];
          
          // Add daily attendance markings using actual daily data
          const currentDate = new Date(fromDate);
          days.forEach((day, dayIndex) => {
            const dateStr = formatDateForAPI(currentDate);
            const attendanceData = item.dailyAttendance?.[dateStr];
            const status = attendanceData?.status || '-';
            
            // Convert status to display format with additional details
            let displayValue = '-';
            switch (status) {
              case 'present':
                displayValue = 'P';
                break;
              case 'absent':
                displayValue = 'A';
                break;
              case 'leave':
                const leaveType = attendanceData?.leave_type;
                if (leaveType) {
                  // Capitalize first letter and take first 3 chars for short form
                  const shortLeaveType = leaveType.charAt(0).toUpperCase() + leaveType.slice(1, 3);
                  displayValue = `L-${shortLeaveType}`;
                } else {
                  displayValue = 'L';
                }
                break;
              case 'holiday':
                const holidayName = attendanceData?.holiday_name;
                if (holidayName) {
                  // Take first word or first 8 characters, whichever is shorter
                  const shortHolidayName = holidayName.split(' ')[0].slice(0, 8);
                  displayValue = `H-${shortHolidayName}`;
                } else {
                  displayValue = 'H';
                }
                break;
              default:
                displayValue = '-';
            }
            
            row.push(displayValue);
            currentDate.setDate(currentDate.getDate() + 1);
          });
          
          row.push(`£${weeklyPay.toFixed(2)}`);
          row.push('');
          
          return row;
        });
        
        // Create table manually
        let yPosition = 50;
        const cellHeight = 6;
        const startX = 10;
        const cellWidth = (297 - 20) / headers.length;
        
        // Draw headers
        doc.setFillColor(59, 130, 246);
        doc.rect(startX, yPosition, cellWidth * headers.length, cellHeight, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7);
        headers.forEach((header, index) => {
          doc.text(header, startX + (index * cellWidth) + 2, yPosition + 4);
        });
        
        yPosition += cellHeight;
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(6);
        
        tableData.forEach((row, rowIndex) => {
          if (yPosition > 200) {
            doc.addPage();
            yPosition = 20;
          }
          
          if (rowIndex % 2 === 0) {
            doc.setFillColor(248, 250, 252);
            doc.rect(startX, yPosition, cellWidth * headers.length, cellHeight, 'F');
          }
          
          row.forEach((cell, cellIndex) => {
            doc.text(String(cell), startX + (cellIndex * cellWidth) + 2, yPosition + 4);
          });
          
          yPosition += cellHeight;
        });
        
        pdfBlob = doc.output('blob');
      }

      // Convert blob to base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64data = reader.result?.toString().split(',')[1];
        
        // Send email via API
        const emailData = {
          to: emailAddress,
          subject: `${reportType === 'summary' ? 'Attendance Summary' : 'Detailed Attendance'} Report - ${format(fromDate!, "dd/MM/yyyy")} to ${format(toDate!, "dd/MM/yyyy")}`,
          body: `Please find attached the ${reportType === 'summary' ? 'attendance summary' : 'detailed attendance'} report for the period ${format(fromDate!, "dd/MM/yyyy")} to ${format(toDate!, "dd/MM/yyyy")}.\n\nBest regards,\nTropifruit UK Ltd`,
          attachment: {
            filename: `${reportType}-attendance-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`,
            content: base64data,
            contentType: 'application/pdf'
          }
        };

        await apiRequest('POST', '/api/send-email', emailData);
        
        toast({
          title: "Email Sent Successfully",
          description: `${reportType === 'summary' ? 'Summary' : 'Detailed'} report has been sent to ${emailAddress}`,
        });
        
        // Reset email field after successful send
        setEmailAddress("");
      };
      
      reader.readAsDataURL(pdfBlob);
      
    } catch (error) {
      console.error('Error sending email:', error);
      toast({
        title: "Error",
        description: "Failed to send email. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsEmailSending(false);
    }
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
              <DateRangeFilter
                from={fromDate}
                to={toDate}
                onFromChange={handleFromDateChange}
                onToChange={handleToDateChange}
                fromLabel="From:"
                toLabel="To:"
                dateFormat="dd/MM/yyyy"
              />



              {/* Employee Filter with Search */}
              <Popover open={employeeSearchOpen} onOpenChange={setEmployeeSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={employeeSearchOpen}
                    className="w-48 justify-between"
                  >
                    {selectedEmployee === "all" 
                      ? "All Employees" 
                      : employees.find(emp => emp.id.toString() === selectedEmployee)?.fullName ||
                        "Select employee..."
                    }
                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-0">
                  <div className="flex items-center border-b px-3 py-2">
                    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <Input
                      placeholder="Search employees..."
                      value={employeeSearchTerm}
                      onChange={(e) => setEmployeeSearchTerm(e.target.value)}
                      className="border-0 p-0 focus-visible:ring-0"
                    />
                    {employeeSearchTerm && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0"
                        onClick={() => setEmployeeSearchTerm("")}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="max-h-60 overflow-auto">
                    <div
                      className={cn(
                        "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                        selectedEmployee === "all" && "bg-accent"
                      )}
                      onClick={() => {
                        setSelectedEmployee("all");
                        setEmployeeSearchOpen(false);
                        setEmployeeSearchTerm("");
                      }}
                    >
                      All Employees
                    </div>
                    {employees
                      .filter(emp => {
                        const name = emp.fullName || `Employee ${emp.id}`;
                        return name.toLowerCase().includes(employeeSearchTerm.toLowerCase());
                      })
                      .map(emp => (
                        <div
                          key={emp.id}
                          className={cn(
                            "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                            selectedEmployee === emp.id.toString() && "bg-accent"
                          )}
                          onClick={() => {
                            setSelectedEmployee(emp.id.toString());
                            setEmployeeSearchOpen(false);
                            setEmployeeSearchTerm("");
                          }}
                        >
                          {emp.fullName || `Employee ${emp.id}`}
                        </div>
                      ))}
                  </div>
                </PopoverContent>
              </Popover>

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
          
          {/* Email Section */}
          <div className="flex flex-wrap items-center gap-3 mt-4 p-4 bg-gray-50 rounded-lg">
            <Label htmlFor="email" className="text-sm font-medium">Email Report:</Label>
            <Input
              id="email"
              type="email"
              placeholder="Enter email address"
              value={emailAddress}
              onChange={(e) => setEmailAddress(e.target.value)}
              className="w-64"
            />
            <Button 
              onClick={() => handleEmailReport('summary')} 
              disabled={isEmailSending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Mail className="w-4 h-4 mr-2" />
              {isEmailSending ? "Sending..." : "Email Summary"}
            </Button>
            <Button 
              onClick={() => handleEmailReport('detailed')} 
              disabled={isEmailSending}
              variant="outline"
              className="bg-purple-600 text-white hover:bg-purple-700"
            >
              <Mail className="w-4 h-4 mr-2" />
              {isEmailSending ? "Sending..." : "Email Detailed"}
            </Button>
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
                {fromDate && toDate ? (
                  `${format(fromDate, "LLL dd, y")} - ${format(toDate, "LLL dd, y")}`
                ) : (
                  "Select from and to dates"
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
      {/* Weekly Payroll Section */}
      <div className="bg-white rounded-xl shadow p-0 mt-8">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h3 className="text-lg font-semibold">Weekly Payroll (6 Working Days)</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={handlePrint} title="Print"><Printer className="w-4 h-4" /></Button>
            <Button variant="outline" size="icon" onClick={handlePDFExport} title="Export PDF"><FileText className="w-4 h-4" /></Button>
            <Button variant="outline" size="icon" onClick={handleExcelExport} title="Export Excel"><Download className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" onClick={handleDetailedPDFExport} className="bg-purple-600 text-white hover:bg-purple-700">
              <FileText className="w-4 h-4 mr-1" />
              PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handleDetailedExcelExport} className="bg-orange-600 text-white hover:bg-orange-700">
              <Download className="w-4 h-4 mr-1" />
              Excel
            </Button>
          </div>
        </div>
        <div className="px-6 pt-4 pb-6" id="payroll-print-area">
          <div className="text-sm text-gray-600 mb-4">
            <div className="bg-blue-50 p-3 rounded-lg">
              <strong>Wage Calculation:</strong> Based on selected date range. 
              Daily rate = Weekly salary ÷ Working days in period. 
              Final pay = Daily rate × Present days.
              {fromDate && toDate && (
                <div className="mt-1 text-xs">
                  Period: {Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1} days 
                  ({format(fromDate, 'dd/MM/yyyy')} to {format(toDate, 'dd/MM/yyyy')})
                </div>
              )}
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="bg-blue-50">
                  <th className="text-center px-2 py-2">Employee</th>
                  <th className="text-center px-2 py-2">Weekly Salary</th>
                  <th className="text-center px-2 py-2">Present Days</th>
                  <th className="text-center px-2 py-2">Working Days</th>
                  <th className="text-center px-2 py-2">Attendance %</th>
                  <th className="text-center px-2 py-2">Weekly Pay</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingAttendance ? (
                  <tr><td colSpan={6} className="text-center py-8">Loading...</td></tr>
                ) : attendanceData.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8">No data for selected period</td></tr>
                ) : attendanceData.map((item) => {
                  const weeklySalary = parseFloat(String(item.employee.salary ?? item.employee.dailyWage ?? '0'));
                  // Calculate total days in the selected period
                  const totalDaysInPeriod = fromDate && toDate ? Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1 : 1;
                  const workingDaysInPeriod = Math.min(6, totalDaysInPeriod); // Max 6 working days per week
                  const weeklyPay = workingDaysInPeriod > 0 ? (weeklySalary * item.presentDays) / workingDaysInPeriod : 0;
                  const attendancePercentage = workingDaysInPeriod > 0 ? Math.round((item.presentDays / workingDaysInPeriod) * 100) : 0;
                  
                  return (
                    <tr key={item.employee.id} className="hover:bg-blue-50">
                      <td className="text-center px-2 py-2 font-medium">{item.employee.name || item.employee.fullName || `Employee ${item.employee.id}`}</td>
                      <td className="text-center px-2 py-2">£{weeklySalary.toFixed(2)}</td>
                      <td className="text-center px-2 py-2 font-semibold text-green-600">{item.presentDays}</td>
                      <td className="text-center px-2 py-2">{workingDaysInPeriod}</td>
                      <td className="text-center px-2 py-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          attendancePercentage >= 90 ? 'bg-green-100 text-green-800' :
                          attendancePercentage >= 70 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {attendancePercentage}%
                        </span>
                      </td>
                      <td className="text-center px-2 py-2 font-bold text-green-700">£{weeklyPay.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}