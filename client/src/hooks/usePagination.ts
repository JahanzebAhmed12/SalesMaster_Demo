import { useMemo } from "react";
import {
  usePaginationState,
  type UsePaginationStateProps,
} from "@/hooks/usePaginationState";

export interface UsePaginationProps<T>
  extends Omit<UsePaginationStateProps, "totalItems"> {
  data: T[];
}

export interface UsePaginationReturn<T> {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  paginatedData: T[];
  goToPage: (page: number) => void;
  goToNextPage: () => void;
  goToPreviousPage: () => void;
  goToFirstPage: () => void;
  goToLastPage: () => void;
  setItemsPerPage: (itemsPerPage: number) => void;
  canGoNext: boolean;
  canGoPrevious: boolean;
}

export const usePagination = <T>({
  data,
  initialItemsPerPage = 25,
  initialPage = 1,
}: UsePaginationProps<T>): UsePaginationReturn<T> => {
  const pagination = usePaginationState({
    totalItems: data.length,
    initialItemsPerPage,
    initialPage,
  });

  const paginatedData = useMemo(
    () => data.slice(pagination.startIndex, pagination.endIndex),
    [data, pagination.startIndex, pagination.endIndex],
  );

  return {
    currentPage: pagination.currentPage,
    totalPages: pagination.totalPages,
    totalItems: pagination.totalItems,
    itemsPerPage: pagination.itemsPerPage,
    paginatedData,
    goToPage: pagination.goToPage,
    goToNextPage: pagination.goToNextPage,
    goToPreviousPage: pagination.goToPreviousPage,
    goToFirstPage: pagination.goToFirstPage,
    goToLastPage: pagination.goToLastPage,
    setItemsPerPage: pagination.setItemsPerPage,
    canGoNext: pagination.canGoNext,
    canGoPrevious: pagination.canGoPrevious,
  };
};

export default usePagination;
