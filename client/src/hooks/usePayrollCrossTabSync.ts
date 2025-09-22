import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePayrollInvalidation } from './usePayrollInvalidation';

export const usePayrollCrossTabSync = () => {
  const queryClient = useQueryClient();
  const {
    invalidateHolidayRequestQueries,
    invalidateAttendanceQueries,
    invalidatePayrollQueries,
    invalidateEmployeePayrollQueries
  } = usePayrollInvalidation();

  useEffect(() => {
    // Create a broadcast channel for payroll cross-tab communication
    const channel = new BroadcastChannel('payroll-updates');

    const handleMessage = (event: MessageEvent) => {
      const { type, data } = event.data;

      console.log('Payroll cross-tab sync: Received message', type, data);

      switch (type) {
        case 'HOLIDAY_REQUEST_CREATED':
        case 'HOLIDAY_REQUEST_UPDATED':
        case 'HOLIDAY_REQUEST_DELETED':
        case 'HOLIDAY_REQUEST_APPROVED':
        case 'HOLIDAY_REQUEST_REJECTED':
          console.log('Cross-tab sync: Holiday request operation detected, invalidating queries');
          invalidateHolidayRequestQueries();
          break;
          
        case 'ATTENDANCE_CREATED':
        case 'ATTENDANCE_UPDATED':
        case 'ATTENDANCE_DELETED':
        case 'ATTENDANCE_BULK_UPDATE':
          console.log('Cross-tab sync: Attendance operation detected, invalidating queries');
          invalidateAttendanceQueries();
          break;
          
        case 'PAYROLL_CALCULATED':
        case 'PAYROLL_UPDATED':
        case 'PAYROLL_GENERATED':
          console.log('Cross-tab sync: Payroll operation detected, invalidating queries');
          invalidatePayrollQueries();
          break;
          
        case 'EMPLOYEE_PAYROLL_UPDATED':
        case 'EMPLOYEE_SALARY_UPDATED':
        case 'EMPLOYEE_ATTENDANCE_UPDATED':
          console.log('Cross-tab sync: Employee payroll data updated, invalidating queries');
          invalidateEmployeePayrollQueries();
          break;
          
        default:
          break;
      }
    };

    channel.addEventListener('message', handleMessage);

    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, [
    invalidateHolidayRequestQueries,
    invalidateAttendanceQueries,
    invalidatePayrollQueries,
    invalidateEmployeePayrollQueries
  ]);

  // Broadcast functions for different payroll operations
  const broadcastHolidayRequestOperation = (operation: 'CREATED' | 'UPDATED' | 'DELETED' | 'APPROVED' | 'REJECTED', data?: any) => {
    const channel = new BroadcastChannel('payroll-updates');
    channel.postMessage({
      type: `HOLIDAY_REQUEST_${operation}`,
      data,
      timestamp: Date.now()
    });
    channel.close();
  };

  const broadcastAttendanceOperation = (operation: 'CREATED' | 'UPDATED' | 'DELETED' | 'BULK_UPDATE', data?: any) => {
    const channel = new BroadcastChannel('payroll-updates');
    channel.postMessage({
      type: `ATTENDANCE_${operation}`,
      data,
      timestamp: Date.now()
    });
    channel.close();
  };

  const broadcastPayrollOperation = (operation: 'CALCULATED' | 'UPDATED' | 'GENERATED', data?: any) => {
    const channel = new BroadcastChannel('payroll-updates');
    channel.postMessage({
      type: `PAYROLL_${operation}`,
      data,
      timestamp: Date.now()
    });
    channel.close();
  };

  const broadcastEmployeePayrollUpdate = (operation: 'PAYROLL_UPDATED' | 'SALARY_UPDATED' | 'ATTENDANCE_UPDATED', data?: any) => {
    const channel = new BroadcastChannel('payroll-updates');
    channel.postMessage({
      type: `EMPLOYEE_${operation}`,
      data,
      timestamp: Date.now()
    });
    channel.close();
  };

  return {
    broadcastHolidayRequestOperation,
    broadcastAttendanceOperation,
    broadcastPayrollOperation,
    broadcastEmployeePayrollUpdate
  };
};