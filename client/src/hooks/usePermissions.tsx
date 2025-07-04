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