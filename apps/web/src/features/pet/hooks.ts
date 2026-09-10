'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { breedApi, petApi, speciesApi, type PetInput } from './api'

export const PET_LIST_ROOT = ['pet', 'list'] as const
export const PET_LOOKUP_ROOT = ['pet', 'lookup'] as const
export const SPECIES_ROOT = ['species'] as const
export const BREED_ROOT = ['breed'] as const
export const PET_PAGE_SIZE = 50

export function usePets(input: {
  q: string
  ownerId: number | null
  speciesId: number | null
  includeDeceased: boolean
  page: number
}) {
  return useQuery({
    queryKey: [...PET_LIST_ROOT, input.q, input.ownerId, input.speciesId, input.includeDeceased, input.page],
    queryFn: () => petApi.list({ ...input, pageSize: PET_PAGE_SIZE }),
    placeholderData: (previous) => previous,
  })
}

/**
 * สัตว์ของเจ้าของคนหนึ่ง — สำหรับ combobox
 *
 * `enabled` ต่อเมื่อเลือกเจ้าของแล้ว · ช่องเลือกสัตว์ไม่มีความหมายก่อนหน้านั้น
 */
export function usePetOptions(ownerId: number | null) {
  return useQuery({
    queryKey: [...PET_LOOKUP_ROOT, ownerId],
    queryFn: () => petApi.lookup(ownerId!),
    enabled: ownerId !== null,
    staleTime: 60_000,
  })
}

export function usePet(id: number | null) {
  return useQuery({
    queryKey: ['pet', 'one', id],
    queryFn: () => petApi.get(id!),
    enabled: id !== null,
  })
}

function useInvalidate() {
  const qc = useQueryClient()

  return () => {
    void qc.invalidateQueries({ queryKey: PET_LIST_ROOT })
    void qc.invalidateQueries({ queryKey: PET_LOOKUP_ROOT })
    void qc.invalidateQueries({ queryKey: ['pet', 'one'] })
  }
}

export function useCreatePet() {
  const invalidate = useInvalidate()

  return useMutation({ mutationFn: (body: PetInput) => petApi.create(body), onSuccess: invalidate })
}

export function useUpdatePet() {
  const invalidate = useInvalidate()

  return useMutation({
    mutationFn: ({ id, ...body }: PetInput & { id: number }) => petApi.update(id, body),
    onSuccess: invalidate,
  })
}

export function useSetPetDeceased() {
  const invalidate = useInvalidate()

  return useMutation({
    mutationFn: ({ id, deceasedOn }: { id: number; deceasedOn: string | null }) =>
      petApi.setDeceased(id, deceasedOn),
    onSuccess: invalidate,
  })
}

export function useDeletePet() {
  const invalidate = useInvalidate()

  return useMutation({ mutationFn: (id: number) => petApi.remove(id), onSuccess: invalidate })
}

// ---- ชนิดและสายพันธุ์ ----

/** ชนิดสัตว์เปลี่ยนแทบไม่ได้เลย — เก็บไว้นาน */
export function useSpeciesOptions() {
  return useQuery({
    queryKey: [...SPECIES_ROOT, 'lookup'],
    queryFn: speciesApi.lookup,
    staleTime: 10 * 60_000,
  })
}

export function useSpeciesList() {
  return useQuery({ queryKey: [...SPECIES_ROOT, 'list'], queryFn: () => speciesApi.list() })
}

/**
 * สายพันธุ์ของชนิดที่เลือก
 *
 * **`enabled` ต่อเมื่อเลือกชนิดแล้ว** · โหลดพันธุ์ทั้งหมดทุกชนิดมาแล้วกรองในเบราว์เซอร์
 * ก็ทำได้ แต่จะโหลดของที่ไม่ได้ใช้ 90% ทุกครั้งที่เปิดฟอร์ม
 */
export function useBreedOptions(speciesId: number | null) {
  return useQuery({
    queryKey: [...BREED_ROOT, 'lookup', speciesId],
    queryFn: () => breedApi.lookup(speciesId),
    enabled: speciesId !== null,
    staleTime: 10 * 60_000,
  })
}

export function useBreedList(speciesId: number | null) {
  return useQuery({
    queryKey: [...BREED_ROOT, 'list', speciesId],
    queryFn: () => breedApi.list(speciesId),
  })
}

function useRegistryInvalidate() {
  const qc = useQueryClient()

  return () => {
    void qc.invalidateQueries({ queryKey: SPECIES_ROOT })
    void qc.invalidateQueries({ queryKey: BREED_ROOT })
  }
}

export function useCreateSpecies() {
  const invalidate = useRegistryInvalidate()

  return useMutation({ mutationFn: (name: string) => speciesApi.create(name), onSuccess: invalidate })
}

export function useUpdateSpecies() {
  const invalidate = useRegistryInvalidate()

  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => speciesApi.update(id, name),
    onSuccess: invalidate,
  })
}

export function useDeleteSpecies() {
  const invalidate = useRegistryInvalidate()

  return useMutation({ mutationFn: (id: number) => speciesApi.remove(id), onSuccess: invalidate })
}

export function useCreateBreed() {
  const invalidate = useRegistryInvalidate()

  return useMutation({
    mutationFn: ({ speciesId, name }: { speciesId: number; name: string }) =>
      breedApi.create(speciesId, name),
    onSuccess: invalidate,
  })
}

export function useUpdateBreed() {
  const invalidate = useRegistryInvalidate()

  return useMutation({
    mutationFn: ({ id, speciesId, name }: { id: number; speciesId: number; name: string }) =>
      breedApi.update(id, speciesId, name),
    onSuccess: invalidate,
  })
}

export function useDeleteBreed() {
  const invalidate = useRegistryInvalidate()

  return useMutation({ mutationFn: (id: number) => breedApi.remove(id), onSuccess: invalidate })
}
