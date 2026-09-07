import { z } from 'zod';
import type { MoneyByCurrency } from './deals.js';

// Cuántos meses hacia atrás mira la serie temporal del dashboard. 6 por defecto: entra en el ancho
// de una card sin apretujar las etiquetas y es el horizonte con el que se mira un pipeline.
export const chartRangeSchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
});

export interface StageSliceDTO {
  stage: string;
  count: number;
  amount: MoneyByCurrency;
}

export interface MonthPointDTO {
  // "2026-09", ordenable como string y sin zona horaria de por medio.
  month: string;
  created: number;
  won: number;
  lost: number;
  wonAmountPEN: string;
}

export interface SellerRowDTO {
  userId: string;
  name: string;
  active: number;
  won: number;
  wonAmountPEN: string;
}

export interface SourceSliceDTO {
  source: string;
  count: number;
}

export interface DashboardChartsDTO {
  pipelineByStage: StageSliceDTO[];
  monthly: MonthPointDTO[];
  leadsBySource: SourceSliceDTO[];
  // Solo para ADMIN. Un vendedor no puede ver la cartera de sus colegas, así que la lista le llega
  // vacía en vez de con los números del equipo.
  bySeller: SellerRowDTO[];
}
