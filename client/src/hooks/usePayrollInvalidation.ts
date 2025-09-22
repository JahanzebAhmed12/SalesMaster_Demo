import { useQueryClient } from '@tanstack/react-query';

export const usePayrollInvalidation = () => {
  const queryClient = useQueryClient();

  // Holiday request related invalidations
  const invalidateHolidayRequestQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/holiday-requests"] });
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.includes('/api/holiday-requests');
      }
    });
    
    // Force refetch active holiday request queries
    queryClient.refetchQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.includes('/api/holiday-requests');
      }
    });
  };

  // Employee attendance related invalidations
  const invalidateAttendanceQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });
    queryClient.invalidateQueries({ queryKey: ["/api/reports/attendance"] });
    queryClient.invalidateQueries({ queryKey: ["/api/reports/attendance-stats"] });
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && (
          key.includes('/api/attendance') ||
          key.includes('/api/reports/attendance')
        );
      }
    });
    
    // Force refetch active attendance queries
    queryClient.refetchQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && (
          key.includes('/api/attendance') ||
          key.includes('/api/reports/attendance')
        );
      }
    });
  };

  // Payroll related invalidations
  const invalidatePayrollQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/payroll"] });
    queryClient.invalidateQueries({ queryKey: ["/api/reports/payroll"] });
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && (
          key.includes('/api/payroll') ||
          key.includes('/api/reports/payroll')
        );
      }
    });
    
    // Force refetch active payroll queries
    queryClient.refetchQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && (
          key.includes('/api/payroll') ||
          key.includes('/api/reports/payroll')
        );
      }
    });
  };

  // Employee related invalidations (for payroll context)
  const invalidateEmployeePayrollQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
    queryClient.invalidateQueries({ queryKey: ["employees"] });
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.includes('/api/employees');
      }
    });
    
    // Force refetch active employee queries
    queryClient.refetchQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && (
          key === "employees" || 
          key.includes('/api/employees')
        );
      }
    });
  };

  // Invalidate all payroll-related queries
  const invalidateAllPayrollQueries = () => {
    invalidateHolidayRequestQueries();
    invalidateAttendanceQueries();
    invalidatePayrollQueries();
    invalidateEmployeePayrollQueries();
  };

  return {
    invalidateHolidayRequestQueries,
    invalidateAttendanceQueries,
    invalidatePayrollQueries,
    invalidateEmployeePayrollQueries,
    invalidateAllPayrollQueries
  };
};