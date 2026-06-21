import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { queryClient } from "./queryClient"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isPastDate(date: Date | string): boolean {
  // Use business date from the query cache as the reference point.
  // Falls back to calendar date if business date hasn't loaded yet.
  const cached = queryClient.getQueryData<{ currentDate: string }>(['/api/business-date']);
  const reference = cached?.currentDate ? new Date(cached.currentDate) : new Date();
  reference.setHours(0, 0, 0, 0);

  const checkDate = typeof date === 'string' ? new Date(date) : new Date(date);
  checkDate.setHours(0, 0, 0, 0);

  return checkDate < reference;
}

/**
 * Format a number to remove unnecessary trailing zeros
 * @param value - The number to format
 * @param maxDecimals - Maximum number of decimal places (default: 3)
 * @returns Formatted number string
 */
export function formatNumber(value: number | string | null | undefined, maxDecimals: number = 3): string {
  if (value === null || value === undefined || value === '') return '0';
  
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';
  
  // If it's a whole number, return without decimals
  if (num % 1 === 0) {
    return num.toString();
  }
  
  // Otherwise, format with up to maxDecimals places and remove trailing zeros
  return parseFloat(num.toFixed(maxDecimals)).toString();
}

/**
 * Format a quantity value specifically (removes trailing zeros)
 * @param quantity - The quantity to format
 * @returns Formatted quantity string
 */
export function formatQuantity(quantity: number | string | null | undefined): string {
  return formatNumber(quantity, 3);
}

/**
 * Format a price value (always shows 2 decimal places)
 * @param price - The price to format
 * @returns Formatted price string
 */
export function formatPrice(price: number | string | null | undefined): string {
  if (price === null || price === undefined || price === '') return '0.00';
  
  const num = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(num)) return '0.00';
  
  return num.toFixed(2);
}
