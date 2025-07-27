import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Employee } from "@shared/schema";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useEffect } from "react";

const EmployeeContractPrint = () => {
  const { id } = useParams<{ id: string }>();
  const employeeId = parseInt(id!);

  const { data: employee, isLoading, error } = useQuery({
    queryKey: ["employee", employeeId],
    queryFn: () => apiRequest("GET", `/api/employees/${employeeId}`),
  });

  useEffect(() => {
    // Auto-print when component loads and data is available
    if (employee && !isLoading) {
      setTimeout(() => {
        window.print();
      }, 500);
    }
  }, [employee, isLoading]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Loading employee contract...</p>
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-red-500">Error loading employee contract</p>
      </div>
    );
  }

  return (
    <div className="contract-container">
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 20mm;
          }
          body { 
            margin: 0; 
            font-family: Arial, sans-serif;
            font-size: 11px;
            line-height: 1.4;
          }
          .contract-container { 
            width: 100%; 
            max-width: none; 
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
          }
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
        }
        
        .contract-container {
          font-family: Arial, sans-serif;
          font-size: 11px;
          line-height: 1.4;
          padding: 20px;
          max-width: 210mm;
          margin: 0 auto;
        }
        
        .cover-page {
          text-align: center;
          padding: 60px 0;
        }
        
        .company-name {
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 40px;
          letter-spacing: 2px;
        }
        
        .contract-title {
          font-size: 16px;
          font-weight: bold;
          margin-bottom: 60px;
        }
        
        .employee-name {
          font-size: 14px;
          font-weight: bold;
          margin-bottom: 80px;
        }
        
        .contract-date {
          position: absolute;
          bottom: 100px;
          right: 50px;
          font-size: 12px;
        }
        
        .footer-text {
          position: absolute;
          bottom: 50px;
          left: 50px;
          font-size: 10px;
        }
        
        .terms-header {
          font-size: 14px;
          font-weight: bold;
          text-align: center;
          margin-bottom: 30px;
        }
        
        .section-title {
          font-weight: bold;
          margin: 20px 0 10px 0;
        }
        
        .clause {
          margin-bottom: 15px;
          text-align: justify;
        }
        
        .clause-number {
          font-weight: bold;
          margin-right: 10px;
        }
        
        .sub-clause {
          margin-left: 20px;
          margin-bottom: 10px;
        }
        
        .company-info {
          margin-bottom: 20px;
        }
        
        .employee-info {
          margin-bottom: 20px;
        }
      `}</style>

      {/* Cover Page */}
      <div className="cover-page">
        <div className="company-name">TROPIFRUIT UK LIMITED</div>
        
        <div className="contract-title">Terms and Conditions of Employment</div>
        
        <div className="employee-name">{employee.fullName?.toUpperCase()}</div>
        
        <div className="contract-date">
          {employee.startDate ? format(new Date(employee.startDate), 'd, MMMM yyyy') : '1, July 2024'}
        </div>
        
        <div className="footer-text">
          This document contains the main terms and conditions of employment which govern your<br/>
          service with the Company.
        </div>
        
        <div style={{ position: 'absolute', bottom: '20px', left: '20px', fontSize: '10px' }}>
          MARKET
        </div>
        
        <div style={{ position: 'absolute', bottom: '20px', right: '20px', fontSize: '10px' }}>
          1
        </div>
      </div>

      {/* Page 2 - Terms and Conditions */}
      <div className="page-break">
        <div className="terms-header">TERMS AND CONDITIONS OF EMPLOYMENT</div>
        
        <div className="section-title">BETWEEN</div>
        
        <div className="company-info">
          <div className="clause">
            <span className="clause-number">(1)</span>
            Tropifruit UK Limited a company registered in England and Wales whose registered 
            office is at Unit 3, Dolphin Way, Dolphin Park, West Thurrock, Essex RM19 1NZ 
            (hereinafter referred to as "we", "us" or "the Company"); and
          </div>
          
          <div className="clause">
            <span className="clause-number">(2)</span>
            Mr. {employee.fullName?.toUpperCase()}, {employee.homeAddress || '12 Mead Road, Gravesend DA11 7PP'} 
            (hereinafter referred to as "you")
          </div>
        </div>
        
        <div className="section-title">IT IS AGREED as follows:</div>
        
        <div className="clause">
          <span className="clause-number">1.</span>
          <strong>General</strong>
          <div style={{ marginTop: '10px', textAlign: 'justify' }}>
            These Terms and Conditions are issued by the Company pursuant to its obligation to 
            provide its employees with a written statement of the main terms and conditions of 
            their employment as required by Section 1 of the Employment Rights Act 1996 and 
            compliant with the Employment Act 2002 and Working Time Regulations 1998.
          </div>
        </div>
        
        <div className="clause">
          <span className="clause-number">2.</span>
          <strong>Duties and Job Title</strong>
          
          <div className="sub-clause">
            <span className="clause-number">2.1</span>
            You are employed by the Company in the capacity of '{employee.position || 'Market Stand'}'. You will 
            be required to undertake such duties and responsibilities as may be 
            determined by the Company from time to time.
          </div>
          
          <div className="sub-clause">
            <span className="clause-number">2.2</span>
            The Company reserves the right to vary your duties and responsibilities at any 
            time and from time to time according to the needs of the Company's business.
          </div>
          
          <div className="sub-clause">
            <span className="clause-number">2.3</span>
            Market employees must hold a forklift licence where they will be required to 
            work on any Stand as directed and to utilise the forklift. Exceptions may be 
            permitted as directed. Exceptions may be made for Ground or Floor staff.
          </div>
        </div>
        
        <div className="clause">
          <span className="clause-number">3.</span>
          <strong>Fixed Term</strong>
          
          <div className="sub-clause">
            <span className="clause-number">3.1</span>
            This Contract is for a fixed term of 6 months from the Date of Commencement 
            specified below.
          </div>
          
          <div className="sub-clause">
            <span className="clause-number">3.2</span>
            During the fixed term either party may terminate the contract on giving not less 
            than 2 weeks' notice. Alternatively, your employment may be summarily 
            terminated if you are found guilty of gross misconduct.
          </div>
          
          <div className="sub-clause">
            <span className="clause-number">3.3</span>
            Unless renewed by the Company, this contract and your employment with the 
            Company will terminate upon expiry of the fixed term.
          </div>
        </div>
        
        <div className="clause">
          <span className="clause-number">4.</span>
          <strong>Date of Commencement / Date of Continuous Employment and Notice</strong>
          <div style={{ marginTop: '10px' }}>
            Your employment with the Company began on {employee.startDate ? format(new Date(employee.startDate), 'd MMMM yyyy') : '1 July 2024'}
          </div>
        </div>
        
        <div style={{ position: 'absolute', bottom: '20px', left: '20px', fontSize: '10px' }}>
          MARKET
        </div>
        
        <div style={{ position: 'absolute', bottom: '20px', right: '20px', fontSize: '10px' }}>
          2
        </div>
      </div>

      {/* Page 3 - Probationary Period, Place of Work, Hours, Remuneration */}
      <div className="page-break">
        <div style={{ textAlign: 'justify' }}>
          The first 3 months of your employment will be a probationary period during 
          which your performance will be assessed. The probationary period may be 
          extended at the Company's discretion. During the probationary period, the full 
          disciplinary and grievance procedure will not apply.
        </div>
        
        <div className="clause">
          <span className="clause-number">4.1</span>
          We reserve the right in our absolute discretion to pay you salary in lieu of 
          notice.
        </div>
        
        <div className="clause">
          <span className="clause-number">4.2</span>
          Nothing in this Contract prevents us from terminating your employment 
          summarily or otherwise in the event of any serious breach by you of the terms 
          of your employment or in the event of any act or acts of gross misconduct by 
          you.
        </div>
        
        <div className="clause">
          <span className="clause-number">4.3</span>
          The Company has the right to extend the probationary period by 3 months.
        </div>
        
        <div className="clause">
          <span className="clause-number">5.</span>
          <strong>Place of Work</strong>
          <div style={{ marginTop: '10px', textAlign: 'justify' }}>
            Your place of work is at Spitalfields Market, but you may from time to time be required 
            to travel on the business of the Company or to perform your responsibilities and 
            duties at such other place within the United Kingdom as the Company may 
            reasonably request.
          </div>
        </div>
        
        <div className="clause">
          <span className="clause-number">6.</span>
          <strong>Hours of Work</strong>
          <div style={{ marginTop: '10px', textAlign: 'justify' }}>
            Your normal hours of work are midnight to 9.00am 6 days per week, with a 1 hour 
            break per day as agreed with your line manager – this totals 48 working hours each 
            week.
          </div>
          
          <div className="sub-clause">
            <span className="clause-number">6.1</span>
            <strong>Lay Off</strong>
            <div style={{ marginTop: '5px', textAlign: 'justify' }}>
              The Employer reserves the right to lay you off without pay and/ or to reduce your 
              working hours or working days with a proportionate reduction in contractual pay in the event of any 
              disruption to its business or any diminution in its requirements for work of the kind you 
              are employed to do.
            </div>
          </div>
          
          <div className="sub-clause">
            <span className="clause-number">6.2</span>
            The Employer shall be entitled to require you to take your annual holiday 
            entitlement to coincide with any period when your place of work is closed.
          </div>
        </div>
        
        <div className="clause">
          <span className="clause-number">7.</span>
          <strong>Remuneration</strong>
          
          <div className="sub-clause">
            <span className="clause-number">7.1</span>
            Your salary is £{employee.salary || '_____'} (gross) per annum, to be paid weekly normally on 
            the last Friday of each week made by direct credit transfer to a bank or 
            building society account nominated by you. Payslips are issued weekly.
          </div>
          
          <div className="sub-clause">
            <span className="clause-number">7.2</span>
            The Company is authorised to deduct any sums due to it from your salary.
          </div>
        </div>
        
        <div style={{ position: 'absolute', bottom: '20px', left: '20px', fontSize: '10px' }}>
          MARKET
        </div>
        
        <div style={{ position: 'absolute', bottom: '20px', right: '20px', fontSize: '10px' }}>
          3
        </div>
      </div>

      {/* Page 4 - Holidays */}
      <div className="page-break">
        <div className="clause">
          <span className="clause-number">8.</span>
          <strong>Holidays</strong>
          
          <div className="sub-clause">
            <span className="clause-number">8.1</span>
            You are entitled to 28 days (this includes the statutory minimum holiday 
            entitlement of 20 days, to which 8 days public and bank holidays have been 
            added) holiday in each complete calendar year, including bank and public 
            holidays.
          </div>
          
          <div className="sub-clause">
            <span className="clause-number">8.2</span>
            The holiday year commences on 1 April and finishes on 31 March each year.
          </div>
          
          <div className="sub-clause">
            <span className="clause-number">8.3</span>
            If your employment commences or finishes part way through the holiday year, 
            your holiday entitlement will be prorated accordingly.
          </div>
          
          <div className="sub-clause">
            <span className="clause-number">8.4</span>
            If, on termination of employment: -
            
            <div className="sub-clause" style={{ marginLeft: '40px' }}>
              <span className="clause-number">8.4.1</span>
              you have exceeded your prorated holiday entitlement, the Company 
              will deduct a payment in lieu of days holiday taken in excess of your 
              prorated holiday entitlement, and you authorise the Company to make 
              a deduction from the payment of your final salary.
            </div>
            
            <div className="sub-clause" style={{ marginLeft: '40px' }}>
              <span className="clause-number">8.4.2</span>
              you have holiday entitlement still owing, the Company may, at its 
              discretion, require you to take your holiday during your notice period or 
              make a payment in lieu of untaken holiday entitlement.
            </div>
          </div>
          
          <div className="sub-clause">
            <span className="clause-number">8.5</span>
            Holidays must be taken at times convenient to the Company. You must obtain 
            approval of proposed holiday dates in advance from one of the Directors. You 
            will not be allowed to take more than two weeks holiday at any one time, at the 
            Company's discretion. You must not book holidays until your request for 
            approval has been formally agreed.
          </div>
          
          <div className="sub-clause">
            <span className="clause-number">8.6</span>
            All holidays must be taken in the year in which it is accrued.
          </div>
          
          <div className="sub-clause">
            <span className="clause-number">8.7</span>
            If you are injured while on holiday, the Company will allow you to 
            transfer to sick leave and take replacement holiday later. This is subject 
            to the following:
            
            <div className="sub-clause" style={{ marginLeft: '40px' }}>
              <span className="clause-number">8.7.1</span>
              You must contact one of the Directors in person and by telephone (if 
              possible) as soon as you know that your holiday will be affected by 
              sickness or injury.
            </div>
            
            <div className="sub-clause" style={{ marginLeft: '40px' }}>
              <span className="clause-number">8.7.2</span>
              The full period of your incapacity due to sickness or injury must be 
              certificated by a qualified medical practitioner, and
            </div>
            
            <div className="sub-clause" style={{ marginLeft: '40px' }}>
              <span className="clause-number">8.7.3</span>
              Within 5 days of your return to work, you must confirm in writing how 
              much of your holiday was affected by sickness or injury and the 
              amount of leave you wish to take at another time. This written 
              notification must be sent to one of the Directors.
            </div>
          </div>
        </div>
        
        <div className="clause">
          <span className="clause-number">9.</span>
          <strong>Sickness Absence</strong>
          
          <div className="sub-clause">
            <span className="clause-number">9.1</span>
            In the event of your absence for any reason you or someone on your behalf 
            should contact one of the management team at the earliest opportunity on the 
            first day of the absence to inform him/her of the reason for absence. You 
            must inform the Company as soon as possible of any change in the date of 
            your expected return to work.
          </div>
        </div>
        
        <div style={{ position: 'absolute', bottom: '20px', left: '20px', fontSize: '10px' }}>
          MARKET
        </div>
        
        <div style={{ position: 'absolute', bottom: '20px', right: '20px', fontSize: '10px' }}>
          4
        </div>
      </div>

      {/* Page 5 - Sickness Absence continued, Pension, Restrictions */}
      <div className="page-break">
        <div className="clause">
          <div className="sub-clause">
            <span className="clause-number">9.2</span>
            A self-certification form should be completed for absences of up to seven 
            days.
          </div>
          
          <div className="sub-clause">
            <span className="clause-number">9.3</span>
            For periods of sickness of more than seven consecutive days, including 
            weekends, you will be required to obtain a Statement of Fitness for Work (Fit 
            Note) / Medical Certificate and send this to one of the Directors. A new Fit 
            Note / Medical Certificate should be sent periodically as required by the 
            Company.
          </div>
          
          <div className="sub-clause">
            <span className="clause-number">9.4</span>
            If you are absent for four or more days by reason of sickness or incapacity, 
            you are entitled to Statutory Sick Pay (SSP), if you have the minimum earnings 
            above. For the purposes of the SSP scheme the 'qualifying days' are Monday 
            to Friday (Office), Sunday to Friday (Drivers), Monday to Saturday (Market), 
            Sunday to Friday (Warehouse).
          </div>
          
          <div className="sub-clause">
            <span className="clause-number">9.5</span>
            The Company has the right to monitor and record absence levels and reasons 
            for absence. Such information will be kept confidential.
          </div>
          
          <div className="sub-clause">
            <span className="clause-number">9.6</span>
            The Company may require you to undergo a medical examination by a 
            medical practitioner nominated by us at any stage of your employment, and 
            you agree to authorise such medical practitioner to prepare a medical report 
            detailing the results of the examination, which you agree may be disclosed to 
            the Company. The Company will bear the cost of such medical examination. 
            Such an examination will only be requested by the Company where it is 
            reasonable to do so.
          </div>
        </div>
        
        <div className="clause">
          <span className="clause-number">10.</span>
          <strong>Pension</strong>
          <div style={{ marginTop: '10px', textAlign: 'justify' }}>
            The facility is available for you to participate in a Workplace Pension Scheme. If you 
            would like more information, please contact a member of management.
          </div>
        </div>
        
        <div className="clause">
          <span className="clause-number">11.</span>
          <strong>Restrictions and Confidentiality</strong>
          
          <div className="sub-clause">
            <span className="clause-number">11.1</span>
            You may not, without the prior written consent of the Company, devote any 
            time to any business other than the business of the Company or to any public 
            or charitable duty or endeavour during your normal hours of work.
          </div>
          
          <div className="sub-clause">
            <span className="clause-number">11.2</span>
            You will not at any time either during your employment or afterwards use or 
            divulge to any person, firm or company, except in the proper course of your 
            duties during your employment by the Company, any confidential information 
            identifying or relating to the Company, details of which are not in the public 
            domain.
          </div>
        </div>
        
        <div style={{ position: 'absolute', bottom: '20px', left: '20px', fontSize: '10px' }}>
          MARKET
        </div>
        
        <div style={{ position: 'absolute', bottom: '20px', right: '20px', fontSize: '10px' }}>
          5
        </div>
      </div>

      {/* Page 6 - Collective Agreements, Grievance, Disciplinary */}
      <div className="page-break">
        <div className="clause">
          <span className="clause-number">12.</span>
          <strong>Collective Agreements</strong>
          <div style={{ marginTop: '10px', textAlign: 'justify' }}>
            There are no collective agreements relevant to your employment.
          </div>
        </div>
        
        <div className="clause">
          <span className="clause-number">13.</span>
          <strong>Grievance Procedure</strong>
          <div style={{ marginTop: '10px', textAlign: 'justify' }}>
            The formal grievance procedure policy is available in the Employee Handbook. This 
            policy does not form part of your terms and conditions of employment.
          </div>
        </div>
        
        <div className="clause">
          <span className="clause-number">14.</span>
          <strong>Disciplinary Procedure</strong>
          <div style={{ marginTop: '10px', textAlign: 'justify' }}>
            The disciplinary rules applicable to your employment are set out in the Employee 
            Handbook. This policy does not form part of your terms and conditions of 
            employment.
          </div>
        </div>
        
        <div style={{ position: 'absolute', bottom: '20px', left: '20px', fontSize: '10px' }}>
          MARKET
        </div>
        
        <div style={{ position: 'absolute', bottom: '20px', right: '20px', fontSize: '10px' }}>
          6
        </div>
      </div>

      {/* Page 7 - Data Protection, Changes, Severability, Governing Law, Signatures */}
      <div className="page-break">
        <div className="clause">
          <span className="clause-number">15.</span>
          <strong>Data Protection including General Data Protection Regulations</strong>
          <div style={{ marginTop: '10px', textAlign: 'justify' }}>
            The Company has an Employee Data Protection Policy in place that sets out 
            the obligations of the Company regarding data protection and the rights of 
            its employees in respect of their personal data under EU Regulation 2016/679 
            General Data Protection Regulation ("GDPR"). This Policy is attached to the 
            Contract and requires a signature.
          </div>
        </div>
        
        <div className="clause">
          <span className="clause-number">16.</span>
          <strong>Changes to Terms and Conditions of Employment</strong>
          <div style={{ marginTop: '10px', textAlign: 'justify' }}>
            The Company may amend, vary or terminate the terms and conditions in this 
            document and any such change will be notified to you personally in writing or, when 
            generally applied, by notice.
          </div>
        </div>
        
        <div className="clause">
          <span className="clause-number">17.</span>
          <strong>Severability</strong>
          <div style={{ marginTop: '10px', textAlign: 'justify' }}>
            The various provisions of this Agreement are severable, and if any provision or 
            identifiable part thereof is held to be invalid or unenforceable by any court of 
            competent jurisdiction then such invalidity or unenforceability shall not affect the 
            validity or enforceability of the remaining provisions or identifiable parts.
          </div>
        </div>
        
        <div className="clause">
          <span className="clause-number">18.</span>
          <strong>Governing Law and Jurisdiction</strong>
          <div style={{ marginTop: '10px', textAlign: 'justify' }}>
            These Terms and Conditions shall be governed by and construed in accordance with 
            the laws of England and Wales.
          </div>
        </div>
        
        <div style={{ marginTop: '40px', textAlign: 'justify' }}>
          <strong>Issued for and on behalf of Tropifruit UK Limited</strong>
        </div>
        
        <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ width: '45%' }}>
            <div>Signed: ................................................</div>
            <div style={{ marginTop: '40px', textAlign: 'justify' }}>
              I confirm my agreement that the above terms and conditions constitute my contract of 
              employment.
            </div>
            <div style={{ marginTop: '30px' }}>
              Signed: ................................................
            </div>
            <div style={{ marginTop: '5px', fontSize: '10px' }}>
              EMPLOYEE NAME
            </div>
          </div>
          <div style={{ width: '45%' }}>
            <div>Date: ................................................</div>
            <div style={{ marginTop: '108px' }}>
              Date: ................................................
            </div>
          </div>
        </div>
        
        <div style={{ position: 'absolute', bottom: '20px', left: '20px', fontSize: '10px' }}>
          MARKET
        </div>
        
        <div style={{ position: 'absolute', bottom: '20px', right: '20px', fontSize: '10px' }}>
          7
        </div>
      </div>
    </div>
  );
};

export default EmployeeContractPrint;