import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Pagination from "@/components/ui/pagination";
import { usePagination } from "@/hooks/usePagination";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  render?: (item: T, index: number, absoluteIndex: number) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  onHeaderClick?: () => void;
  ariaSort?: "ascending" | "descending" | "none";
}

export interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  rowKey?: (item: T, index: number) => React.Key;
  rowClassName?: (item: T, index: number) => string | undefined;
  initialItemsPerPage?: number;
  itemsPerPageOptions?: number[];
  resetKey?: string | number | boolean | null;
  showPagination?: boolean;
  emptyMessage?: React.ReactNode;
  loading?: boolean;
  loadingMessage?: React.ReactNode;
  className?: string;
  tableClassName?: string;
  bodyClassName?: string;
}

export function DataTable<T>({
  data,
  columns,
  rowKey = (item, index) => {
    if (typeof item === "object" && item !== null && "id" in item) {
      return String((item as { id?: string | number }).id ?? index);
    }
    return index;
  },
  rowClassName,
  initialItemsPerPage = 10,
  itemsPerPageOptions = [10, 20, 50],
  resetKey,
  showPagination = true,
  emptyMessage = "No data found.",
  loading = false,
  loadingMessage = "Loading...",
  className,
  tableClassName,
  bodyClassName,
}: DataTableProps<T>) {
  const {
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    paginatedData,
    goToPage,
    goToFirstPage,
    setItemsPerPage,
  } = usePagination({
    data,
    initialItemsPerPage,
  });

  React.useEffect(() => {
    if (resetKey !== undefined) {
      goToFirstPage();
    }
  }, [goToFirstPage, resetKey]);

  const renderCell = (item: T, column: DataTableColumn<T>, index: number) => {
    if (column.render) return column.render(item, index, (currentPage - 1) * itemsPerPage + index);
    if (typeof item === "object" && item !== null) {
      const value = (item as Record<string, unknown>)[column.key];
      return value === null || value === undefined || value === "" ? "-" : String(value);
    }
    return "-";
  };

  const showEmptyRow = !loading && paginatedData.length === 0;

  return (
    <div className={cn("w-full", className)}>
      <div className={cn("overflow-x-auto", tableClassName)}>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  className={cn(
                    column.onHeaderClick && "cursor-pointer select-none",
                    column.headerClassName,
                    column.className,
                  )}
                  onClick={column.onHeaderClick}
                  aria-sort={column.ariaSort}
                >
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className={bodyClassName}>
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-8 text-center text-gray-500">
                  {loadingMessage}
                </TableCell>
              </TableRow>
            ) : showEmptyRow ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-8 text-center text-gray-500">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((item, index) => (
                <TableRow key={rowKey(item, index)} className={rowClassName?.(item, index)}>
                  {columns.map((column) => (
                    <TableCell key={column.key} className={column.className}>
                      {renderCell(item, column, index)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
    </div>
  );
}

export default DataTable;
