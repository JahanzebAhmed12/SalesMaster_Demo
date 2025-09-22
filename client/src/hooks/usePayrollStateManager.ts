import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePayrollCrossTabSync } from './usePayrollCrossTabSync';
import { usePayrollInvalidation } from './usePayrollInvalidation';

/**
 * Comprehensive payroll state management hook that coordinates:
 * - Cross-tab synchronization
 * - Query invalidation
 * - State consistency across payroll operations
 */
export const usePayrollStateManager = () => {
  const queryClient = useQueryClient();
  const crossTabSync = usePayrollCrossTabSync();
  const invalidation = usePayrollInvalidation();

  // Enhanced broadcast functions that also handle local state updates
  const broadcastAndInvalidate = {
    holidayRequest: {
      created: (data?: any) => {
        crossTabSync.broadcastHolidayRequestOperation('CREATED', data);
        invalidation.invalidateHolidayRequestQueries();
      },
      updated: (data?: any) => {
        crossTabSync.broadcastHolidayRequestOperation('UPDATED', data);
        invalidation.invalidateHolidayRequestQueries();
      },
      deleted: (data?: any) => {
        crossTabSync.broadcastHolidayRequestOperation('DELETED', data);
        invalidation.invalidateHolidayRequestQueries();
      },
      approved: (data?: any) => {
        crossTabSync.broadcastHolidayRequestOperation('APPROVED', data);
        invalidation.invalidateHolidayRequestQueries();
      },
      rejected: (data?: any) => {
        crossTabSync.broadcastHolidayRequestOperation('REJECTED', data);
        invalidation.invalidateHolidayRequestQueries();
      }
    },
    attendance: {
      created: (data?: any) => {
        crossTabSync.broadcastAttendanceOperation('CREATED', data);
        invalidation.invalidateAttendanceQueries();
      },
      updated: (data?: any) => {
        crossTabSync.broadcastAttendanceOperation('UPDATED', data);
        invalidation.invalidateAttendanceQueries();
      },
      deleted: (data?: any) => {
        crossTabSync.broadcastAttendanceOperation('DELETED', data);
        invalidation.invalidateAttendanceQueries();
      },
      bulkUpdate: (data?: any) => {
        crossTabSync.broadcastAttendanceOperation('BULK_UPDATE', data);
        invalidation.invalidateAttendanceQueries();
      }
    },
    payroll: {
      calculated: (data?: any) => {
        crossTabSync.broadcastPayrollOperation('CALCULATED', data);
        invalidation.invalidatePayrollQueries();
      },
      updated: (data?: any) => {
        crossTabSync.broadcastPayrollOperation('UPDATED', data);
        invalidation.invalidatePayrollQueries();
      },
      generated: (data?: any) => {
        crossTabSync.broadcastPayrollOperation('GENERATED', data);
        invalidation.invalidatePayrollQueries();
      }
    },
    employee: {
      payrollUpdated: (data?: any) => {
        crossTabSync.broadcastEmployeePayrollUpdate('PAYROLL_UPDATED', data);
        invalidation.invalidateEmployeePayrollQueries();
      },
      salaryUpdated: (data?: any) => {
        crossTabSync.broadcastEmployeePayrollUpdate('SALARY_UPDATED', data);
        invalidation.invalidateEmployeePayrollQueries();
      },
      attendanceUpdated: (data?: any) => {
        crossTabSync.broadcastEmployeePayrollUpdate('ATTENDANCE_UPDATED', data);
        invalidation.invalidateEmployeePayrollQueries();
      }
    }
  };

  // Bulk operations for mass updates
  const bulkOperations = {
    invalidateAll: () => {
      invalidation.invalidateAllPayrollQueries();
    },
    
    refreshPayrollData: async () => {
      console.log('Payroll State Manager: Refreshing all payroll data');
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['/api/holiday-requests'] }),
        queryClient.refetchQueries({ queryKey: ['/api/attendance'] }),
        queryClient.refetchQueries({ queryKey: ['/api/reports/attendance'] }),
        queryClient.refetchQueries({ queryKey: ['/api/reports/attendance-stats'] }),
        queryClient.refetchQueries({ queryKey: ['/api/payroll'] }),
        queryClient.refetchQueries({ queryKey: ['/api/reports/payroll'] }),
        queryClient.refetchQueries({ queryKey: ['/api/employees'] })
      ]);
    }
  };

  // State monitoring and debugging
  const getPayrollCacheStatus = () => {
    const cache = queryClient.getQueryCache();
    const payrollQueries = cache.getAll().filter(query => {
      const key = query.queryKey[0] as string;
      return key?.includes('/api/holiday-requests') || 
             key?.includes('/api/attendance') || 
             key?.includes('/api/payroll') ||
             key?.includes('/api/reports/attendance') ||
             key?.includes('/api/reports/payroll') ||
             (key?.includes('/api/employees') && query.queryKey.length > 1);
    });

    return {
      totalQueries: payrollQueries.length,
      staleQueries: payrollQueries.filter(q => q.isStale()).length,
      fetchingQueries: payrollQueries.filter(q => q.isFetching()).length,
      errorQueries: payrollQueries.filter(q => q.state.status === 'error').length,
      queries: payrollQueries.map(q => ({
        key: q.queryKey,
        status: q.state.status,
        dataUpdatedAt: q.state.dataUpdatedAt,
        isStale: q.isStale(),
        isFetching: q.isFetching()
      }))
    };
  };

  return {
    // Main broadcast and invalidation functions
    broadcast: broadcastAndInvalidate,
    
    // Bulk operations
    bulkOperations,
    
    // Direct access to underlying hooks
    crossTabSync,
    invalidation,
    
    // Debugging and monitoring
    getPayrollCacheStatus,
    
    // Utility functions
    clearPayrollCache: () => {
      const cache = queryClient.getQueryCache();
      const payrollQueries = cache.getAll().filter(query => {
        const key = query.queryKey[0] as string;
        return key?.includes('/api/holiday-requests') || 
               key?.includes('/api/attendance') || 
               key?.includes('/api/payroll') ||
               key?.includes('/api/reports/attendance') ||
               key?.includes('/api/reports/payroll');
      });
      
      payrollQueries.forEach(query => {
        queryClient.removeQueries({ queryKey: query.queryKey });
      });
    },
    
    // Force refresh specific payroll data
    forceRefresh: {
      holidayRequests: () => queryClient.refetchQueries({ queryKey: ['/api/holiday-requests'] }),
      attendance: () => queryClient.refetchQueries({ queryKey: ['/api/attendance'] }),
      attendanceReports: () => queryClient.refetchQueries({ queryKey: ['/api/reports/attendance'] }),
      payroll: () => queryClient.refetchQueries({ queryKey: ['/api/payroll'] }),
      payrollReports: () => queryClient.refetchQueries({ queryKey: ['/api/reports/payroll'] }),
      employees: () => queryClient.refetchQueries({ queryKey: ['/api/employees'] })
    }
  };
};