import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePayrollState } from '@/components/payroll/PayrollStateProvider';
import { apiRequest } from '@/lib/queryClient';
import { handleAuthError } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';

/**
 * Custom hook that provides standardized payroll mutations with automatic
 * state management and cross-tab synchronization
 */
export const usePayrollMutations = () => {
  const queryClient = useQueryClient();
  const payrollState = usePayrollState();
  const { toast } = useToast();

  // Holiday request mutations
  const useHolidayRequestMutations = () => ({
    create: useMutation({
      mutationFn: (data: any) => apiRequest('POST', '/api/holiday-requests', data),
      onSuccess: (result, variables) => {
        payrollState.broadcast.holidayRequest.created({ id: result?.id, ...variables });
        toast({ title: 'Success', description: 'Holiday request created successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to create holiday request',
          variant: 'destructive' 
        });
      }
    }),
    
    update: useMutation({
      mutationFn: ({ id, ...data }: any) => apiRequest('PUT', `/api/holiday-requests/${id}`, data),
      onSuccess: (result, variables) => {
        payrollState.broadcast.holidayRequest.updated({ id: variables.id, ...variables });
        toast({ title: 'Success', description: 'Holiday request updated successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to update holiday request',
          variant: 'destructive' 
        });
      }
    }),
    
    delete: useMutation({
      mutationFn: (id: number) => apiRequest('DELETE', `/api/holiday-requests/${id}`),
      onSuccess: (_, deletedId) => {
        payrollState.broadcast.holidayRequest.deleted({ id: deletedId });
        toast({ title: 'Success', description: 'Holiday request deleted successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to delete holiday request',
          variant: 'destructive' 
        });
      }
    }),

    approve: useMutation({
      mutationFn: ({ id, ...data }: any) => apiRequest('PUT', `/api/holiday-requests/${id}/approve`, data),
      onSuccess: (result, variables) => {
        payrollState.broadcast.holidayRequest.approved({ id: variables.id, ...variables });
        toast({ title: 'Success', description: 'Holiday request approved successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to approve holiday request',
          variant: 'destructive' 
        });
      }
    }),

    reject: useMutation({
      mutationFn: ({ id, ...data }: any) => apiRequest('PUT', `/api/holiday-requests/${id}/reject`, data),
      onSuccess: (result, variables) => {
        payrollState.broadcast.holidayRequest.rejected({ id: variables.id, ...variables });
        toast({ title: 'Success', description: 'Holiday request rejected successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to reject holiday request',
          variant: 'destructive' 
        });
      }
    }),

    uploadSignedForm: useMutation({
      mutationFn: ({ id, file }: { id: number; file: File }) => {
        const formData = new FormData();
        formData.append('signedForm', file);
        
        // Use the same URL logic as apiRequest
        const useRelativeUrls = () => {
          return window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
        };

        const API_BASE_URL = 'http://localhost:5000';
        const url = useRelativeUrls() ? `/api/holiday-requests/${id}/upload-signed-form` : `${API_BASE_URL}/api/holiday-requests/${id}/upload-signed-form`;

        const token = localStorage.getItem('jwt_token');
        const headers: Record<string, string> = {};

        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        return fetch(url, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: formData,
        }).then(async res => {
          const responseData = await res.json();
          
          if (!res.ok) {
            if (res.status === 401) {
              handleAuthError();
              throw new Error('Session expired. Please login again.');
            }
            throw new Error(responseData.message || responseData.error || `HTTP error! status: ${res.status}`);
          }
          
          return responseData;
        });
      },
      onSuccess: (result, variables) => {
        payrollState.broadcast.holidayRequest.updated({ id: variables.id, signedFormUploaded: true });
        toast({ title: 'Success', description: 'Signed form uploaded successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to upload signed form',
          variant: 'destructive' 
        });
      }
    }),

    resetEntitlement: useMutation({
      mutationFn: (data: { startDate: string; endDate: string; entitlementDays: number }) => 
        apiRequest('POST', '/api/holiday-requests/reset-entitlement', data),
      onSuccess: () => {
        payrollState.broadcast.holidayRequest.updated({ entitlementReset: true });
        toast({ title: 'Success', description: 'Holiday entitlements reset successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to reset entitlements',
          variant: 'destructive' 
        });
      }
    }),

    deleteSignedForm: useMutation({
      mutationFn: (id: number) => apiRequest('DELETE', `/api/holiday-requests/${id}/signed-form`),
      onSuccess: (result, variables) => {
        payrollState.broadcast.holidayRequest.updated({ id: variables, signedFormDeleted: true });
        toast({ title: 'Success', description: 'Signed form deleted successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to delete signed form',
          variant: 'destructive' 
        });
      }
    })
  });

  // Attendance mutations
  const useAttendanceMutations = () => ({
    create: useMutation({
      mutationFn: (data: any) => apiRequest('POST', '/api/attendance', data),
      onSuccess: (result, variables) => {
        payrollState.broadcast.attendance.created({ id: result?.id, ...variables });
        toast({ title: 'Success', description: 'Attendance record created successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to create attendance record',
          variant: 'destructive' 
        });
      }
    }),
    
    update: useMutation({
      mutationFn: ({ id, ...data }: any) => apiRequest('PUT', `/api/attendance/${id}`, data),
      onSuccess: (result, variables) => {
        payrollState.broadcast.attendance.updated({ id: variables.id, ...variables });
        toast({ title: 'Success', description: 'Attendance record updated successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to update attendance record',
          variant: 'destructive' 
        });
      }
    }),
    
    delete: useMutation({
      mutationFn: (id: number) => apiRequest('DELETE', `/api/attendance/${id}`),
      onSuccess: (_, deletedId) => {
        payrollState.broadcast.attendance.deleted({ id: deletedId });
        toast({ title: 'Success', description: 'Attendance record deleted successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to delete attendance record',
          variant: 'destructive' 
        });
      }
    }),

    bulkUpdate: useMutation({
      mutationFn: (data: any) => apiRequest('POST', '/api/attendance/bulk-update', data),
      onSuccess: (result, variables) => {
        payrollState.broadcast.attendance.bulkUpdate(variables);
        toast({ title: 'Success', description: 'Attendance records updated successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to update attendance records',
          variant: 'destructive' 
        });
      }
    })
  });

  // Payroll mutations
  const usePayrollCalculationMutations = () => ({
    calculate: useMutation({
      mutationFn: (data: any) => apiRequest('POST', '/api/payroll/calculate', data),
      onSuccess: (result, variables) => {
        payrollState.broadcast.payroll.calculated(variables);
        toast({ title: 'Success', description: 'Payroll calculated successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to calculate payroll',
          variant: 'destructive' 
        });
      }
    }),
    
    update: useMutation({
      mutationFn: ({ id, ...data }: any) => apiRequest('PUT', `/api/payroll/${id}`, data),
      onSuccess: (result, variables) => {
        payrollState.broadcast.payroll.updated({ id: variables.id, ...variables });
        toast({ title: 'Success', description: 'Payroll updated successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to update payroll',
          variant: 'destructive' 
        });
      }
    }),

    generate: useMutation({
      mutationFn: (data: any) => apiRequest('POST', '/api/payroll/generate', data),
      onSuccess: (result, variables) => {
        payrollState.broadcast.payroll.generated(variables);
        toast({ title: 'Success', description: 'Payroll generated successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to generate payroll',
          variant: 'destructive' 
        });
      }
    })
  });

  // Employee payroll mutations
  const useEmployeePayrollMutations = () => ({
    updateSalary: useMutation({
      mutationFn: ({ id, ...data }: any) => apiRequest('PUT', `/api/employees/${id}/salary`, data),
      onSuccess: (result, variables) => {
        payrollState.broadcast.employee.salaryUpdated({ id: variables.id, ...variables });
        toast({ title: 'Success', description: 'Employee salary updated successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to update employee salary',
          variant: 'destructive' 
        });
      }
    }),

    updatePayrollData: useMutation({
      mutationFn: ({ id, ...data }: any) => apiRequest('PUT', `/api/employees/${id}/payroll`, data),
      onSuccess: (result, variables) => {
        payrollState.broadcast.employee.payrollUpdated({ id: variables.id, ...variables });
        toast({ title: 'Success', description: 'Employee payroll data updated successfully' });
      },
      onError: (error: any) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to update employee payroll data',
          variant: 'destructive' 
        });
      }
    })
  });

  return {
    holidayRequest: useHolidayRequestMutations(),
    attendance: useAttendanceMutations(),
    payroll: usePayrollCalculationMutations(),
    employee: useEmployeePayrollMutations(),
    
    // Utility functions
    payrollState,
    queryClient,
    toast
  };
};