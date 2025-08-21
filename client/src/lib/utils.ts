import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isPastDate(date: Date | string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Set to start of day
  
  const checkDate = typeof date === 'string' ? new Date(date) : date;
  checkDate.setHours(0, 0, 0, 0); // Set to start of day
  
  return checkDate < today;
}
