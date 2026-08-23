import { useCallback, useEffect, useMemo, useState } from "react";

export interface UsePaginationStateProps {
  totalItems: number;
  initialItemsPerPage?: number;
  initialPage?: number;
}

export interface UsePaginationStateReturn {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  startIndex: number;
  endIndex: number;
  goToPage: (page: number) => void;
  goToNextPage: () => void;
  goToPreviousPage: () => void;
  goToFirstPage: () => void;
  goToLastPage: () => void;
  setItemsPerPage: (itemsPerPage: number) => void;
  canGoNext: boolean;
  canGoPrevious: boolean;
}

/**
 * Shared pagination state for both in-memory and server-backed tables.
 * The caller decides whether to slice data locally or use the indexes to
 * request/display a server page.
 */
export function usePaginationState({
  totalItems,
  initialItemsPerPage = 25,
  initialPage = 1,
}: UsePaginationStateProps): UsePaginationStateReturn {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [itemsPerPage, setItemsPerPageState] = useState(initialItemsPerPage);

  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const validCurrentPage = useMemo(() => {
    if (totalPages === 0) return 1;
    return Math.min(Math.max(currentPage, 1), totalPages);
  }, [currentPage, totalPages]);

  // Correct an out-of-range page after data or page-size changes without
  // updating state during render.
  useEffect(() => {
    if (validCurrentPage !== currentPage) {
      setCurrentPage(validCurrentPage);
    }
  }, [currentPage, validCurrentPage]);

  const startIndex = (validCurrentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);

  const goToPage = useCallback((page: number) => {
    const validPage = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(validPage);
  }, [totalPages]);

  const goToNextPage = useCallback(() => {
    if (validCurrentPage < totalPages) {
      setCurrentPage(validCurrentPage + 1);
    }
  }, [validCurrentPage, totalPages]);

  const goToPreviousPage = useCallback(() => {
    if (validCurrentPage > 1) {
      setCurrentPage(validCurrentPage - 1);
    }
  }, [validCurrentPage]);

  const goToFirstPage = useCallback(() => {
    setCurrentPage(1);
  }, []);

  const goToLastPage = useCallback(() => {
    setCurrentPage(Math.max(1, totalPages));
  }, [totalPages]);

  const setItemsPerPage = useCallback((newItemsPerPage: number) => {
    setItemsPerPageState(newItemsPerPage);
    setCurrentPage(1);
  }, []);

  return {
    currentPage: validCurrentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    startIndex,
    endIndex,
    goToPage,
    goToNextPage,
    goToPreviousPage,
    goToFirstPage,
    goToLastPage,
    setItemsPerPage,
    canGoNext: validCurrentPage < totalPages,
    canGoPrevious: validCurrentPage > 1,
  };
}

export default usePaginationState;
