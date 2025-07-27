import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useEffect } from "react";

const HolidayRequestPrint = () => {
  const { id } = useParams<{ id: string }>();
  const requestId = parseInt(id!);

  const { data: request, isLoading, error } = useQuery({
    queryKey: ["holiday-request", requestId],
    queryFn: () => apiRequest("GET", `/api/holiday-requests/${requestId}`),
  });

  useEffect(() => {
    // Auto-print when component loads and data is available
    if (request && !isLoading) {
      setTimeout(() => {
        window.print();
      }, 500);
    }
  }, [request, isLoading]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Loading holiday request...</p>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-red-500">Error loading holiday request</p>
      </div>
    );
  }

  return (
    <div className="print-container">
      <style jsx>{`
        @media print {
          @page {
            size: A4;
            margin: 15mm;
          }
          body { 
            margin: 0; 
            font-size: 12px;
            line-height: 1.2;
          }
          .print-container { 
            width: 100%; 
            max-width: none; 
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
            font-size: 12px;
            height: 100vh;
            display: flex;
            flex-direction: column;
          }
          .no-print { display: none !important; }
        }
        
        .print-container {
          font-family: Arial, sans-serif;
          font-size: 12px;
          line-height: 1.2;
          padding: 10px;
        }
        
        .form-header {
          text-align: center;
          font-size: 16px;
          font-weight: bold;
          margin-bottom: 20px;
          text-decoration: underline;
        }
        
        .form-row {
          display: flex;
          margin-bottom: 12px;
          align-items: center;
        }
        
        .form-label {
          font-weight: bold;
          margin-right: 15px;
          min-width: 180px;
          font-size: 11px;
        }
        
        .form-value {
          border-bottom: 1px solid #000;
          min-height: 18px;
          flex: 1;
          padding: 1px 3px;
          font-size: 11px;
        }
        
        .signature-section {
          margin-top: 20px;
          margin-bottom: 20px;
        }
        
        .management-section {
          border: 2px solid #000;
          padding: 12px;
          margin-top: 15px;
          font-size: 11px;
        }
        
        .status-options {
          display: flex;
          gap: 20px;
          margin: 15px 0;
          justify-content: center;
        }
        
        .status-option {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .checkbox {
          width: 18px;
          height: 18px;
          border: 2px solid #000;
          display: inline-block;
          text-align: center;
          line-height: 14px;
          font-size: 12px;
        }
        
        .footer-text {
          margin-top: 15px;
          font-size: 10px;
          line-height: 1.3;
        }
        
        .compact-row {
          margin-bottom: 8px;
        }
        
        .management-text {
          font-size: 10px;
          line-height: 1.3;
          margin-bottom: 10px;
        }
      `}</style>

      <div className="form-header">
        TROPIFRUIT U.K. HOLIDAY REQUEST FORM
      </div>

      <div className="form-row">
        <div className="form-label">NAME OF EMPLOYEE</div>
        <div className="form-value">{request.employeeName}</div>
      </div>

      <div className="form-row">
        <div className="form-label">JOB TITLE</div>
        <div className="form-value">{request.jobTitle || ''}</div>
      </div>

      <div className="form-row">
        <div className="form-label">TOTAL NUMBER OF DAYS</div>
        <div className="form-value">{request.totalDaysRequested} DAYS</div>
      </div>

      <div className="form-row">
        <div className="form-label">LAST DATE AT WORK</div>
        <div className="form-value">
          {request.lastDateAtWork ? format(new Date(request.lastDateAtWork), 'dd - MM - yyyy') : ''}
        </div>
      </div>

      <div className="form-row">
        <div className="form-label">RETURN DATE TO WORK</div>
        <div className="form-value">
          {request.returnDateToWork ? format(new Date(request.returnDateToWork), 'dd - MM - yyyy') : ''}
        </div>
      </div>

      <div className="signature-section">
        <div className="form-row">
          <div className="form-label">SIGNED BY EMPLOYEE</div>
          <div className="form-value">{request.signedByEmployee || ''}</div>
        </div>

        <div className="form-row">
          <div className="form-label">DATE BY EMPLOYEE</div>
          <div className="form-value">
            {request.dateByEmployee ? format(new Date(request.dateByEmployee), 'dd - MM - yyyy') : ''}
          </div>
        </div>
      </div>

      <div className="management-section">
        <div className="management-text">
          <strong>
            HOLIDAY GRANTED BY MANAGEMENT & YOU NOW HAVE{' '}
            <span style={{ textDecoration: 'underline', minWidth: '40px', display: 'inline-block' }}>
              {request.daysGranted || '___'}
            </span>{' '}
            DAYS HOLIDAY LEFT TO TAKE FROM THIS YEARS ENTITLEMENT.{' '}
            <span style={{ textDecoration: 'underline', minWidth: '25px', display: 'inline-block' }}>
              {request.daysLeftEntitlement || '___'}
            </span>
          </strong>
        </div>

        <div className="management-text">
          <strong>OR</strong>
        </div>

        <div className="management-text">
          <strong>
            THIS REQUEST HAS NOT BEEN GRANTED PLEASE CONTACT A TEAM LEADER IF YOU HAVE ANY FURTHER QUERIES.
          </strong>
        </div>

        <div className="status-options">
          <div className="status-option">
            <div className="checkbox">
              {request.status === 'granted' ? '✓' : ''}
            </div>
            <span><strong>GRANTED</strong></span>
          </div>
          <div style={{ margin: '0 15px' }}>/</div>
          <div className="status-option">
            <div className="checkbox">
              {request.status === 'not_granted' ? '✓' : ''}
            </div>
            <span><strong>NOT GRANTED</strong></span>
          </div>
        </div>

        <div className="form-row compact-row" style={{ marginTop: '15px' }}>
          <div className="form-label">PRINT NAME MANAGER</div>
          <div className="form-value">{request.managerName || ''}</div>
        </div>

        <div className="form-row compact-row">
          <div className="form-label">SIGNED BY MANAGER</div>
          <div className="form-value"></div>
        </div>

        <div className="form-row compact-row">
          <div className="form-label">DATED BY MANAGER</div>
          <div className="form-value">
            {request.datedByManager ? format(new Date(request.datedByManager), 'dd|MM|yyyy') : ''}
          </div>
        </div>
      </div>

      <div className="footer-text">
        <p>
          <strong>
            YOU WILL RECEIVE A PHOTOCOPY OF YOUR APPLICATION WITH A DECISION & IT WILL BE SIGNED BY THE MANAGER.
          </strong>
        </p>
        <p>
          <strong>
            KEEP THAT COPY FOR REFERENCE AS IT WILL GIVE YOU THE NUMBER OF DAYS YOU HAVE LEFT FROM THIS YEAR'S ENTITLEMENT.
          </strong>
        </p>
      </div>

      {request.managerComments && (
        <div style={{ marginTop: '20px', border: '1px solid #000', padding: '10px' }}>
          <strong>Manager Comments:</strong>
          <div style={{ marginTop: '5px' }}>{request.managerComments}</div>
        </div>
      )}
    </div>
  );
};

export default HolidayRequestPrint;