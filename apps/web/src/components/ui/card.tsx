import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-gray-200 bg-white shadow-sm', className)} {...props} />;
}
