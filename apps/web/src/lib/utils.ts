import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** รวม className โดยให้ตัวหลังชนะตัวหน้าเมื่อชนกัน */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))
