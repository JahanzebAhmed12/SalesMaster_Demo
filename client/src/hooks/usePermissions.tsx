import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { UserRestriction } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export function usePermissions() {
  const { user } = useAuth();

  const { data: restrictions = [] } = useQuery<UserRestriction[]>({
    queryKey: ["/api/user-restrictions", user?.id],
    queryFn: () =>
      user?.id
        ? apiRequest<UserRestriction[]>("GET", `/api/user-restrictions/${user.id}`)
        : Promise.resolve([]),
    enabled: !!user?.id,
  });

  // Convert array to map: { [section]: allowed }
  const restrictionMap = restrictions.reduce<Record<string, boolean>>(
    (acc, r) => {
      acc[r.section] = r.allowed;
      return acc;
    },
    {}
  );

  return restrictionMap;
}

export function useBackdatePermissions() {
  const { user } = useAuth();

  const { data: backdateOptions } = useQuery({
    queryKey: ["/api/user-backdate-options", user?.id],
    queryFn: () =>
      user?.id
        ? apiRequest("GET", `/api/user-backdate-options/${user.id}`)
        : Promise.resolve({ editing: false, deleting: false }),
    enabled: !!user?.id,
  });

  return {
    canEditBackdate: backdateOptions?.editing ?? false,
    canDeleteBackdate: backdateOptions?.deleting ?? false,
  };
} 