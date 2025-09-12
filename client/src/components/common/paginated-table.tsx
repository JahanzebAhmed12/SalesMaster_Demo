import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Pagination from "@/components/ui/pagination";
import { usePagination } from "@/hooks/usePagination";

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T, index: number) => React.ReactNode;
  className?: string;
  sortable?: boolean;
}

export interface PaginatedTableProps<T> {
  data: T[];
  columns: Column<T>[];
  title?: string;
  headerActions?: React.ReactNode;
  initialItemsPerPage?: number;
  itemsPerPageOptions?: number[];
  showPagination?: boolean;
  emptyMessage?: string;
  loading?: boolean;
  className?: string;
}

export function PaginatedTable<T extends Record<string, any>>({
  data,
  columns,
  title,
  headerActions,
  initialItemsPerPage = 25,
  itemsPerPageOptions = [10, 25, 50, 100],
  showPagination = true,
  emptyMessage = "No data found",
  loading = false,
  className = ""
}: PaginatedTableProps<T>) {
  const {
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    paginatedData,
    goToPage,
    setItemsPerPage
  } = usePagination({
    data,
    initialItemsPerPage
  });

  const renderCell = (item: T, column: Column<T>, index: number) => {
    if (column.render) {
      return column.render(item, index);
    }
    return item[column.key] || '-';
  };

  return (
    <Card className={className}>
      {(title || headerActions) && (
        <CardHeader>
          <div className="flex justify-between items-center">
            {title && <CardTitle>{title}</CardTitle>}
            {headerActions}
          </div>
        </CardHeader>
      )}
      <CardContent>
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p>Loading...</p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead key={column.key} className={column.className}>
                      {column.header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedData.length > 0 ? (
                  paginatedData.map((item, index) => (
                    <TableRow key={item.id || index}>
                      {columns.map((column) => (
                        <TableCell key={column.key} className={column.className}>
                          {renderCell(item, column, index)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="text-center py-8 text-gray-500">
                      {emptyMessage}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {showPagination && totalPages > 1 && (
              <div className="mt-4">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  itemsPerPage={itemsPerPage}
                  onPageChange={goToPage}
                  onItemsPerPageChange={setItemsPerPage}
                  itemsPerPageOptions={itemsPerPageOptions}
                />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default PaginatedTable;