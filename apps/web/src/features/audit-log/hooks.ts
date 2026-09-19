'use client'

import { useQuery } from '@tanstack/react-query'

import { auditLogApi } from './api'

const AUDIT_LOG_ROOT = ['audit-log'] as const

export const AUDIT_LOG_PAGE_SIZE = 50

export function useAuditLogs(input: {
  module: string | null
  userId: number | null
  date: string | null
  page: number
}) {
  return useQuery({
    queryKey: [...AUDIT_LOG_ROOT, 'list', input.module, input.userId, input.date, input.page],
    queryFn: () => auditLogApi.list({ ...input, pageSize: AUDIT_LOG_PAGE_SIZE }),
    placeholderData: (previous) => previous,
  })
}

export function useAuditLogModules() {
  return useQuery({
    queryKey: [...AUDIT_LOG_ROOT, 'modules'],
    queryFn: () => auditLogApi.modules(),
  })
}

export function useAuditLogActors() {
  return useQuery({
    queryKey: [...AUDIT_LOG_ROOT, 'actors'],
    queryFn: () => auditLogApi.actors(),
  })
}
