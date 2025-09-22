import React, { useState, useEffect } from 'react';
import { useAdminState } from './AdminStateProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, RefreshCw, Trash2, Bug } from 'lucide-react';

interface AdminStateDebuggerProps {
  enabled?: boolean;
}

export const AdminStateDebugger: React.FC<AdminStateDebuggerProps> = ({ 
  enabled = process.env.NODE_ENV === 'development' 
}) => {
  const adminState = useAdminState();
  const [isOpen, setIsOpen] = useState(false);
  const [cacheStatus, setCacheStatus] = useState<any>(null);
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (enabled && isOpen) {
      const updateStatus = () => {
        setCacheStatus(adminState.getAdminCacheStatus());
      };
      
      updateStatus();
      const interval = setInterval(updateStatus, 2000);
      setRefreshInterval(interval);
      
      return () => {
        if (interval) clearInterval(interval);
      };
    }
  }, [enabled, isOpen, adminState]);

  useEffect(() => {
    return () => {
      if (refreshInterval) clearInterval(refreshInterval);
    };
  }, [refreshInterval]);

  if (!enabled) return null;

  const handleRefreshAll = () => {
    adminState.bulkOperations.refreshAdminData();
  };

  const handleClearCache = () => {
    adminState.clearAdminCache();
    setCacheStatus(adminState.getAdminCacheStatus());
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'bg-green-100 text-green-800';
      case 'error': return 'bg-red-100 text-red-800';
      case 'loading': return 'bg-blue-100 text-blue-800';
      case 'idle': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button 
            variant="outline" 
            size="sm"
            className="bg-white shadow-lg border-2 border-blue-200 hover:border-blue-300"
          >
            <Bug className="h-4 w-4 mr-2" />
            Admin State
            {isOpen ? <ChevronDown className="h-4 w-4 ml-2" /> : <ChevronRight className="h-4 w-4 ml-2" />}
          </Button>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <Card className="mt-2 w-96 max-h-96 overflow-auto shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                Admin State Debugger
                <div className="flex gap-1">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleRefreshAll}
                    className="h-6 px-2"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleClearCache}
                    className="h-6 px-2"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            
            <CardContent className="space-y-3 text-xs">
              {cacheStatus && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-gray-50 p-2 rounded">
                      <div className="font-medium">Total Queries</div>
                      <div className="text-lg font-bold">{cacheStatus.totalQueries}</div>
                    </div>
                    <div className="bg-yellow-50 p-2 rounded">
                      <div className="font-medium">Stale</div>
                      <div className="text-lg font-bold text-yellow-600">{cacheStatus.staleQueries}</div>
                    </div>
                    <div className="bg-blue-50 p-2 rounded">
                      <div className="font-medium">Fetching</div>
                      <div className="text-lg font-bold text-blue-600">{cacheStatus.fetchingQueries}</div>
                    </div>
                    <div className="bg-red-50 p-2 rounded">
                      <div className="font-medium">Errors</div>
                      <div className="text-lg font-bold text-red-600">{cacheStatus.errorQueries}</div>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="font-medium">Query Details:</div>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {cacheStatus.queries.map((query: any, index: number) => (
                        <div key={index} className="flex items-center justify-between p-1 bg-gray-50 rounded text-xs">
                          <div className="truncate flex-1">
                            {Array.isArray(query.key) ? query.key.join(' > ') : query.key}
                          </div>
                          <div className="flex items-center gap-1 ml-2">
                            <Badge className={`text-xs px-1 py-0 ${getStatusColor(query.status)}`}>
                              {query.status}
                            </Badge>
                            {query.isStale && (
                              <Badge className="text-xs px-1 py-0 bg-yellow-100 text-yellow-800">
                                stale
                              </Badge>
                            )}
                            {query.isFetching && (
                              <Badge className="text-xs px-1 py-0 bg-blue-100 text-blue-800">
                                fetching
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="pt-2 border-t">
                    <div className="font-medium mb-1">Quick Actions:</div>
                    <div className="grid grid-cols-2 gap-1">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => adminState.forceRefresh.customers()}
                        className="h-6 text-xs"
                      >
                        Refresh Customers
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => adminState.forceRefresh.employees()}
                        className="h-6 text-xs"
                      >
                        Refresh Employees
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => adminState.forceRefresh.suppliers()}
                        className="h-6 text-xs"
                      >
                        Refresh Suppliers
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => adminState.forceRefresh.products()}
                        className="h-6 text-xs"
                      >
                        Refresh Products
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};