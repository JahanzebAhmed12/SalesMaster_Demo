import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface CompanyDetails {
  id: number;
  companyName: string;
  address1: string;
  address2?: string;
  telephone?: string;
  mobile?: string;
  fax?: string;
  website?: string;
  email?: string;
  vatNo?: string;
  compRegNo?: string;
  bankDetails?: string;
  einlNumber?: string;
  remarks?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function useCompanyDetails() {
  const { data: companyDetails, isLoading: isLoadingCompany } = useQuery<CompanyDetails>({
    queryKey: ["/api/company-details"],
    queryFn: () => apiRequest("GET", "/api/company-details"),
    staleTime: 5 * 60 * 1000,
  });

  return { companyDetails, isLoadingCompany };
}
