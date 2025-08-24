import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TestPermissions() {
  const { user } = useAuth();
  const permissions = usePermissions();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Permission Test Page</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>User Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p><strong>ID:</strong> {user?.id}</p>
              <p><strong>Username:</strong> {user?.username}</p>
              <p><strong>User Type:</strong> {user?.userType}</p>
              <p><strong>Status:</strong> {user?.status}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Permissions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {Object.keys(permissions).length === 0 ? (
                <p className="text-gray-500">No restrictions found (full access)</p>
              ) : (
                Object.entries(permissions).map(([section, allowed]) => (
                  <div key={section} className="flex justify-between items-center">
                    <span className="text-sm">{section}:</span>
                    <span className={`text-sm font-semibold ${allowed ? 'text-green-600' : 'text-red-600'}`}>
                      {allowed ? 'Allowed' : 'Denied'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}