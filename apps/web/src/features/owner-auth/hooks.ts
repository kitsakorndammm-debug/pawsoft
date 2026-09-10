'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/lib/api-client'
import { myApi, ownerAuthApi, type OwnerSession } from './api'

export const OWNER_ME_QUERY_KEY = ['owner-auth', 'me'] as const
export const GOOGLE_STATUS_QUERY_KEY = ['owner-auth', 'google-status'] as const

export function useOwnerMe() {
  return useQuery({
    queryKey: OWNER_ME_QUERY_KEY,
    queryFn: async (): Promise<OwnerSession | null> => {
      try {
        return await ownerAuthApi.me()
      } catch (e) {
        if (e instanceof ApiError && e.httpStatus === 401) return null
        throw e
      }
    },
    staleTime: 60_000,
    retry: false,
  })
}

/** ตั้งค่า Google ไว้หรือยัง — ปุ่มที่กดแล้วเจอหน้า error คือปุ่มที่ไม่ควรมีให้กด */
export function useGoogleStatus() {
  return useQuery({
    queryKey: GOOGLE_STATUS_QUERY_KEY,
    queryFn: () => ownerAuthApi.googleStatus(),
    staleTime: 5 * 60_000,
    retry: false,
  })
}

export function useOwnerLogout() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: () => ownerAuthApi.logout(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: OWNER_ME_QUERY_KEY }),
  })
}

export const MY_PROFILE_KEY = ['my', 'profile'] as const
export const MY_PETS_KEY = ['my', 'pets'] as const

/** ตัวตนของฉัน — `owner: null` แปลว่ายังไม่ถูกจับคู่ ซึ่งเป็นเรื่องปกติ */
export function useMyProfile() {
  return useQuery({ queryKey: MY_PROFILE_KEY, queryFn: myApi.profile, retry: false })
}

/**
 * สัตว์ของฉัน — **ยิงต่อเมื่อถูกจับคู่แล้ว**
 *
 * เส้นนี้คืน 401 เมื่อบัญชียังไม่ผูกกับ `owner` · ยิงไปก่อนแปลว่าได้ error ที่รู้
 * คำตอบอยู่แล้ว และหน้าจอจะกะพริบข้อความผิดขึ้นมาชั่วขณะ
 */
export function useMyPets(enabled: boolean) {
  return useQuery({ queryKey: MY_PETS_KEY, queryFn: myApi.pets, enabled, retry: false })
}

export const MY_VISITS_KEY = ['my', 'visits'] as const

/**
 * ลูกค้าสมัครเอง — **ล้าง cache ของ profile ด้วย**
 *
 * ไม่ล้าง หน้าจะยังโชว์ "ยังไม่เชื่อมบัญชี" ทั้งที่สมัครเสร็จแล้ว เพราะ `useMyProfile`
 * ยังถือคำตอบเก่าที่ `owner` เป็น `null`
 */
export function useRegisterMe() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: myApi.register,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my'] }),
  })
}

export function useSpecies(enabled: boolean) {
  return useQuery({
    queryKey: ['my', 'species'],
    queryFn: myApi.species,
    enabled,
    staleTime: 5 * 60_000,
  })
}

/** พันธุ์ของชนิดที่เลือก — ไม่เลือกชนิดก็ไม่ต้องถาม */
export function useBreeds(speciesId: number | null) {
  return useQuery({
    queryKey: ['my', 'breeds', speciesId],
    queryFn: () => myApi.breeds(speciesId),
    enabled: speciesId !== null,
    staleTime: 5 * 60_000,
  })
}

export function useCreateMyPet() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: myApi.createPet,
    onSuccess: () => qc.invalidateQueries({ queryKey: MY_PETS_KEY }),
  })
}

export function useMyVisits(page: number) {
  return useQuery({
    queryKey: [...MY_VISITS_KEY, page],
    queryFn: () => myApi.visits(page, 20),
    placeholderData: (previous) => previous,
  })
}

export function useMyVisit(id: number | null) {
  return useQuery({
    queryKey: [...MY_VISITS_KEY, 'one', id],
    queryFn: () => myApi.visit(id as number),
    enabled: id !== null,
  })
}

export function useUpdateMyPet() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...body }: Parameters<typeof myApi.updatePet>[1] & { id: number }) =>
      myApi.updatePet(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: MY_PETS_KEY }),
  })
}

export function useDeleteMyPet() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => myApi.deletePet(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: MY_PETS_KEY }),
  })
}

export function useUploadPetPhoto() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => myApi.uploadPetPhoto(id, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: MY_PETS_KEY }),
  })
}

export function useRemovePetPhoto() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => myApi.removePetPhoto(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: MY_PETS_KEY }),
  })
}
