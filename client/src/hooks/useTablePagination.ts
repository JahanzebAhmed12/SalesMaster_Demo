import {
  usePaginationState,
  type UsePaginationStateProps,
} from "@/hooks/usePaginationState";

export interface UseTablePaginationProps extends UsePaginationStateProps {}

export interface UseTablePaginationReturn {
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  startIndex: number;
  endIndex: number;
  goToPage: (page: number) => void;
  setItemsPerPage: (itemsPerPage: number) => void;
  canGoNext: boolean;
  canGoPrevious: boolean;
  paginationProps: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    onPageChange: (page: number) => void;
    onItemsPerPageChange: (itemsPerPage: number) => void;
  };
}

export const useTablePagination = ({
  totalItems,
  initialItemsPerPage = 25,
  initialPage = 1,
}: UseTablePaginationProps): UseTablePaginationReturn => {
  const pagination = usePaginationState({
    totalItems,
    initialItemsPerPage,
    initialPage,
  });

  return {
    currentPage: pagination.currentPage,
    totalPages: pagination.totalPages,
    itemsPerPage: pagination.itemsPerPage,
    startIndex: pagination.startIndex,
    endIndex: pagination.endIndex,
    goToPage: pagination.goToPage,
    setItemsPerPage: pagination.setItemsPerPage,
    canGoNext: pagination.canGoNext,
    canGoPrevious: pagination.canGoPrevious,
    paginationProps: {
      currentPage: pagination.currentPage,
      totalPages: pagination.totalPages,
      totalItems: pagination.totalItems,
      itemsPerPage: pagination.itemsPerPage,
      onPageChange: pagination.goToPage,
      onItemsPerPageChange: pagination.setItemsPerPage,
    },
  };
};

export default useTablePagination;
